import csv
import io
import math
import random
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from campusflow.bedrock.api.errors import (
    AppException,
    AuthorizationError,
    NotFoundError,
    ValidationError,
)
from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.rbac.service import get_user_permissions
from campusflow.domain.courses.access import (
    EXAM_BUREAU_ROLES,
    INSTITUTION_ROLES,
    assert_can_manage_offering,
    enrolled_offering_ids,
    roles_for,
    visible_offering_ids,
)
from campusflow.domain.courses.models import CourseOffering
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import (
    Exam,
    ExamAttempt,
    ExamQuestion,
    ExamResponse,
    ProctoringEvent,
)
from campusflow.domain.exams.schemas import (
    DEFAULT_AUDIO_MONITORING,
    DEFAULT_DEVICE_DETECTION,
    DEFAULT_EVIDENCE_RETENTION_DAYS,
    DEFAULT_FACE_MONITORING,
    DEFAULT_HAND_MONITORING,
    DEFAULT_INTEGRITY_SENSITIVITY,
    DEFAULT_MAX_VIOLATIONS,
    DEFAULT_MOUTH_MONITORING,
    DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS,
    DEFAULT_WARNING_COOLDOWN_SECONDS,
    DEFAULT_WARNING_POLICY,
    INTEGRITY_SENSITIVITIES,
    MAX_OBSTRUCTION_THRESHOLD_SECONDS,
    MIN_OBSTRUCTION_THRESHOLD_SECONDS,
    WARNING_POLICIES,
    WARNING_POLICY_REMOVE,
    BatchSaveAnswersRequest,
    ExamAttemptResponseDetail,
    ExamCreate,
    ExamDeliveryResponse,
    ExamQuestionBatchAdd,
    ExamQuestionGenerate,
    ExamQuestionResponse,
    ExamQuestionStudentDelivery,
    ExamStudentConfig,
    ExamStudentResponse,
    ExamUpdate,
    GradeSingleResponseRequest,
    MultiSectionExamCreate,
    ProctoringEventCreate,
    ProctoringEventResponse,
    ProctoringStatusResponse,
    StudentExamResultResponse,
    integrity_dwell_ms,
)
from campusflow.domain.exams.schemas import (
    ExamResponse as ExamResponseSchema,
)
from campusflow.domain.notifications.service import (
    create_notification,
    send_notification_email_if_enabled,
)
from campusflow.domain.question_banks.models import Question, QuestionBank
from campusflow.domain.users.models import User


def get_utc_now() -> datetime:
    return datetime.now(UTC)


def normalize_datetime(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


# ── Exam CRUD & Authoring ───────────────────────────────────────────────────


async def create_exam(
    db: AsyncSession,
    payload: ExamCreate,
    current_user: User,
) -> Exam:
    offering = await db.get(CourseOffering, payload.course_offering_id)
    if not offering:
        raise NotFoundError("Course offering not found")

    start_win = normalize_datetime(payload.start_window)
    end_win = normalize_datetime(payload.end_window)

    if end_win <= start_win:
        raise HTTPException(
            status_code=400, detail="End window must be strictly after start window."
        )

    exam = Exam(
        course_offering_id=payload.course_offering_id,
        title=payload.title,
        description=payload.description,
        exam_type=payload.exam_type,
        total_marks=payload.total_marks,
        passing_marks=payload.passing_marks,
        duration_minutes=payload.duration_minutes,
        start_window=start_win,
        end_window=end_win,
        instructions=payload.instructions,
        config=payload.config
        or {
            "shuffle_questions": False,
            "shuffle_options": False,
            "auto_grade": True,
            "show_results_immediately": False,
            "proctoring_enabled": True,
            "max_violations": DEFAULT_MAX_VIOLATIONS,
            "warning_policy": DEFAULT_WARNING_POLICY,
            "device_detection_enabled": DEFAULT_DEVICE_DETECTION,
            "obstruction_threshold_seconds": DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS,
        },
        status=payload.status,
        created_by_id=current_user.id,
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.create",
        resource_type="exam",
        resource_id=str(exam.id),
        extra_data={"title": exam.title, "course_offering_id": str(exam.course_offering_id)},
    )
    return exam


async def create_exam_for_offerings(
    db: AsyncSession,
    payload: MultiSectionExamCreate,
    current_user: User,
) -> list[Exam]:
    """Create one assessment across one or more sections the caller manages.

    Section ids are de-duplicated preserving order, and **each** is validated
    against the caller's teaching (or administrative) scope *before* any row is
    written. A request that swaps in an unrelated section is refused and nothing
    is created — the whole operation is one transaction, so a partial assessment
    can never exist. When more than one section is targeted the rows share a
    ``series_id``.
    """
    offering_ids = list(dict.fromkeys(payload.course_offering_ids))

    start_win = normalize_datetime(payload.start_window)
    end_win = normalize_datetime(payload.end_window)
    if end_win <= start_win:
        raise HTTPException(
            status_code=400, detail="End window must be strictly after start window."
        )

    offerings: list[CourseOffering] = []
    for offering_id in offering_ids:
        offering = await db.get(CourseOffering, offering_id)
        if not offering:
            raise NotFoundError("Course offering not found")
        # Every section must be one the caller is authorised to assess, checked
        # individually. This is the guard that stops Section A's paper from being
        # created against Section B by a direct API call.
        await assert_can_manage_offering(
            db,
            current_user,
            offering_id,
            purpose="section assessment authoring",
            allow_exam_bureau=True,
        )
        offerings.append(offering)

    series_id = uuid.uuid4() if len(offerings) > 1 else None
    config = payload.config or {
        "shuffle_questions": False,
        "shuffle_options": False,
        "auto_grade": True,
        "show_results_immediately": False,
        "proctoring_enabled": True,
        "max_violations": DEFAULT_MAX_VIOLATIONS,
        "warning_policy": DEFAULT_WARNING_POLICY,
        "device_detection_enabled": DEFAULT_DEVICE_DETECTION,
        "obstruction_threshold_seconds": DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS,
    }

    created: list[Exam] = []
    for offering in offerings:
        exam = Exam(
            course_offering_id=offering.id,
            title=payload.title,
            description=payload.description,
            exam_type=payload.exam_type,
            total_marks=payload.total_marks,
            passing_marks=payload.passing_marks,
            duration_minutes=payload.duration_minutes,
            start_window=start_win,
            end_window=end_win,
            instructions=payload.instructions,
            config=config,
            status=payload.status,
            series_id=series_id,
            created_by_id=current_user.id,
        )
        db.add(exam)
        created.append(exam)

    # One flush, one audit record, one commit: the assessment exists for all its
    # sections or for none of them.
    await db.flush()
    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.create_multi_section",
        resource_type="exam",
        resource_id=str(created[0].id),
        extra_data={
            "title": payload.title,
            "series_id": str(series_id) if series_id else None,
            "section_count": len(created),
            "exam_ids": [str(e.id) for e in created],
            "course_offering_ids": [str(e.course_offering_id) for e in created],
        },
    )
    await db.commit()
    for exam in created:
        await db.refresh(exam)
    return created


def serialize_exam_with_questions(
    exam: Exam, q_list: list[ExamQuestionResponse]
) -> ExamResponseSchema:
    course_title = None
    course_code = None
    if exam.course_offering and exam.course_offering.course:
        course_title = exam.course_offering.course.title
        course_code = exam.course_offering.course.code

    return ExamResponseSchema(
        id=exam.id,
        course_offering_id=exam.course_offering_id,
        course_title=course_title,
        course_code=course_code,
        series_id=exam.series_id,
        title=exam.title,
        description=exam.description,
        exam_type=exam.exam_type,
        total_marks=exam.total_marks,
        passing_marks=exam.passing_marks,
        duration_minutes=exam.duration_minutes,
        start_window=exam.start_window,
        end_window=exam.end_window,
        instructions=exam.instructions,
        config=exam.config or {},
        status=exam.status,
        created_by_id=exam.created_by_id,
        created_at=exam.created_at,
        questions_count=len(exam.questions),
        questions=q_list,
    )


# ── Audience separation ─────────────────────────────────────────────────────
#
# Two audiences read examinations. Staff (authoring, grading, proctoring) receive
# `ExamResponse`, which carries answer keys and grading internals. Candidates
# receive `ExamStudentResponse`, which carries metadata only. Nothing may hand a
# staff payload to a candidate, and no candidate-facing route may return
# `is_correct`, `explanation` or another student's work.

STAFF_EXAM_PERMISSIONS = frozenset({"exams:create", "exams:grade", "exams:proctor_view"})

# Exam states a candidate may see. Drafts are invisible to candidates.
STUDENT_VISIBLE_EXAM_STATUSES = frozenset({"scheduled", "live", "completed", "graded", "published"})


def build_student_exam(exam: Exam, questions_count: int) -> ExamStudentResponse:
    """Project an exam into the candidate-safe shape."""
    course = exam.course_offering.course if exam.course_offering else None
    config = exam.config or {}
    try:
        max_attempts = max(1, int(config.get("max_attempts", 1)))
    except (TypeError, ValueError):
        max_attempts = 1
    return ExamStudentResponse(
        id=exam.id,
        course_offering_id=exam.course_offering_id,
        course_title=course.title if course else None,
        course_code=course.code if course else None,
        title=exam.title,
        description=exam.description,
        exam_type=exam.exam_type,
        total_marks=exam.total_marks,
        passing_marks=exam.passing_marks,
        duration_minutes=exam.duration_minutes,
        start_window=exam.start_window,
        end_window=exam.end_window,
        instructions=exam.instructions,
        status=exam.status,
        questions_count=questions_count,
        config=ExamStudentConfig(
            proctoring_enabled=bool(config.get("proctoring_enabled", True)),
        max_attempts=max_attempts,
        max_violations=_resolve_max_violations(exam),
        warning_cooldown_seconds=PROCTORING_WARNING_COOLDOWN_SECONDS,
        warning_policy=_resolve_warning_policy(exam),
            device_detection_enabled=_resolve_device_detection(exam),
            obstruction_threshold_seconds=_resolve_obstruction_threshold(exam),
            evidence_retention_days=_evidence_retention_days(),
            show_results_immediately=bool(config.get("show_results_immediately", False)),
            demo=bool(config.get("demo", False)),
            **_integrity_narrative(exam),
        ),
    )


async def is_exam_staff(db: AsyncSession, user: User) -> bool:
    """True when the user holds any examination-staff capability."""
    roles = await roles_for(db, user)
    if roles & (INSTITUTION_ROLES | EXAM_BUREAU_ROLES):
        return True
    perms = await get_user_permissions(db, user.id)
    return bool(perms & STAFF_EXAM_PERMISSIONS)


async def _exam_row(db: AsyncSession, exam_id: uuid.UUID) -> Exam:
    """Load one exam with the offering/course joined (safe for async access)."""
    res = await db.execute(
        select(Exam)
        .where(Exam.id == exam_id)
        .options(selectinload(Exam.course_offering).selectinload(CourseOffering.course))
    )
    exam = res.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam not found")
    return exam


async def _question_counts(db: AsyncSession, exam_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not exam_ids:
        return {}
    res = await db.execute(
        select(ExamQuestion.exam_id, func.count(ExamQuestion.id))
        .where(ExamQuestion.exam_id.in_(exam_ids))
        .group_by(ExamQuestion.exam_id)
    )
    return {row[0]: row[1] for row in res.all()}


async def _assert_can_manage_exam(
    db: AsyncSession,
    exam: Exam,
    user: User,
    *,
    purpose: str,
    allow_exam_bureau: bool = True,
) -> None:
    """Authoring/grading scope for a single exam.

    The author always manages their own exam, which also covers examinations
    created before a teaching assignment existed.

    ``allow_exam_bureau`` is opt-in per call site. The examination bureau
    assembles and invigilates papers institution-wide, but grading is classroom
    work: cohort marks, the results CSV and result publication pass
    ``allow_exam_bureau=False`` so a bureau capability can never be widened into
    the gradebook (see the examination-bureau rule in AGENTS.md).
    """
    if exam.created_by_id is not None and exam.created_by_id == user.id:
        return
    await assert_can_manage_offering(
        db,
        user,
        exam.course_offering_id,
        purpose=purpose,
        allow_exam_bureau=allow_exam_bureau,
    )


async def _assert_can_manage_attempt(
    db: AsyncSession,
    attempt_id: uuid.UUID,
    user: User,
    *,
    purpose: str,
    allow_exam_bureau: bool = False,
) -> None:
    """Cohort boundary for one attempt, resolved through its exam's offering.

    Every staff-facing attempt surface — the grading queue, the response
    listing, the integrity timeline and the resumption path — resolves scope
    here. A permission tells us *what* the caller may do (``exams:grade``,
    ``exams:proctor_view``); only this tells us *whose* candidate they may do
    it to. Without it, any holder could read or regrade another offering's
    cohort — including camera frames — by supplying an attempt id.
    """
    res = await db.execute(
        select(ExamAttempt)
        .where(ExamAttempt.id == attempt_id)
        .options(selectinload(ExamAttempt.exam))
    )
    attempt = res.scalar_one_or_none()
    if not attempt:
        raise NotFoundError("Exam attempt not found")
    await _assert_can_manage_exam(
        db,
        attempt.exam,
        user,
        purpose=purpose,
        allow_exam_bureau=allow_exam_bureau,
    )


async def get_exam_for_staff(
    db: AsyncSession, exam_id: uuid.UUID, current_user: User
) -> ExamResponseSchema:
    """Staff view of one exam, scoped to the caller's offerings."""
    exam = await _exam_row(db, exam_id)
    await _assert_can_manage_exam(db, exam, current_user, purpose="exam authoring and grading")
    return await get_exam(db, exam_id)


async def list_exams_for_staff(
    db: AsyncSession,
    current_user: User,
    course_offering_id: uuid.UUID | None = None,
    status: str | None = None,
) -> list[ExamResponseSchema]:
    """Staff exam list, limited to offerings the caller may administer."""
    permitted = await visible_offering_ids(db, current_user, allow_exam_bureau=True)
    exams = await list_exams(db, course_offering_id=course_offering_id, status=status)
    if permitted is None:
        return exams
    return [e for e in exams if e.course_offering_id in permitted]


async def list_student_exams(
    db: AsyncSession,
    student_user: User,
    course_offering_id: uuid.UUID | None = None,
    status: str | None = None,
) -> list[ExamStudentResponse]:
    """Candidate exam list: enrolled offerings only, non-draft states only.

    Each exam is annotated with the candidate's own latest attempt status so the
    student surface can decide between "Take Exam", "Continue attempt", and
    "View Results".
    """
    # Server-owned timing: close any of this candidate's expired attempts before
    # reporting their state, so an abandoned attempt never shows as running.
    await reconcile_expired_attempts(db, student_user=student_user)

    if status is not None and status not in STUDENT_VISIBLE_EXAM_STATUSES:
        # A candidate asking for drafts (or an unknown state) sees nothing.
        return []

    enrolled = await enrolled_offering_ids(db, student_user)
    if not enrolled:
        return []

    query = (
        select(Exam)
        .where(
            Exam.course_offering_id.in_(enrolled),
            Exam.status.in_(STUDENT_VISIBLE_EXAM_STATUSES),
        )
        .options(selectinload(Exam.course_offering).selectinload(CourseOffering.course))
        .order_by(desc(Exam.created_at))
    )
    if course_offering_id:
        query = query.where(Exam.course_offering_id == course_offering_id)
    if status:
        query = query.where(Exam.status == status)

    rows = list((await db.execute(query)).scalars().all())
    counts = await _question_counts(db, [r.id for r in rows])
    results = [build_student_exam(r, counts.get(r.id, 0)) for r in rows]

    # Attach each candidate's latest attempt status (candidate-safe only).
    exam_ids = [r.id for r in rows]
    if exam_ids:
        attempt_rows = await db.execute(
            select(ExamAttempt)
            .where(
                ExamAttempt.exam_id.in_(exam_ids),
                ExamAttempt.student_id == student_user.id,
            )
            .order_by(desc(ExamAttempt.attempt_number))
        )
        latest_by_exam: dict[uuid.UUID, str] = {}
        attempts_by_exam: dict[uuid.UUID, int] = {}
        for att in attempt_rows.scalars().all():
            attempts_by_exam[att.exam_id] = attempts_by_exam.get(att.exam_id, 0) + 1
            if att.exam_id not in latest_by_exam:
                latest_by_exam[att.exam_id] = att.status
        for exam in results:
            exam.latest_attempt_status = latest_by_exam.get(exam.id)
            exam.attempts_used = attempts_by_exam.get(exam.id, 0)

    return results


async def get_exam_brief(
    db: AsyncSession, exam_id: uuid.UUID, current_user: User
) -> ExamStudentResponse:
    """Candidate-safe brief for one exam.

    Raises ``NotFoundError`` rather than ``AuthorizationError`` when a candidate
    may not see the exam, so direct URLs cannot be used to enumerate exams in
    other offerings or still in draft.

    For candidates, the brief includes the caller's own latest attempt status
    (when an attempt exists) so the assessment-taking surface can decide whether
    to offer "Begin assessment", "Resume attempt", or redirect to results. This
    is safe: only the caller's own attempt status is ever returned.
    """
    exam = await _exam_row(db, exam_id)
    roles = await roles_for(db, current_user)
    if not (roles & (INSTITUTION_ROLES | EXAM_BUREAU_ROLES)):
        if exam.status not in STUDENT_VISIBLE_EXAM_STATUSES:
            raise NotFoundError("Exam not found")
        if exam.course_offering_id not in await enrolled_offering_ids(db, current_user):
            raise NotFoundError("Exam not found")

    counts = await _question_counts(db, [exam.id])
    brief = build_student_exam(exam, counts.get(exam.id, 0))

    # Attach the caller's own latest attempt status (candidate-safe only).
    if not (roles & (INSTITUTION_ROLES | EXAM_BUREAU_ROLES)):
        att_res = await db.execute(
            select(ExamAttempt.status)
            .where(
                ExamAttempt.exam_id == exam.id,
                ExamAttempt.student_id == current_user.id,
            )
            .order_by(desc(ExamAttempt.attempt_number))
            .limit(1)
        )
        row = att_res.scalar_one_or_none()
        if row is not None:
            brief.latest_attempt_status = row

        used_res = await db.execute(
            select(func.count(ExamAttempt.id)).where(
                ExamAttempt.exam_id == exam.id,
                ExamAttempt.student_id == current_user.id,
            )
        )
        brief.attempts_used = int(used_res.scalar_one() or 0)

    return brief


async def get_exam(db: AsyncSession, exam_id: uuid.UUID) -> ExamResponseSchema:
    query = (
        select(Exam)
        .where(Exam.id == exam_id)
        .options(
            selectinload(Exam.course_offering).selectinload(CourseOffering.course),
            selectinload(Exam.questions)
            .selectinload(ExamQuestion.question)
            .selectinload(Question.options),
        )
        # The identity map may already hold this exam with a question
        # collection loaded before a mutation (generation, add/remove); the
        # response must always reflect the database, not that cached list.
        .execution_options(populate_existing=True)
    )
    res = await db.execute(query)
    exam = res.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam not found")

    q_list = []
    for eq in exam.questions:
        q = eq.question
        q_list.append(
            ExamQuestionResponse(
                id=eq.id,
                exam_id=eq.exam_id,
                section_id=eq.section_id,
                question_id=eq.question_id,
                sort_order=eq.sort_order,
                marks=eq.marks_override if eq.marks_override is not None else q.marks,
                negative_marks=eq.negative_marks_override
                if eq.negative_marks_override is not None
                else q.negative_marks,
                question_type=q.question_type,
                difficulty=q.difficulty,
                body=q.body,
                explanation=q.explanation,
                options=[
                    {
                        "id": o.id,
                        "question_id": o.question_id,
                        "label": o.label,
                        "body": o.body,
                        "is_correct": o.is_correct,
                        "sort_order": o.sort_order,
                    }
                    for o in q.options
                ],
            )
        )

    return serialize_exam_with_questions(exam, q_list)


async def list_exams(
    db: AsyncSession,
    course_offering_id: uuid.UUID | None = None,
    status: str | None = None,
) -> list[ExamResponseSchema]:
    query = (
        select(Exam)
        .options(
            selectinload(Exam.course_offering).selectinload(CourseOffering.course),
            selectinload(Exam.questions)
            .selectinload(ExamQuestion.question)
            .selectinload(Question.options),
        )
        .order_by(desc(Exam.created_at))
    )
    if course_offering_id:
        query = query.where(Exam.course_offering_id == course_offering_id)
    if status:
        query = query.where(Exam.status == status)

    res = await db.execute(query)
    exams = list(res.scalars().all())

    results = []
    for exam in exams:
        q_list = []
        for eq in exam.questions:
            q = eq.question
            q_list.append(
                ExamQuestionResponse(
                    id=eq.id,
                    exam_id=eq.exam_id,
                    section_id=eq.section_id,
                    question_id=eq.question_id,
                    sort_order=eq.sort_order,
                    marks=eq.marks_override if eq.marks_override is not None else q.marks,
                    negative_marks=eq.negative_marks_override
                    if eq.negative_marks_override is not None
                    else q.negative_marks,
                    question_type=q.question_type,
                    difficulty=q.difficulty,
                    body=q.body,
                    explanation=q.explanation,
                    options=[
                        {
                            "id": o.id,
                            "question_id": o.question_id,
                            "label": o.label,
                            "body": o.body,
                            "is_correct": o.is_correct,
                            "sort_order": o.sort_order,
                        }
                        for o in q.options
                    ],
                )
            )

        results.append(serialize_exam_with_questions(exam, q_list))

    return results


async def update_exam(
    db: AsyncSession,
    exam_id: uuid.UUID,
    payload: ExamUpdate,
    current_user: User,
) -> Exam:
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise NotFoundError("Exam not found")

    await _assert_can_manage_exam(db, exam, current_user, purpose="exam authoring")

    update_dict = payload.model_dump(exclude_unset=True)
    if "start_window" in update_dict and update_dict["start_window"]:
        update_dict["start_window"] = normalize_datetime(update_dict["start_window"])
    if "end_window" in update_dict and update_dict["end_window"]:
        update_dict["end_window"] = normalize_datetime(update_dict["end_window"])

    for field, value in update_dict.items():
        setattr(exam, field, value)

    # The change and the record of who made it are written in one transaction, so
    # an audited edit can never be persisted without its audit entry.
    await db.flush()
    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.update",
        resource_type="exam",
        resource_id=str(exam.id),
        changes=update_dict,
    )
    await db.commit()
    await db.refresh(exam)
    return exam


async def delete_exam(
    db: AsyncSession,
    exam_id: uuid.UUID,
    current_user: User,
) -> None:
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise NotFoundError("Exam not found")

    await _assert_can_manage_exam(db, exam, current_user, purpose="exam authoring")

    await db.delete(exam)
    await db.commit()

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.delete",
        resource_type="exam",
        resource_id=str(exam.id),
    )


# ── Exam Questions Management ───────────────────────────────────────────────


async def add_questions_to_exam(
    db: AsyncSession,
    exam_id: uuid.UUID,
    payload: ExamQuestionBatchAdd,
    current_user: User,
) -> list[ExamQuestion]:
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise NotFoundError("Exam not found")

    await _assert_can_manage_exam(db, exam, current_user, purpose="exam authoring")

    # Get current max sort_order
    curr_order_res = await db.execute(
        select(func.coalesce(func.max(ExamQuestion.sort_order), -1)).where(
            ExamQuestion.exam_id == exam_id
        )
    )
    current_max_order = curr_order_res.scalar_one()

    added: list[ExamQuestion] = []
    for item in payload.questions:
        q = await db.get(Question, item.question_id)
        if not q:
            continue

        current_max_order += 1
        eq = ExamQuestion(
            exam_id=exam_id,
            section_id=item.section_id,
            question_id=item.question_id,
            sort_order=item.sort_order if item.sort_order else current_max_order,
            marks_override=item.marks_override,
            negative_marks_override=item.negative_marks_override,
        )
        db.add(eq)
        added.append(eq)

    await db.commit()

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.add_questions",
        resource_type="exam",
        resource_id=str(exam.id),
        extra_data={"added_count": len(added)},
    )
    return added


async def remove_question_from_exam(
    db: AsyncSession,
    exam_id: uuid.UUID,
    exam_question_id: uuid.UUID,
    current_user: User,
) -> None:
    eq = await db.get(ExamQuestion, exam_question_id)
    if not eq or eq.exam_id != exam_id:
        raise NotFoundError("Exam question not found")

    await _assert_can_manage_exam(
        db, await _exam_row(db, exam_id), current_user, purpose="exam authoring"
    )

    await db.delete(eq)
    await db.commit()

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.remove_question",
        resource_type="exam",
        resource_id=str(exam_id),
        extra_data={"removed_exam_question_id": str(exam_question_id)},
    )


async def generate_exam_questions(
    db: AsyncSession,
    exam_id: uuid.UUID,
    payload: "ExamQuestionGenerate",
    current_user: User,
) -> list[ExamQuestion]:
    """Build a random paper from the syllabus scope the examiner selects.

    The examiner either points at specific question banks (``question_bank_ids``)
    or leaves them empty, in which case every bank that belongs to the offering's
    course or its department is treated as the syllabus. Within that scope the
    caller can narrow by syllabus topic (question tags), difficulty and type, and
    the server draws a random, de-duplicated selection.

    Explicit, hand-picked papers remain available through
    ``add_questions_to_exam``; this is the "throw a random exam" path.
    """
    res = await db.execute(
        select(Exam)
        .where(Exam.id == exam_id)
        .options(
            selectinload(Exam.course_offering).selectinload(CourseOffering.course),
        )
    )
    exam = res.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam not found")

    # Read the current paper straight from the table: the ORM relationship may
    # hold a stale (or freshly emptied) collection inside this session, and the
    # decisions below — de-duplication, sort order, replacement — must reflect
    # what is actually stored.
    existing_rows = list(
        (await db.execute(select(ExamQuestion).where(ExamQuestion.exam_id == exam.id)))
        .scalars()
        .all()
    )

    await _assert_can_manage_exam(db, exam, current_user, purpose="exam authoring")

    offering = exam.course_offering
    course = offering.course if offering is not None else None
    if course is None:
        raise ValidationError("Exam offering has no course attached.")

    bank_query = select(QuestionBank)
    if payload.question_bank_ids:
        bank_query = bank_query.where(QuestionBank.id.in_(payload.question_bank_ids))
    else:
        bank_query = bank_query.where(
            or_(
                QuestionBank.course_id == course.id,
                QuestionBank.department_id == course.department_id,
            )
        )
    banks = (await db.execute(bank_query)).scalars().all()
    bank_ids = [b.id for b in banks]
    if not bank_ids:
        raise ValidationError("No question banks matched the selected syllabus.")

    qres = await db.execute(
        select(Question)
        .where(Question.question_bank_id.in_(bank_ids))
        .options(selectinload(Question.options))
    )
    questions = list(qres.scalars().all())

    wanted_tags = {t.strip().lower() for t in payload.tags if t and t.strip()}
    wanted_difficulties = {d.strip().lower() for d in payload.difficulties if d}
    wanted_types = {t.strip().lower() for t in payload.question_types if t}
    already_on_paper = (
        set() if payload.replace_existing else {eq.question_id for eq in existing_rows}
    )

    candidates = [
        q
        for q in questions
        if q.id not in already_on_paper
        and (not wanted_difficulties or q.difficulty.lower() in wanted_difficulties)
        and (not wanted_types or q.question_type.lower() in wanted_types)
        and (
            not wanted_tags
            or any(str(tag).strip().lower() in wanted_tags for tag in (q.tags or []))
        )
    ]
    if not candidates:
        raise ValidationError(
            "No questions matched the selected syllabus topics, difficulty and "
            "question type. Widen the selection or add questions to the bank."
        )

    count = payload.question_count or len(candidates)
    chosen = random.sample(candidates, min(count, len(candidates)))
    if payload.shuffle:
        random.shuffle(chosen)

    if payload.replace_existing and existing_rows:
        for existing in existing_rows:
            await db.delete(existing)
        await db.flush()
        current_max_order = -1
    else:
        current_max_order = max((eq.sort_order for eq in existing_rows), default=-1)

    added: list[ExamQuestion] = []
    for question in chosen:
        current_max_order += 1
        eq = ExamQuestion(
            exam_id=exam.id,
            question_id=question.id,
            sort_order=current_max_order,
        )
        db.add(eq)
        added.append(eq)
    await db.commit()
    for eq in added:
        await db.refresh(eq)

    # The paper's marks must describe what the candidate will actually sit, so
    # the exam total is recomputed from the final selection.
    total_res = await db.execute(
        select(ExamQuestion)
        .where(ExamQuestion.exam_id == exam.id)
        .options(selectinload(ExamQuestion.question))
    )
    total = sum(
        (eq.marks_override if eq.marks_override is not None else eq.question.marks)
        for eq in total_res.scalars().all()
    )
    exam.total_marks = total
    if exam.passing_marks is not None and exam.passing_marks > total:
        exam.passing_marks = round(total * 0.4, 2)
    await db.commit()

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.generate_questions",
        resource_type="exam",
        resource_id=str(exam.id),
        extra_data={
            "generated_count": len(added),
            "replaced_existing": payload.replace_existing,
            "bank_ids": [str(b) for b in bank_ids],
            "tags": sorted(wanted_tags),
            "difficulties": sorted(wanted_difficulties),
            "question_types": sorted(wanted_types),
            "total_marks": total,
        },
    )
    await db.commit()
    return added


# ── Exam Delivery & Taking (Student) ────────────────────────────────────────


async def start_or_resume_attempt(
    db: AsyncSession,
    exam_id: uuid.UUID,
    student_user: User,
    client_ip: str | None = None,
    user_agent: str | None = None,
    browser_fingerprint: str | None = None,
) -> ExamDeliveryResponse:
    query = (
        select(Exam)
        .where(Exam.id == exam_id)
        .options(
            selectinload(Exam.questions)
            .selectinload(ExamQuestion.question)
            .selectinload(Question.options),
        )
    )
    res = await db.execute(query)
    exam = res.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam not found")

    now = get_utc_now()
    start_win = normalize_datetime(exam.start_window)
    end_win = normalize_datetime(exam.end_window)

    # Close this candidate's expired attempts first: a stuck in-progress attempt
    # must never be resumed past its window or its permitted duration.
    await reconcile_expired_attempts(db, student_user=student_user)

    # Allow a small early tolerance so clock skew does not block a legitimately
    # open exam window (the server is authoritative once the attempt starts).
    effective_start = start_win - timedelta(seconds=START_WINDOW_EARLY_TOLERANCE_SECONDS)
    if now < effective_start:
        raise HTTPException(
            status_code=400,
            detail=f"Exam has not started yet. Available from {start_win.isoformat()}.",
        )
    if now > end_win:
        raise HTTPException(
            status_code=400,
            detail=(
                "Exam testing window has concluded. Any unfinished attempt for this "
                "examination has been submitted automatically."
            ),
        )

    # Check student enrollment in the course offering
    enroll_res = await db.execute(
        select(Enrollment).where(
            Enrollment.course_offering_id == exam.course_offering_id,
            Enrollment.student_id == student_user.id,
            Enrollment.status == "enrolled",
        )
    )
    if not enroll_res.scalar_one_or_none():
        raise AuthorizationError("You are not actively enrolled in this course offering.")

    # Check for active in-progress attempt
    att_res = await db.execute(
        select(ExamAttempt)
        .where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.student_id == student_user.id,
        )
        .options(selectinload(ExamAttempt.responses))
        .order_by(desc(ExamAttempt.attempt_number))
    )
    existing_attempts = list(att_res.scalars().all())

    active_attempt = next((a for a in existing_attempts if a.status == "in_progress"), None)
    locked_attempt = next((a for a in existing_attempts if a.status == "locked_violation"), None)
    if locked_attempt:
        raise HTTPException(
            status_code=423,
            detail="Exam session is locked due to integrity violations. Awaiting faculty authorization to resume.",
        )

    if active_attempt:
        # Check elapsed time
        start_time = normalize_datetime(active_attempt.started_at)
        elapsed_seconds = (now - start_time).total_seconds()
        total_seconds_allowed = exam.duration_minutes * 60

        if elapsed_seconds > total_seconds_allowed + 60:
            # Overtime: Auto-submit active attempt
            await submit_attempt(db, active_attempt.id, student_user, is_auto_submit=True)
            raise HTTPException(
                status_code=400,
                detail="Exam duration has expired. Your responses have been automatically submitted.",
            )

        attempt = active_attempt
    else:
        # Check max attempts
        max_att = (exam.config or {}).get("max_attempts", 1)
        if len(existing_attempts) >= max_att:
            raise HTTPException(status_code=400, detail="Maximum exam attempts reached.")

        attempt = ExamAttempt(
            exam_id=exam_id,
            student_id=student_user.id,
            attempt_number=len(existing_attempts) + 1,
            started_at=now,
            status="in_progress",
            ip_address=client_ip,
            user_agent=user_agent,
            browser_fingerprint=browser_fingerprint,
        )
        db.add(attempt)
        await db.commit()
        await db.refresh(attempt)

        await record_audit_event(
            db=db,
            user_id=student_user.id,
            user_email=student_user.email,
            action="exam.attempt_start",
            resource_type="exam_attempt",
            resource_id=str(attempt.id),
            extra_data={"attempt_number": attempt.attempt_number, "exam_id": str(exam.id)},
        )

    # Calculate remaining seconds
    start_time = normalize_datetime(attempt.started_at)
    elapsed = (now - start_time).total_seconds()
    remaining = max(0, int((exam.duration_minutes * 60) - elapsed))

    # Build student delivery questions (without revealing is_correct!). Freeze the
    # randomized mapping on the attempt so an answer saved as a canonical option
    # label remains gradeable and resumes with exactly the same display order.
    # The attempt variant, not process-global RNG state, is authoritative when
    # a candidate refreshes, resumes, or returns after an exam edit.
    if exam.status == "draft" and not await is_exam_staff(db, student_user):
        # Draft examinations are invisible to candidates even inside the window.
        raise NotFoundError("Exam not found")

    config = exam.config or {}
    shuffle_questions = config.get("shuffle_questions") is True
    shuffle_options = config.get("shuffle_options") is True
    variant = dict(attempt.delivery_variant or {})
    if not variant:
        # A legacy in-progress attempt may have answers stored only in browser
        # storage, without a persisted display mapping. Preserve its original
        # paper on the first post-migration resume; shuffle only attempts created
        # after this migration, so a saved answer cannot silently change meaning.
        if active_attempt is not None:
            shuffle_questions = False
            shuffle_options = False
        # Generate an unpredictable per-attempt order once, then persist it; the
        # UUID is public in the delivery response and must not reveal the RNG seed.
        rng = random.SystemRandom()
        question_ids = [str(eq.id) for eq in exam.questions]
        if shuffle_questions and len(question_ids) > 1:
            original_question_ids = list(question_ids)
            rng.shuffle(question_ids)
            if question_ids == original_question_ids:
                question_ids = question_ids[1:] + question_ids[:1]
        option_orders: dict[str, list[str]] = {}
        for eq in exam.questions:
            labels = [
                option.label
                for option in sorted(eq.question.options, key=lambda option: option.sort_order)
            ]
            if shuffle_options and len(labels) > 1:
                original_labels = list(labels)
                rng.shuffle(labels)
                if labels == original_labels:
                    labels = labels[1:] + labels[:1]
            option_orders[str(eq.id)] = labels
        variant = {
            "shuffle_questions": shuffle_questions,
            "shuffle_options": shuffle_options,
            "question_order": question_ids,
            "option_orders": option_orders,
            "option_display_to_canonical": {},
        }
    else:
        # The configuration and mappings belong to the attempt: changing the
        # exam after a candidate begins must not silently change their paper.
        shuffle_questions = variant.get("shuffle_questions", shuffle_questions) is True
        shuffle_options = variant.get("shuffle_options", shuffle_options) is True
        variant.setdefault("question_order", [str(eq.id) for eq in exam.questions])
        variant.setdefault("option_orders", {})
        variant.setdefault("option_display_to_canonical", {})

    question_order = variant.get("question_order", [])
    order_index = {question_id: index for index, question_id in enumerate(question_order)}
    exam_questions = sorted(
        exam.questions,
        key=lambda eq: order_index.get(str(eq.id), len(order_index) + eq.sort_order),
    )
    option_orders = variant.get("option_orders", {})
    display_maps = variant.get("option_display_to_canonical", {})

    delivery_questions: list[ExamQuestionStudentDelivery] = []
    for eq in exam_questions:
        q = eq.question
        label_order = option_orders.get(str(eq.id), [])
        labels_index = {label: index for index, label in enumerate(label_order)}
        ordered_options = sorted(
            q.options,
            key=lambda option: labels_index.get(option.label, len(labels_index) + option.sort_order),
        )
        display_labels = (
            [chr(ord("A") + index) for index in range(len(ordered_options))]
            if shuffle_options
            else [option.label for option in ordered_options]
        )
        canonical_by_display = dict(
            zip(display_labels, (option.label for option in ordered_options), strict=True)
        )
        display_maps[str(eq.id)] = canonical_by_display
        delivery_questions.append(
            ExamQuestionStudentDelivery(
                id=eq.id,
                question_id=eq.question_id,
                sort_order=eq.sort_order,
                marks=eq.marks_override if eq.marks_override is not None else q.marks,
                negative_marks=eq.negative_marks_override
                if eq.negative_marks_override is not None
                else q.negative_marks,
                question_type=q.question_type,
                body=q.body,
                options=[
                    {"label": display_labels[index], "body": option.body}
                    for index, option in enumerate(ordered_options)
                ],
            )
        )

    variant["option_display_to_canonical"] = display_maps
    attempt.delivery_variant = variant
    await db.commit()

    # Saved responses map
    saved_answers: dict[str, dict[str, Any]] = {}
    saved_responses = active_attempt.responses if active_attempt and active_attempt.responses else attempt.responses
    for response in saved_responses:
        answer_data = dict(response.answer_data or {})
        canonical_to_display = {
            canonical: display
            for display, canonical in display_maps.get(str(response.exam_question_id), {}).items()
        }
        selected = answer_data.get("selected")
        if isinstance(selected, list):
            answer_data["selected"] = [canonical_to_display.get(str(label), label) for label in selected]
        elif selected is not None:
            answer_data["selected"] = canonical_to_display.get(str(selected), selected)
        saved_answers[str(response.exam_question_id)] = {
            "answer_data": answer_data,
            "flagged_for_review": response.flagged_for_review,
        }

    return ExamDeliveryResponse(
        attempt_id=attempt.id,
        exam_id=exam.id,
        exam_title=exam.title,
        instructions=exam.instructions,
        started_at=attempt.started_at,
        duration_minutes=exam.duration_minutes,
        remaining_seconds=remaining,
        status=attempt.status,
        proctoring_enabled=bool((exam.config or {}).get("proctoring_enabled", True)),
        warning_policy=_resolve_warning_policy(exam),
        violations_count=attempt.proctor_violations_count,
        max_violations=_resolve_max_violations(exam),
        warning_cooldown_seconds=PROCTORING_WARNING_COOLDOWN_SECONDS,
        device_detection_enabled=_resolve_device_detection(exam),
        obstruction_threshold_seconds=_resolve_obstruction_threshold(exam),
        evidence_retention_days=_evidence_retention_days(),
        demo=bool((exam.config or {}).get("demo", False)),
        shuffle_questions=shuffle_questions,
        shuffle_options=shuffle_options,
        **_integrity_narrative(exam),
        questions=delivery_questions,
        saved_answers=saved_answers,
    )


async def save_answers_batch(
    db: AsyncSession,
    attempt_id: uuid.UUID,
    payload: BatchSaveAnswersRequest,
    student_user: User,
) -> dict[str, Any]:
    query = (
        select(ExamAttempt)
        .where(ExamAttempt.id == attempt_id)
        .options(
            selectinload(ExamAttempt.exam).selectinload(Exam.questions),
            selectinload(ExamAttempt.responses),
        )
    )
    res = await db.execute(query)
    attempt = res.scalar_one_or_none()
    if not attempt:
        raise NotFoundError("Exam attempt not found")

    if attempt.student_id != student_user.id:
        raise AuthorizationError("Unauthorized attempt access.")

    if attempt.status != "in_progress":
        raise HTTPException(
            status_code=400, detail="Cannot save answers to an attempt that is not in progress."
        )

    # Time expiration check with 60-second network grace period
    now = get_utc_now()
    started = normalize_datetime(attempt.started_at)
    total_allowed = attempt.exam.duration_minutes * 60
    if (now - started).total_seconds() > total_allowed + 60:
        await submit_attempt(db, attempt_id, student_user, is_auto_submit=True)
        raise HTTPException(status_code=400, detail="Exam time expired. Attempt auto-submitted.")

    # Normalize the presentation labels back to the question-bank labels before
    # persisting. Grading remains based on the canonical key, while the candidate
    # can answer using the labels they actually saw in this attempt variant.
    variant = attempt.delivery_variant or {}
    display_maps = variant.get("option_display_to_canonical", {})
    question_types = {
        str(eq.id): eq.question.question_type for eq in attempt.exam.questions
    }
    allowed_question_ids = {eq.id for eq in attempt.exam.questions}

    # Upsert responses. The browser sends the label it displayed, but only a
    # displayed label may be translated; accepting any other label would let a
    # forged canonical answer key bypass a shuffled presentation.
    resp_map = {r.exam_question_id: r for r in attempt.responses}

    for item in payload.answers:
        if item.exam_question_id not in allowed_question_ids:
            raise HTTPException(status_code=422, detail="Question is not part of this exam.")
        answer_data = dict(item.answer_data or {})
        question_id = str(item.exam_question_id)
        mapping = display_maps.get(question_id, {})
        selected = answer_data.get("selected")
        if question_types.get(question_id) == "true_false":
            # True/false answers are the option body ("true"/"false"), not a
            # display label. Preserve that established API even when choices are
            # randomized; translate only when a client explicitly sends a shown label.
            if isinstance(selected, str) and selected in mapping:
                answer_data["selected"] = mapping[selected]
        elif isinstance(selected, list):
            if mapping and any(str(label) not in mapping for label in selected):
                raise HTTPException(
                    status_code=422,
                    detail="Answer contains an option not shown in this attempt.",
                )
            answer_data["selected"] = [mapping.get(str(label), label) for label in selected]
        elif selected is not None:
            selected_label = str(selected)
            if selected_label in mapping:
                answer_data["selected"] = mapping[selected_label]
            elif mapping:
                raise HTTPException(
                    status_code=422,
                    detail="Answer contains an option not shown in this attempt.",
                )
        if item.exam_question_id in resp_map:
            resp = resp_map[item.exam_question_id]
            resp.answer_data = answer_data
            resp.time_spent_seconds += item.time_spent_seconds
            resp.flagged_for_review = item.flagged_for_review
        else:
            resp = ExamResponse(
                attempt_id=attempt.id,
                exam_question_id=item.exam_question_id,
                answer_data=answer_data,
                time_spent_seconds=item.time_spent_seconds,
                flagged_for_review=item.flagged_for_review,
            )
            db.add(resp)

    await db.commit()
    return {"status": "saved", "count": len(payload.answers)}


async def submit_attempt(
    db: AsyncSession,
    attempt_id: uuid.UUID,
    student_user: User,
    is_auto_submit: bool = False,
) -> ExamAttempt:
    query = (
        select(ExamAttempt)
        .where(ExamAttempt.id == attempt_id)
        .options(
            selectinload(ExamAttempt.exam)
            .selectinload(Exam.questions)
            .selectinload(ExamQuestion.question)
            .selectinload(Question.options),
            selectinload(ExamAttempt.responses),
        )
    )
    res = await db.execute(query)
    attempt = res.scalar_one_or_none()
    if not attempt:
        raise NotFoundError("Exam attempt not found")

    if attempt.student_id != student_user.id and not is_auto_submit:
        raise AuthorizationError("Unauthorized to submit this exam attempt.")

    if attempt.status in ("submitted", "auto_submitted", "graded"):
        return attempt

    attempt.submitted_at = get_utc_now()
    attempt.status = "auto_submitted" if is_auto_submit else "submitted"

    # Run auto-grading for objective questions
    await auto_grade_attempt(db, attempt)

    await db.commit()
    await db.refresh(attempt)

    await record_audit_event(
        db=db,
        user_id=student_user.id,
        user_email=student_user.email,
        action="exam.attempt_submit",
        resource_type="exam_attempt",
        resource_id=str(attempt.id),
        extra_data={"status": attempt.status, "total_score": attempt.total_score},
    )

    # In-app notification
    await create_notification(
        db=db,
        user_id=attempt.student_id,
        title="Exam Submitted",
        message=f"Your responses for exam '{attempt.exam.title}' have been successfully submitted.",
        notification_type="exam_submitted",
        link=f"/exams/{attempt.exam_id}/results",
    )

    return attempt


# ── Auto-Grading Engine ─────────────────────────────────────────────────────


async def auto_grade_attempt(db: AsyncSession, attempt: ExamAttempt) -> None:
    exam = attempt.exam
    responses_by_q = {r.exam_question_id: r for r in attempt.responses}

    total_score = 0.0
    all_graded = True

    for eq in exam.questions:
        q = eq.question
        resp = responses_by_q.get(eq.id)
        marks = eq.marks_override if eq.marks_override is not None else q.marks
        neg_marks = (
            eq.negative_marks_override
            if eq.negative_marks_override is not None
            else q.negative_marks
        )

        if not resp or not resp.answer_data:
            # Unanswered question
            if resp:
                resp.marks_awarded = 0.0
                resp.is_auto_graded = True
            continue

        ans = resp.answer_data

        if q.question_type == "mcq":
            selected = str(ans.get("selected", "")).strip()
            correct_opts = [o.label for o in q.options if o.is_correct]
            if correct_opts and selected == correct_opts[0]:
                resp.marks_awarded = marks
            else:
                resp.marks_awarded = -neg_marks if neg_marks > 0 else 0.0
            resp.is_auto_graded = True
            total_score += resp.marks_awarded

        elif q.question_type == "msq":
            selected_set = {str(x).strip() for x in ans.get("selected", [])}
            correct_set = {o.label for o in q.options if o.is_correct}
            if selected_set == correct_set:
                resp.marks_awarded = marks
            else:
                resp.marks_awarded = -neg_marks if neg_marks > 0 else 0.0
            resp.is_auto_graded = True
            total_score += resp.marks_awarded

        elif q.question_type == "true_false":
            selected = str(ans.get("selected", "")).strip().lower()
            correct_opts = [o.body.lower() for o in q.options if o.is_correct]
            if correct_opts and selected in (correct_opts[0], correct_opts[0][0]):
                resp.marks_awarded = marks
            else:
                resp.marks_awarded = -neg_marks if neg_marks > 0 else 0.0
            resp.is_auto_graded = True
            total_score += resp.marks_awarded

        elif q.question_type == "numerical":
            val = ans.get("value")
            meta = q.metadata_info or {}
            target = meta.get("answer")
            tolerance = meta.get("tolerance", 0.0)

            if (
                val is not None
                and target is not None
                and math.isclose(float(val), float(target), abs_tol=float(tolerance))
            ):
                resp.marks_awarded = marks
            else:
                resp.marks_awarded = -neg_marks if neg_marks > 0 else 0.0
            resp.is_auto_graded = True
            total_score += resp.marks_awarded

        elif q.question_type == "fill_blank":
            user_blanks = [str(b).strip().lower() for b in ans.get("blanks", [])]
            accepted = [
                str(a).strip().lower() for a in (q.metadata_info or {}).get("accepted_answers", [])
            ]
            if user_blanks and any(b in accepted for b in user_blanks):
                resp.marks_awarded = marks
            else:
                resp.marks_awarded = 0.0
            resp.is_auto_graded = True
            total_score += resp.marks_awarded

        else:
            # Short answer / Essay: Requires manual grading!
            resp.is_auto_graded = False
            all_graded = False

    # Update attempt summary
    attempt.total_score = max(0.0, total_score)
    attempt.percentage = (
        round((attempt.total_score / exam.total_marks) * 100, 2) if exam.total_marks > 0 else 0.0
    )

    if all_graded:
        attempt.status = "graded"


# ── Manual Grading Workflow ─────────────────────────────────────────────────


async def _raise_review_flag(
    db: AsyncSession,
    attempt: ExamAttempt,
    *,
    student_user: User,
    action: str,
    extra_data: dict[str, Any],
) -> bool:
    """Flag an attempt for faculty review, at most once, whatever raised it.

    Stamping in one place is what keeps the review queue honest: repeated signals
    cannot multiply flags or audit entries, and the timestamp belongs to the
    first observation rather than the latest.
    """
    if FLAGGED_FOR_REVIEW_FLAG in list(attempt.proctor_flags):
        return False

    flags = [
        f for f in attempt.proctor_flags if not str(f).startswith(REVIEW_FLAGGED_AT_FLAG_PREFIX)
    ]
    flags.append(FLAGGED_FOR_REVIEW_FLAG)
    flags.append(f"{REVIEW_FLAGGED_AT_FLAG_PREFIX}{get_utc_now().isoformat()}")
    attempt.proctor_flags = flags
    await db.commit()
    await db.refresh(attempt)

    await record_audit_event(
        db=db,
        user_id=student_user.id,
        user_email=student_user.email,
        action=action,
        resource_type="exam_attempt",
        resource_id=str(attempt.id),
        extra_data=extra_data,
    )
    await db.commit()
    return True


def review_flag_state(attempt: ExamAttempt) -> tuple[bool, datetime | None]:
    """Whether this attempt awaits faculty review, and since when.

    The flags are a free-form list of strings, so the meaning of "flagged" is
    derived in exactly one place: the review surface and its queue filter must
    agree, and neither should re-parse the prefix in another module.
    """
    flagged = False
    flagged_at: datetime | None = None
    for flag in attempt.proctor_flags or []:
        text = str(flag)
        if text == FLAGGED_FOR_REVIEW_FLAG:
            flagged = True
        elif text.startswith(REVIEW_FLAGGED_AT_FLAG_PREFIX):
            raw = text[len(REVIEW_FLAGGED_AT_FLAG_PREFIX) :]
            try:
                flagged_at = normalize_datetime(datetime.fromisoformat(raw))
            except ValueError:
                flagged_at = None
    return flagged, flagged_at


def resume_request_state(attempt: ExamAttempt) -> tuple[bool, datetime | None]:
    """Whether the candidate has asked to continue, and since when.

    Derived in one place for the same reason as the review flag: the lock
    surface, the lecturer's queue and the unlock path must agree on what a
    pending request is.
    """
    requested = False
    requested_at: datetime | None = None
    for flag in attempt.proctor_flags or []:
        text = str(flag)
        if text == RESUME_REQUESTED_FLAG:
            requested = True
        elif text.startswith(RESUME_REQUESTED_AT_FLAG_PREFIX):
            raw = text[len(RESUME_REQUESTED_AT_FLAG_PREFIX) :]
            try:
                requested_at = normalize_datetime(datetime.fromisoformat(raw))
            except ValueError:
                requested_at = None
    return requested, requested_at


async def list_attempts_for_exam(
    db: AsyncSession,
    exam_id: uuid.UUID,
    current_user: User,
    only_flagged: bool = False,
) -> list[ExamAttempt]:
    """Staff view of an exam's attempts, scoped to the caller's offering."""
    await _assert_can_manage_exam(
        db,
        await _exam_row(db, exam_id),
        current_user,
        purpose="exam grading and attempt review",
        allow_exam_bureau=False,
    )
    return await _attempts_for_exam(db, exam_id=exam_id, only_flagged=only_flagged)


async def _attempts_for_exam(
    db: AsyncSession,
    exam_id: uuid.UUID,
    only_flagged: bool = False,
) -> list[ExamAttempt]:
    """Unscoped attempt read; every caller owns its scope check."""
    # Instructors must never be shown an attempt as "in progress" after its
    # permitted time has run out, so the sweep runs before the read.
    await reconcile_expired_attempts(db, exam_id=exam_id)

    query = (
        select(ExamAttempt)
        .where(ExamAttempt.exam_id == exam_id)
        .options(selectinload(ExamAttempt.student))
        .order_by(desc(ExamAttempt.submitted_at))
    )
    res = await db.execute(query)
    attempts = list(res.scalars().all())
    if only_flagged:
        # Filtered after the read on purpose: the flags are a JSON array, and
        # PostgreSQL and SQLite query JSON differently. An exam's cohort is small
        # enough that portability is worth more than an index here.
        attempts = [a for a in attempts if review_flag_state(a)[0]]
    return attempts


async def grade_attempt_response(
    db: AsyncSession,
    response_id: uuid.UUID,
    payload: GradeSingleResponseRequest,
    current_user: User,
) -> ExamResponse:
    query = (
        select(ExamResponse)
        .where(ExamResponse.id == response_id)
        .options(
            selectinload(ExamResponse.attempt).selectinload(ExamAttempt.responses),
            selectinload(ExamResponse.attempt).selectinload(ExamAttempt.exam),
        )
    )
    res = await db.execute(query)
    resp = res.scalar_one_or_none()
    if not resp:
        raise NotFoundError("Exam response not found")

    # Marks are classroom data: the offering's teaching staff (or an
    # administrator) grade them; the examination bureau does not.
    await _assert_can_manage_exam(
        db,
        resp.attempt.exam,
        current_user,
        purpose="exam grading and result publication",
        allow_exam_bureau=False,
    )

    resp.marks_awarded = payload.marks_awarded
    resp.feedback = payload.feedback
    resp.graded_by_id = current_user.id
    resp.graded_at = get_utc_now()

    # Recalculate attempt score
    attempt = resp.attempt
    exam = attempt.exam

    score = 0.0
    all_graded = True
    for r in attempt.responses:
        if r.marks_awarded is not None:
            score += r.marks_awarded
        else:
            all_graded = False

    attempt.total_score = max(0.0, score)
    attempt.percentage = (
        round((attempt.total_score / exam.total_marks) * 100, 2) if exam.total_marks > 0 else 0.0
    )
    if all_graded:
        attempt.status = "graded"

    await db.commit()
    await db.refresh(resp)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.grade_response",
        resource_type="exam_response",
        resource_id=str(resp.id),
        extra_data={"marks_awarded": resp.marks_awarded},
    )
    return resp


# ── Results & Publishing ────────────────────────────────────────────────────


async def publish_exam_results(
    db: AsyncSession,
    exam_id: uuid.UUID,
    current_user: User,
) -> Exam:
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise NotFoundError("Exam not found")

    # Publication releases the cohort's marks: teaching/admin scope only.
    await _assert_can_manage_exam(
        db,
        exam,
        current_user,
        purpose="exam grading and result publication",
        allow_exam_bureau=False,
    )

    exam.status = "published"
    await db.commit()
    await db.refresh(exam)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.publish_results",
        resource_type="exam",
        resource_id=str(exam.id),
    )

    # Notify all students with attempts
    att_res = await db.execute(
        select(ExamAttempt.student_id).where(ExamAttempt.exam_id == exam_id).distinct()
    )
    student_ids = att_res.scalars().all()

    for s_id in student_ids:
        await create_notification(
            db=db,
            user_id=s_id,
            title="Exam Results Published",
            message=f"Results for '{exam.title}' are now available to view.",
            notification_type="exam_results_published",
            link=f"/exams/{exam.id}/results",
        )
        await send_notification_email_if_enabled(
            db=db,
            user_id=s_id,
            category="exams",
            subject=f"Exam Results Published: {exam.title}",
            body_text=f"Results for '{exam.title}' are now available to view.",
        )

    return exam


async def get_student_exam_result(
    db: AsyncSession,
    exam_id: uuid.UUID,
    student_user: User,
) -> StudentExamResultResponse:
    query = (
        select(ExamAttempt)
        .where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.student_id == student_user.id,
        )
        .options(
            selectinload(ExamAttempt.exam),
            selectinload(ExamAttempt.responses)
            .selectinload(ExamResponse.exam_question)
            .selectinload(ExamQuestion.question)
            .selectinload(Question.options),
        )
        .order_by(desc(ExamAttempt.attempt_number))
    )
    res = await db.execute(query)
    attempt = res.scalars().first()
    if not attempt:
        raise NotFoundError("No exam attempt found for this student.")

    exam = attempt.exam
    is_published = exam.status == "published"
    show_imm = (exam.config or {}).get("show_results_immediately", False)

    if not is_published and not show_imm:
        raise HTTPException(
            status_code=403,
            detail="Exam results have not been published by the instructor yet.",
        )

    response_details = []
    for r in attempt.responses:
        eq = r.exam_question
        q = eq.question
        canonical_correct = [o.label for o in q.options if o.is_correct]
        option_display_to_canonical = (attempt.delivery_variant or {}).get(
            "option_display_to_canonical", {}
        ).get(str(eq.id), {})
        correct_summary = ", ".join(
            option_display_to_canonical.get(label, label) for label in canonical_correct
        ) or None
        answer_data = dict(r.answer_data or {})
        canonical_to_display = {
            canonical: display for display, canonical in option_display_to_canonical.items()
        }
        selected = answer_data.get("selected")
        if isinstance(selected, list):
            answer_data["selected"] = [canonical_to_display.get(str(label), label) for label in selected]
        elif selected is not None:
            answer_data["selected"] = canonical_to_display.get(str(selected), selected)

        response_details.append(
            {
                "id": r.id,
                "exam_question_id": r.exam_question_id,
                "question_type": q.question_type,
                "question_body": q.body,
                "max_marks": eq.marks_override if eq.marks_override is not None else q.marks,
                "answer_data": answer_data,
                "marks_awarded": r.marks_awarded,
                "is_auto_graded": r.is_auto_graded,
                "feedback": r.feedback,
                "correct_answer_summary": correct_summary,
            }
        )

    return StudentExamResultResponse(
        attempt_id=attempt.id,
        exam_id=exam.id,
        exam_title=exam.title,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        status=attempt.status,
        total_score=attempt.total_score,
        total_marks=exam.total_marks,
        percentage=attempt.percentage,
        responses=response_details,
    )


async def list_attempt_responses(
    db: AsyncSession,
    attempt_id: uuid.UUID,
    current_user: User,
) -> list[ExamAttemptResponseDetail]:
    """Faculty view of every response in an attempt (includes the manual-grading queue)."""
    await _assert_can_manage_attempt(
        db,
        attempt_id,
        current_user,
        purpose="exam grading and attempt review",
        allow_exam_bureau=False,
    )
    query = (
        select(ExamAttempt)
        .where(ExamAttempt.id == attempt_id)
        .options(
            selectinload(ExamAttempt.responses)
            .selectinload(ExamResponse.exam_question)
            .selectinload(ExamQuestion.question)
            .selectinload(Question.options),
        )
    )
    res = await db.execute(query)
    attempt = res.scalar_one_or_none()
    if not attempt:
        raise NotFoundError("Exam attempt not found")

    details: list[ExamAttemptResponseDetail] = []
    for r in attempt.responses:
        eq = r.exam_question
        q = eq.question
        correct_summary = (
            ", ".join(o.label for o in q.options if o.is_correct) if q.options else None
        )
        details.append(
            ExamAttemptResponseDetail(
                id=r.id,
                exam_question_id=r.exam_question_id,
                question_type=q.question_type,
                question_body=q.body,
                max_marks=eq.marks_override if eq.marks_override is not None else q.marks,
                answer_data=r.answer_data,
                marks_awarded=r.marks_awarded,
                is_auto_graded=r.is_auto_graded,
                feedback=r.feedback,
                correct_answer_summary=correct_summary,
            )
        )
    return details


# ── Proctoring & Violation Monitoring ───────────────────────────────────────
#
# CampusFlow uses observable, rule-based proctoring (see ADR-003). Events are
# recorded as an append-only audit trail; the institution-configured tolerance
# auto-submits the attempt rather than locking the candidate out. Faculty can
# review the timeline and authorise a resumed attempt when a record is disputed.

# Small tolerance so a candidate whose clock is a little ahead of the server
# is not blocked from a legitimately-open exam window.
START_WINDOW_EARLY_TOLERANCE_SECONDS = 60

# How long after an attempt's permitted duration (or the closing of the exam
# window) the server waits before closing it out on the candidate's behalf.
ATTEMPT_EXPIRY_GRACE_SECONDS = 60

# The disclosed, server-owned vocabulary of observable integrity signals. A
# client cannot invent a signal name, so the review timeline cannot be inflated
# with meaningless or disguised events.
PROCTORING_EVENT_TYPES = frozenset(
    {
        "tab_switch",
        "window_blur",
        "fullscreen_exit",
        "clipboard_copy_attempt",
        "clipboard_paste_attempt",
        "copy_paste_attempt",  # retained for older clients
        "context_menu",
        "ip_change",
        "camera_snapshot",  # evidence frame; never a violation
        "camera_off",  # the required camera stopped mid-attempt; review only
        # Camera fields a frame whose pixels never change (laptop lid down,
        # finger over the lens, a phone held in front of the camera). The
        # candidate gets the authored grace before this is reported; it is an
        # observation for the lecturer, never a verdict or allowance event.
        "camera_obstructed",
        # A phone/second device was detected in camera view. Same privacy
        # stance: observable signal for faculty review, never an automatic
        # cheating verdict.
        "second_device_detected",
        # Face and head-direction monitoring, measured on the candidate's own
        # device from the required camera picture (frontend/src/features/
        # exams/face-monitoring.ts). All three are dwell-gated there: a glance,
        # a blink or a frame drop is never an event, so the angle, direction and
        # measured dwell travel with the event for the reviewer.
        #
        # Turning away from the paper is the cheating path the other signals
        # cannot see — the camera is alive, the tab is focused, and the
        # candidate is reading someone else's screen.
        "looking_away",
        # Nothing recognisable as a face for the disclosed dwell: the seat is
        # empty, the candidate sat out of view, or the lens is blocked.
        "face_not_visible",
        # Two or more faces in the frame: someone else is at the desk.
        "multiple_faces_detected",
        # A hand held at or over the face for the disclosed dwell. This is the
        # signal for reading off a phone held below the shot or a crib sheet
        # raised to eye level: the face is present, the camera is alive, and the
        # candidate is visibly occupied with something in their hand (ADR-029).
        # Observation tier only — see HAND_AUDIO_OBSERVATION_EVENT_TYPES.
        "hand_near_face",
        # A second voice, sustained, picked up by the candidate's own device for
        # the disclosed dwell: someone is reading answers out of frame. Detected
        # from the audio track only, never recorded or transcribed here
        # (ADR-029). Observation tier only.
        "voice_detected",
        # Talking-shaped mouth motion sustained while the candidate faces the
        # paper: repeating an answer aloud for someone off-frame, or reading back
        # what was dictated. This is measured as pixel motion in the mouth band
        # that the forehead band does not share (frontend/src/features/exams/
        # mouth-monitoring.ts) — never speech recognition, never audio, never a
        # transcript. Observation tier only (ADR-030).
        "mouth_movement_detected",
        # The candidate returned to the assessment within the 5-second grace
        # after leaving it. Disclosed, deliberate good behaviour — recorded
        # for the timeline but never a violation.
        "quick_tab_return",
        # Minor viewport signal: the assessment window was resized (e.g. to
        # watch a video alongside). Lower signal strength than an exit.
        "window_resized",
    }
)

# Evidence signals are appended to the trail for the instructor's review but do
# not consume the candidate's tolerance: a captured frame proves presence, it
# is not misconduct.
NON_VIOLATION_EVENT_TYPES = frozenset(
    {
        "camera_snapshot",
        "quick_tab_return",  # returned inside the 5-second grace: good behaviour
    }
)

# A modelled device observation (ADR-024). The detector runs in the candidate's
# own browser and can be wrong — a phone-shaped case, a reflection, a poster on
# the wall — so the client requires repeated agreeing scans before it reports
# one, and the event names which scan produced it. Once reported it spends one
# unit of the disclosed allowance like any other confirmed cue (D-31): the
# candidate sees exactly which warning it was, and only a lecturer can reopen an
# attempt that the allowance stopped.
DEVICE_OBSERVATION_EVENT_TYPES = frozenset({"second_device_detected"})

# Cues from the candidate's own camera and microphone. Each is confirmed on the
# client (a sustained dwell, or several agreeing scans) before it is reported,
# and each spends one unit of the allowance (D-31). The alternative this
# replaced — recording them as review-only — meant a candidate could talk, hold
# a phone to the lens and keep earphones in while the screen said nothing.
HAND_AUDIO_OBSERVATION_EVENT_TYPES = frozenset({"hand_near_face", "voice_detected"})

# Mouth motion and the device model are named separately so the audit trail and
# the lecturer's timeline record which model produced the observation.
MOUTH_OBSERVATION_EVENT_TYPES = frozenset({"mouth_movement_detected"})

# Every signal derived from camera or microphone input. They are classified as
# `camera_observation` for the timeline — a reviewer should know a model saw it —
# but they are counted, not advisory: the warning ladder below treats them like
# any browser signal, because a warning the candidate never sees is not a
# warning.
CAMERA_OBSERVATION_EVENT_TYPES = frozenset(
    {
        "camera_off",
        "camera_obstructed",
        "second_device_detected",
        "looking_away",
        "face_not_visible",
        "multiple_faces_detected",
        *HAND_AUDIO_OBSERVATION_EVENT_TYPES,
        *MOUTH_OBSERVATION_EVENT_TYPES,
    }
)

# A single frame is downscaled client-side; this ceiling only stops a hostile
# client from using the proctoring trail as unbounded blob storage.
PROCTORING_SNAPSHOT_MAX_CHARS = 400_000

# A locked attempt stamps its lock moment into the flag list so the unlock path
# can credit the candidate back for the time they spent waiting for faculty.
LOCKED_AT_FLAG_PREFIX = "locked_at:"

# Under the review policy the attempt is not removed; it is stamped once, when
# the tolerance is first reached, so the lecturer's review queue can find it.
FLAGGED_FOR_REVIEW_FLAG = "flagged_for_review"
REVIEW_FLAGGED_AT_FLAG_PREFIX = "review_flagged_at:"

# A candidate stopped at the tolerance may ask to continue. The request is a
# flag, not a state of its own: the attempt stays locked and the paper stays
# closed until a lecturer approves it, so asking can never be the same thing as
# being allowed back in.
RESUME_REQUESTED_FLAG = "resume_requested"
RESUME_REQUESTED_AT_FLAG_PREFIX = "resume_requested_at:"

# Repeated identical signals inside this window are one event, not many: a
# flickering focus change or a doubled listener must not exhaust the candidate's
# allowance and misrepresent the record.
PROCTORING_EVENT_DEDUPE_SECONDS = 3

# The disclosed gap between counted warnings (D-31). A signal that arrives inside
# it is still written to the trail — the lecturer should see everything the
# candidate did — but it cannot spend another warning. The clock starts when a
# warning is counted, not when the candidate dismisses it, so a burst of one
# sustained condition cannot walk the whole ladder before the first modal is read.
PROCTORING_WARNING_COOLDOWN_SECONDS = DEFAULT_WARNING_COOLDOWN_SECONDS


def _proctoring_event_category(event_type: str) -> str:
    """Classify an event by source for candidate notices and the faculty timeline."""
    if event_type == "camera_snapshot":
        return "evidence"
    if event_type in CAMERA_OBSERVATION_EVENT_TYPES:
        return "camera_observation"
    return "browser_signal"


def _resolve_max_violations(exam: Exam) -> int:
    raw = (exam.config or {}).get("max_violations", DEFAULT_MAX_VIOLATIONS)
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return DEFAULT_MAX_VIOLATIONS


def _resolve_warning_policy(exam: Exam) -> str:
    """The integrity consequence authored for this exam (ADR-023).

    ``remove`` is the behaviour this platform shipped before the setting
    existed, so it stays the default: an exam authored earlier keeps the policy
    its cohort was told about. An unrecognised value falls back to the default
    rather than trusting config that reached the row by some other path — the
    authoring schemas refuse it at the door.
    """
    raw = (exam.config or {}).get("warning_policy", DEFAULT_WARNING_POLICY)
    return raw if raw in WARNING_POLICIES else DEFAULT_WARNING_POLICY


def _resolve_device_detection(exam: Exam) -> bool:
    """Whether this assessment runs on-device device detection (ADR-024).

    On unless the exam says otherwise (D-31): a phone held up to the camera is the
    behaviour this feature exists to catch, and an assessment that never authored
    the switch is not evidence that its invigilators wanted it off. A boolean the
    author actually set always wins, including an explicit ``false``.
    """
    return _resolve_monitor_flag(exam, "device_detection_enabled", DEFAULT_DEVICE_DETECTION)


def _resolve_integrity_sensitivity(exam: Exam) -> str:
    """The dwell tier this paper is run at (ADR-029).

    ``standard`` is the behaviour every earlier assessment already had, so an
    unrecognised or absent value changes nothing for a cohort mid-term.
    """
    raw = (exam.config or {}).get("integrity_sensitivity")
    return raw if raw in INTEGRITY_SENSITIVITIES else DEFAULT_INTEGRITY_SENSITIVITY


def _resolve_monitor_flag(exam: Exam, key: str, default: bool) -> bool:
    """One per-exam camera cue switch, defaulting to the un-authored value."""
    raw = (exam.config or {}).get(key)
    return raw if isinstance(raw, bool) else default


def _integrity_narrative(exam: Exam) -> dict[str, Any]:
    """Everything the candidate surface must disclose before the paper starts.

    One helper so the staff view, the candidate brief and the delivery payload
    cannot drift apart on what an exam actually monitors (ADR-029).
    """
    sensitivity = _resolve_integrity_sensitivity(exam)
    return {
        "integrity_sensitivity": sensitivity,
        "face_monitoring_enabled": _resolve_monitor_flag(
            exam, "face_monitoring_enabled", DEFAULT_FACE_MONITORING
        ),
        "hand_monitoring_enabled": _resolve_monitor_flag(
            exam, "hand_monitoring_enabled", DEFAULT_HAND_MONITORING
        ),
        "audio_monitoring_enabled": _resolve_monitor_flag(
            exam, "audio_monitoring_enabled", DEFAULT_AUDIO_MONITORING
        ),
        "mouth_monitoring_enabled": _resolve_monitor_flag(
            exam, "mouth_monitoring_enabled", DEFAULT_MOUTH_MONITORING
        ),
        "dwell_ms": integrity_dwell_ms(exam.config),
    }


def _evidence_retention_days() -> int:
    """The institution's finite evidence-retention window, disclosed to candidates.

    Read from settings rather than the exam: retention is an institutional policy
    for personal data, not a per-paper choice. Non-positive or invalid values use
    the finite default, never "keep forever".
    """
    try:
        days = int(get_settings().proctoring_evidence_retention_days)
    except (TypeError, ValueError):
        return DEFAULT_EVIDENCE_RETENTION_DAYS
    return days if days > 0 else DEFAULT_EVIDENCE_RETENTION_DAYS


def _resolve_obstruction_threshold(exam: Exam) -> int:
    """Seconds of continuous obstruction before it is reported (D-12).

    The four-second default lives here rather than in the browser constant it
    replaces, so one authored value drives both the enforcement and the copy the
    candidate is shown.
    """
    raw = (exam.config or {}).get(
        "obstruction_threshold_seconds", DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS
    )
    if isinstance(raw, bool) or not isinstance(raw, int):
        return DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS
    if not MIN_OBSTRUCTION_THRESHOLD_SECONDS <= raw <= MAX_OBSTRUCTION_THRESHOLD_SECONDS:
        return DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS
    return raw


# Any accepted event may carry a frame in `details.snapshot` (including
# browser events captured while the camera is on). Expire by the event
# vocabulary, then inspect the JSON payload, so retention cannot silently miss
# images attached to a newly added event type.
EVIDENCE_PURGED_AT_KEY = "evidence_purged_at"


async def purge_proctoring_evidence(
    db: AsyncSession,
    retention_days: int,
    *,
    now: datetime | None = None,
) -> dict[str, int]:
    """Erase stored camera frames older than the retention window (D-2).

    The frame is the only personal-data payload the integrity trail holds, so it
    is erased on a schedule while the event row itself survives: the timeline
    still shows that a frame was captured, when, and when it was erased. Nothing
    else about the attempt is touched.

    ``retention_days <= 0`` falls back to the finite institutional default;
    captured images are never retained indefinitely because a zero-value config
    must not disable a personal-data safeguard.
    """
    if retention_days <= 0:
        retention_days = DEFAULT_EVIDENCE_RETENTION_DAYS

    purged_at = normalize_datetime(now or get_utc_now())
    cutoff = purged_at - timedelta(days=retention_days)
    # Select all expired event rows, not a hard-coded subset of event names:
    # reportEvent may attach a frame to any signal, and a future event type must
    # inherit retention automatically rather than leave an image behind forever.
    result = await db.execute(
        select(ProctoringEvent).where(ProctoringEvent.timestamp < cutoff)
    )
    events = list(result.scalars().all())

    frames_erased = 0
    for event in events:
        details = event.details or {}
        if "snapshot" not in details:
            continue
        # Assign a new dict: a JSON column is not tracked for in-place mutation,
        # so popping the key would be silently discarded on flush.
        remaining = {key: value for key, value in details.items() if key != "snapshot"}
        remaining[EVIDENCE_PURGED_AT_KEY] = purged_at.isoformat()
        event.details = remaining
        frames_erased += 1

    if frames_erased:
        await record_audit_event(
            db=db,
            action="proctoring.evidence_purge",
            resource_type="proctoring_event",
            user_email="system:evidence-retention",
            extra_data={
                "retention_days": retention_days,
                "cutoff": cutoff,
                "frames_erased": frames_erased,
            },
        )
        await db.commit()

    return {"frames_erased": frames_erased, "events_examined": len(events)}


def _camera_observation_message(event_type: str) -> str:
    """One short sentence naming what a confirmed camera/mic cue actually saw.

    Kept separate from the ladder so the count and the observation read as one
    notice ("Warning 3 of 7 — a phone-shaped object was visible to your camera"),
    rather than the candidate having to work out which warning caused `3`.
    """
    if event_type in DEVICE_OBSERVATION_EVENT_TYPES:
        return "A phone, earbuds or a watch was visible to your camera"
    if event_type == "hand_near_face":
        return "a hand was held at your face"
    if event_type == "voice_detected":
        return "your microphone heard sustained talking"
    if event_type in MOUTH_OBSERVATION_EVENT_TYPES:
        return "your camera saw sustained mouth movement"
    if event_type == "camera_off":
        return "your camera feed stopped"
    if event_type == "camera_obstructed":
        return "your camera picture was blocked or frozen"
    if event_type == "looking_away":
        return "your head was turned away from the paper"
    if event_type == "face_not_visible":
        return "your face was not visible to the camera"
    return "more than one face was visible to your camera"


def _integrity_warning(
    policy: str,
    violations: int,
    max_violations: int,
    observation_detail: str | None = None,
) -> str:
    """The disclosed warning ladder: which warning this is, and what is left.

    Every warning states the count and the remaining allowance, because a
    candidate cannot comply with a rule they cannot see being applied (D-31). A
    camera cue adds the one clause that says what was observed, so the count is
    never mysterious. The consequence sentence differs by policy: `remove` ends
    the sitting at the threshold and needs a lecturer to reopen it, `review`
    flags the attempt and lets the candidate keep going.
    """
    remaining = max(0, max_violations - violations)
    detail = f" {observation_detail}." if observation_detail else ""
    consequence = (
        "the session will stop and only your lecturer can authorise you to continue"
        if policy == WARNING_POLICY_REMOVE
        else "this attempt will be flagged for your lecturer's review"
    )
    return (
        f"Warning {violations} of {max_violations}.{detail} "
        f"{remaining} warning(s) left before {consequence}. "
        "If this was caused by a fault on your side, tell your lecturer now."
    )


async def reconcile_expired_attempts(
    db: AsyncSession,
    *,
    student_user: User | None = None,
    exam_id: uuid.UUID | None = None,
) -> int:
    """Close out attempts whose permitted time has run out.

    The server owns examination timing, so an attempt the candidate abandoned
    (closed the tab, lost connectivity, walked away) must still reach a terminal
    state without a live browser. This runs whenever the affected surface is
    read — the candidate's own exam list, the start/resume path, and the
    instructor's attempt list — which keeps a stuck attempt from being reported
    as ``in_progress`` forever. It is deliberately narrow: only attempts that are
    already past their duration or whose exam window has closed are touched.

    Returns the number of attempts closed.
    """
    if student_user is None and exam_id is None:
        raise ValueError("reconcile_expired_attempts requires a student or an exam scope.")

    query = (
        select(ExamAttempt)
        .where(ExamAttempt.status == "in_progress")
        .options(selectinload(ExamAttempt.exam))
    )
    if student_user is not None:
        query = query.where(ExamAttempt.student_id == student_user.id)
    if exam_id is not None:
        query = query.where(ExamAttempt.exam_id == exam_id)

    now = get_utc_now()
    closed = 0
    for attempt in (await db.execute(query)).scalars().all():
        attempt_exam = attempt.exam
        if attempt_exam is None:
            continue
        started = normalize_datetime(attempt.started_at)
        duration_expired = (
            now - started
        ).total_seconds() > attempt_exam.duration_minutes * 60 + ATTEMPT_EXPIRY_GRACE_SECONDS
        window_closed = now > normalize_datetime(attempt_exam.end_window)
        if not (duration_expired or window_closed):
            continue

        # The attempt's owner is the only party whose identity may be attached
        # to the audit trail of the automatic submission.
        owner = attempt.student if student_user is None else student_user
        if owner is None:
            continue
        await submit_attempt(db, attempt.id, owner, is_auto_submit=True)
        closed += 1

    return closed


async def record_proctoring_event(
    db: AsyncSession,
    attempt_id: uuid.UUID,
    payload: ProctoringEventCreate,
    student_user: User,
) -> ProctoringStatusResponse:
    query = (
        select(ExamAttempt)
        .where(ExamAttempt.id == attempt_id)
        .options(selectinload(ExamAttempt.exam))
    )
    res = await db.execute(query)
    attempt = res.scalar_one_or_none()
    if not attempt:
        raise NotFoundError("Exam attempt not found")

    if attempt.student_id != student_user.id:
        raise AuthorizationError("Unauthorized attempt access.")

    max_violations = _resolve_max_violations(attempt.exam)
    policy = _resolve_warning_policy(attempt.exam)

    if attempt.status != "in_progress":
        if attempt.status == "locked_violation":
            return ProctoringStatusResponse(
                violations_count=attempt.proctor_violations_count,
                max_violations=max_violations,
                warning_policy=policy,
                auto_submitted=False,
                is_locked=True,
                status="locked_violation",
                warning=(
                    "This session is locked after reaching the assessment-integrity "
                    "tolerance. Your answers are saved. Contact your lecturer so they "
                    "can reopen your attempt."
                ),
            )
        return ProctoringStatusResponse(
            violations_count=attempt.proctor_violations_count,
            max_violations=max_violations,
            warning_policy=policy,
            auto_submitted=True,
            is_locked=False,
            status=attempt.status,
            warning="This assessment attempt has already concluded.",
        )

    # The event kind must come from the disclosed, server-owned vocabulary.
    # A client cannot invent a signal name to inflate the allowance or to
    # disguise what actually happened.
    if payload.event_type not in PROCTORING_EVENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unsupported proctoring event type {payload.event_type!r}. "
                f"Permitted types: {', '.join(sorted(PROCTORING_EVENT_TYPES))}."
            ),
        )

    # Evidence frames are small, downscaled JPEGs. Anything larger is a hostile
    # client trying to use the append-only trail as blob storage, so it is
    # refused outright rather than silently truncated.
    snapshot = (payload.details or {}).get("snapshot")
    if isinstance(snapshot, str) and len(snapshot) > PROCTORING_SNAPSHOT_MAX_CHARS:
        raise AppException(
            status_code=422,
            error_code="FRAME_TOO_LARGE",
            message="Captured frame exceeds the permitted size.",
        )

    # The server clock is authoritative for the recorded time. A client-supplied
    # timestamp is untrusted and is retained only as context inside `details`.
    now = get_utc_now()
    details: dict[str, Any] | None = dict(payload.details) if payload.details else None
    if payload.timestamp is not None:
        details = dict(details or {})
        details["client_timestamp"] = normalize_datetime(payload.timestamp).isoformat()

    # Collapse duplicate browser signals: the same page event repeated inside the
    # debounce window is noise (a flickering focus change, a doubled listener),
    # not a new violation, so it is acknowledged without consuming the allowance.
    #
    # A confirmed camera cue is exempt. It has already paid its dwell on the
    # candidate's own device, and the behaviour it describes — talking, holding a
    # phone to the lens, a watch in shot — continues for as long as the candidate
    # chooses; swallowing the second one would leave a candidate who ignores the
    # first warning with a screen that has stopped reacting. The monitors reset
    # after each report, so a cue arriving again is a new episode, not a repeat.
    recent_res = (
        await db.execute(
            select(ProctoringEvent.timestamp)
            .where(
                ProctoringEvent.attempt_id == attempt.id,
                ProctoringEvent.event_type == payload.event_type,
            )
            .order_by(desc(ProctoringEvent.timestamp))
            .limit(1)
        )
        if payload.event_type not in CAMERA_OBSERVATION_EVENT_TYPES
        else None
    )
    last_at = recent_res.scalar_one_or_none() if recent_res is not None else None
    if last_at is not None:
        since = (now - normalize_datetime(last_at)).total_seconds()
        if 0 <= since < PROCTORING_EVENT_DEDUPE_SECONDS:
            category = _proctoring_event_category(payload.event_type)
            return ProctoringStatusResponse(
                violations_count=attempt.proctor_violations_count,
                max_violations=max_violations,
                warning_policy=policy,
                auto_submitted=False,
                is_locked=False,
                status=attempt.status,
                warning=None,
                event_category=category,
            )

    # Record the event in the append-only proctoring trail.
    event = ProctoringEvent(
        attempt_id=attempt.id,
        event_type=payload.event_type,
        timestamp=now,
        severity=payload.severity,
        details=details,
    )
    db.add(event)

    # Evidence-only signals stop here: a frame or an excused quick return does
    # not consume the allowance and does not imply a review finding.
    if payload.event_type in NON_VIOLATION_EVENT_TYPES:
        await db.commit()
        return ProctoringStatusResponse(
            violations_count=attempt.proctor_violations_count,
            max_violations=max_violations,
            warning_policy=policy,
            auto_submitted=False,
            is_locked=False,
            status=attempt.status,
            warning=None,
            event_category=_proctoring_event_category(payload.event_type),
        )

    # A counted warning opens a disclosed quiet period. Signals inside it are
    # still evidence for the lecturer — and a camera cue still raises the review
    # flag — but they cannot climb the warning ladder until it has elapsed. This
    # is deliberately server-side: the client cannot shorten the gap, and a
    # reload cannot be used to spend the allowance faster.
    suppressed_by_cooldown = False
    cooldown_remaining = 0
    cooldown_seconds = PROCTORING_WARNING_COOLDOWN_SECONDS
    if cooldown_seconds > 0 and attempt.last_warning_at is not None:
        since_last_warning = (now - normalize_datetime(attempt.last_warning_at)).total_seconds()
        if 0 <= since_last_warning < cooldown_seconds:
            suppressed_by_cooldown = True
            cooldown_remaining = max(1, int(cooldown_seconds - since_last_warning))
            annotated = dict(details or {})
            annotated["counted"] = False
            annotated["suppressed_by_cooldown"] = True
            annotated["cooldown_seconds_remaining"] = cooldown_remaining
            details = annotated
            event.details = annotated

    # Camera and microphone cues are classified for the timeline, and raise the
    # lecturer's review flag, but they are *counted*: the allowance below applies
    # to them exactly as it does to a tab switch (D-31). The specific sentence is
    # kept so the candidate is told what was seen, not just that something was.
    observation_detail: str | None = None
    if payload.event_type in CAMERA_OBSERVATION_EVENT_TYPES:
        await db.commit()
        if payload.event_type in DEVICE_OBSERVATION_EVENT_TYPES:
            action = "exam.attempt_flagged_device_observation"
        elif payload.event_type in HAND_AUDIO_OBSERVATION_EVENT_TYPES | MOUTH_OBSERVATION_EVENT_TYPES:
            action = f"exam.attempt_observation_{payload.event_type}"
        else:
            action = f"exam.attempt_camera_observation_{payload.event_type}"
        await _raise_review_flag(
            db,
            attempt,
            student_user=student_user,
            action=action,
            extra_data={
                "event_type": payload.event_type,
                "details": details,
                "integrity_sensitivity": _resolve_integrity_sensitivity(attempt.exam),
                "violations_count": attempt.proctor_violations_count,
                "max_violations": max_violations,
            },
        )
        observation_detail = _camera_observation_message(payload.event_type)

    if suppressed_by_cooldown:
        # The observation is recorded and (for a camera cue) already queued for
        # review, but the candidate is not warned again: they have just been shown
        # a warning, and a second modal inside the gap would make the disclosed
        # allowance look like a burst rather than a ladder.
        await db.commit()
        return ProctoringStatusResponse(
            violations_count=attempt.proctor_violations_count,
            max_violations=max_violations,
            warning_policy=policy,
            auto_submitted=False,
            is_locked=False,
            status=attempt.status,
            warning=None,
            event_category=(
                "camera_observation"
                if payload.event_type in CAMERA_OBSERVATION_EVENT_TYPES
                else "browser_signal"
            ),
        )

    # Browser/page telemetry and confirmed camera cues share one ladder below.
    # Both are observable signals, not automated findings of misconduct.

    # Increment atomically in SQL. Reading the counter into Python and writing it
    # back loses updates whenever signals arrive concurrently (several tabs, a
    # burst of focus changes), which would both let a candidate slip past the
    # allowance and leave faculty with a count the trail does not support.
    await db.execute(
        update(ExamAttempt)
        .where(ExamAttempt.id == attempt.id)
        .values(
            proctor_violations_count=ExamAttempt.proctor_violations_count + 1,
            # Stamp the moment this warning was counted, not the moment the
            # candidate acknowledged it: the gap is measured from the server's
            # decision so closing the modal cannot shorten it.
            last_warning_at=now,
        )
    )
    await db.commit()
    await db.refresh(attempt)
    violations = attempt.proctor_violations_count

    warning: str | None = None
    is_locked = False
    is_camera_cue = payload.event_type in CAMERA_OBSERVATION_EVENT_TYPES

    if violations >= max_violations and policy == WARNING_POLICY_REMOVE:
        # Threshold reached under the removal policy (ADR-015): the candidate is
        # thrown out of the paper with their answers intact, and only a faculty
        # authorisation through the unlock endpoint lets them back in — never an
        # automatic submission they cannot appeal.
        flags = [f for f in attempt.proctor_flags if not str(f).startswith(LOCKED_AT_FLAG_PREFIX)]
        if "max_violations_exceeded" not in flags:
            flags.append("max_violations_exceeded")
        flags.append(f"{LOCKED_AT_FLAG_PREFIX}{now.isoformat()}")
        attempt.proctor_flags = flags
        attempt.status = "locked_violation"
        await db.commit()
        await db.refresh(attempt)

        is_locked = True
        warning = (
            f"Examination stopped: warning {violations} of {max_violations} has been "
            f"recorded{': ' + observation_detail if observation_detail else '.'}"
            " Your answers are saved. Only your lecturer can authorise you to continue."
        )
        await record_audit_event(
            db=db,
            user_id=student_user.id,
            user_email=student_user.email,
            action="exam.attempt_locked_violations",
            resource_type="exam_attempt",
            resource_id=str(attempt.id),
            extra_data={
                "violations_count": violations,
                "max_violations": max_violations,
                "event_type": payload.event_type,
            },
        )
        await db.commit()
    elif violations >= max_violations:
        # Threshold reached under the review policy (ADR-023): the candidate is
        # not removed. The attempt is flagged for the lecturer's review and the
        # paper continues, because an automated signal is an observation for a
        # human to weigh. Only the *first* crossing writes the flag and the audit
        # entry, so a long session cannot forge a trail of duplicate reviews.
        await _raise_review_flag(
            db,
            attempt,
            student_user=student_user,
            action="exam.attempt_flagged_for_review",
            extra_data={
                "violations_count": violations,
                "max_violations": max_violations,
                "event_type": payload.event_type,
            },
        )
        warning = (
            f"Warning {violations} of {max_violations} — the disclosed limit has been "
            "reached, so this attempt is now flagged for your lecturer's review. "
            "You are not removed and your answers keep saving."
            + (f" {observation_detail}." if observation_detail else "")
        )
    else:
        warning = _integrity_warning(policy, violations, max_violations, observation_detail)
        await db.commit()

    return ProctoringStatusResponse(
        violations_count=attempt.proctor_violations_count,
        max_violations=max_violations,
        warning_policy=policy,
        auto_submitted=False,
        is_locked=is_locked,
        status=attempt.status,
        warning=warning,
        event_category="camera_observation" if is_camera_cue else "browser_signal",
    )


async def unlock_exam_attempt(
    db: AsyncSession,
    exam_id: uuid.UUID,
    attempt_id: uuid.UUID,
    faculty_user: User,
    reason: str = "Faculty authorized re-entry after integrity review",
    reset_violations: bool = True,
) -> ExamAttempt:
    query = (
        select(ExamAttempt)
        .where(ExamAttempt.id == attempt_id, ExamAttempt.exam_id == exam_id)
        .options(selectinload(ExamAttempt.exam), selectinload(ExamAttempt.student))
    )
    res = await db.execute(query)
    attempt = res.scalar_one_or_none()
    if not attempt:
        raise NotFoundError("Exam attempt not found")

    # Invigilation is examination-bureau work, so the bureau may reopen an
    # attempt institution-wide; grading rights are not required or implied.
    await _assert_can_manage_attempt(
        db,
        attempt_id,
        faculty_user,
        purpose="examination invigilation",
        allow_exam_bureau=True,
    )

    previous_flags = list(attempt.proctor_flags)

    # A locked candidate is not studying while they wait for faculty, so the
    # time spent locked is credited back onto the attempt clock. Without this a
    # candidate locked out for an hour would come back to an expired paper.
    locked_at: datetime | None = None
    for flag in previous_flags:
        if str(flag).startswith(LOCKED_AT_FLAG_PREFIX):
            try:
                locked_at = datetime.fromisoformat(str(flag)[len(LOCKED_AT_FLAG_PREFIX) :])
            except ValueError:
                locked_at = None
            break
    now = get_utc_now()
    if locked_at is not None and attempt.exam is not None:
        locked_seconds = (now - normalize_datetime(locked_at)).total_seconds()
        max_credit = attempt.exam.duration_minutes * 60 + 3600
        if 0 < locked_seconds <= max_credit:
            shifted = normalize_datetime(attempt.started_at) + timedelta(seconds=locked_seconds)
            attempt.started_at = min(shifted, now)

    attempt.status = "in_progress"
    # A re-entry is a fresh start on the ladder whichever reset the lecturer
    # chose; carrying the old cooldown into the resumed attempt would deny the
    # candidate their first warning for no disclosed reason.
    attempt.last_warning_at = None
    if reset_violations:
        attempt.proctor_violations_count = 0
    else:
        attempt.proctor_violations_count = max(0, attempt.proctor_violations_count - 1)

    # Reopening clears both intervention markers: the lock stamp, and the
    # review flag, since a review that has been actioned must not keep an
    # attempt looking unreviewed in the lecturer's queue.
    flags = [
        f
        for f in previous_flags
        if f not in (FLAGGED_FOR_REVIEW_FLAG, "max_violations_exceeded", RESUME_REQUESTED_FLAG)
        and not str(f).startswith(LOCKED_AT_FLAG_PREFIX)
        and not str(f).startswith(REVIEW_FLAGGED_AT_FLAG_PREFIX)
        and not str(f).startswith(RESUME_REQUESTED_AT_FLAG_PREFIX)
    ]
    flags.append(f"resumed_by_{faculty_user.email}")
    attempt.proctor_flags = flags

    await record_audit_event(
        db=db,
        user_id=faculty_user.id,
        user_email=faculty_user.email,
        action="exam.attempt_resumed",
        resource_type="exam_attempt",
        resource_id=str(attempt.id),
        extra_data={
            "reason": reason,
            "violations_reset_to": attempt.proctor_violations_count,
            "locked_seconds_credited_back": (
                round(
                    (now - normalize_datetime(locked_at)).total_seconds(),
                )
                if locked_at is not None
                else 0
            ),
        },
    )

    await db.commit()
    await db.refresh(attempt)
    return attempt


async def request_attempt_resume(
    db: AsyncSession,
    exam_id: uuid.UUID,
    student_user: User,
) -> ExamAttempt:
    """Ask the lecturer to reopen an attempt that the tolerance stopped.

    The candidate cannot reopen their own paper: this writes a request flag and
    returns the attempt **still locked**. Only ``unlock_exam_attempt`` — gated on
    teaching scope — changes the status back to ``in_progress``, so asking can
    never be mistaken for being allowed back in. A second request while one is
    pending changes nothing, because pressing the button twice is impatience,
    not new evidence.
    """
    # Addressed by exam, not by attempt id: the lock surface a candidate reaches
    # after the last warning does not always know an attempt id yet, and the
    # caller's own most recent locked attempt is unambiguous. Scoping by
    # ``student_id`` is what makes that safe — another candidate's attempt can
    # never be reached, and a missing one is a 404 rather than a 403 so the route
    # cannot be used to discover attempt ids (anti-enumeration).
    query = (
        select(ExamAttempt)
        .where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.student_id == student_user.id,
            ExamAttempt.status == "locked_violation",
        )
        .options(selectinload(ExamAttempt.exam), selectinload(ExamAttempt.student))
        .order_by(desc(ExamAttempt.started_at))
        .limit(1)
    )
    attempt = (await db.execute(query)).scalar_one_or_none()
    if not attempt:
        raise AppException(
            status_code=409,
            error_code="ATTEMPT_NOT_LOCKED",
            message="This attempt is not locked, so there is nothing to reopen.",
        )

    requested, _ = resume_request_state(attempt)
    if requested:
        return attempt

    now = get_utc_now()
    flags = [f for f in attempt.proctor_flags if f != RESUME_REQUESTED_FLAG]
    flags.append(RESUME_REQUESTED_FLAG)
    flags.append(f"{RESUME_REQUESTED_AT_FLAG_PREFIX}{now.isoformat()}")
    attempt.proctor_flags = flags
    await db.commit()

    await record_audit_event(
        db=db,
        user_id=student_user.id,
        user_email=student_user.email,
        action="exam.attempt_resume_requested",
        resource_type="exam_attempt",
        resource_id=str(attempt.id),
        extra_data={
            "violations_count": attempt.proctor_violations_count,
            "max_violations": (
                _resolve_max_violations(attempt.exam) if attempt.exam is not None else None
            ),
        },
    )
    await db.commit()
    await db.refresh(attempt)
    return attempt


async def get_proctoring_timeline(
    db: AsyncSession,
    attempt_id: uuid.UUID,
    current_user: User,
) -> list[ProctoringEventResponse]:
    """Integrity trail of one attempt, scoped to the caller's offering."""
    await _assert_can_manage_attempt(
        db,
        attempt_id,
        current_user,
        purpose="examination invigilation",
        allow_exam_bureau=True,
    )
    query = (
        select(ProctoringEvent)
        .where(ProctoringEvent.attempt_id == attempt_id)
        .order_by(ProctoringEvent.timestamp.asc())
    )
    res = await db.execute(query)
    events = list(res.scalars().all())
    responses: list[ProctoringEventResponse] = []
    for event in events:
        details = dict(event.details or {})
        purged_at = details.pop(EVIDENCE_PURGED_AT_KEY, None)
        responses.append(
            ProctoringEventResponse(
                id=event.id,
                attempt_id=event.attempt_id,
                event_type=event.event_type,
                timestamp=event.timestamp,
                severity=event.severity,
                details=details,
                evidence_purged_at=purged_at,
                event_category=_proctoring_event_category(event.event_type),
            )
        )
    return responses


async def export_exam_results_csv(
    db: AsyncSession, exam_id: uuid.UUID, current_user: User
) -> tuple[str, str]:
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise NotFoundError("Exam not found")

    # The results CSV is the cohort gradebook on paper: teaching or
    # administrative scope only, never the examination bureau.
    await _assert_can_manage_exam(
        db,
        exam,
        current_user,
        purpose="exam grading and result publication",
        allow_exam_bureau=False,
    )

    attempts = await _attempts_for_exam(db, exam_id=exam_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Attempt ID",
            "Student ID",
            "Student Name",
            "Student Email",
            "Attempt Number",
            "Status",
            "Started At",
            "Submitted At",
            "Proctor Violations",
            "Total Score",
            "Max Marks",
            "Percentage",
        ]
    )

    for att in attempts:
        name = f"{att.student.first_name} {att.student.last_name}" if att.student else ""
        email = att.student.email if att.student else ""
        writer.writerow(
            [
                str(att.id),
                str(att.student_id),
                name,
                email,
                att.attempt_number,
                att.status,
                att.started_at.isoformat() if att.started_at else "",
                att.submitted_at.isoformat() if att.submitted_at else "",
                att.proctor_violations_count,
                att.total_score if att.total_score is not None else "",
                exam.total_marks,
                att.percentage if att.percentage is not None else "",
            ]
        )

    sanitized_title = "".join(c if c.isalnum() else "_" for c in exam.title)
    filename = f"{sanitized_title}_results.csv"
    return output.getvalue(), filename

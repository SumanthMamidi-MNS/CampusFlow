import csv
import io
import math
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from campusflow.bedrock.api.errors import AuthorizationError, NotFoundError
from campusflow.bedrock.audit.service import record_audit_event
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
    BatchSaveAnswersRequest,
    ExamCreate,
    ExamDeliveryResponse,
    ExamQuestionBatchAdd,
    ExamQuestionResponse,
    ExamQuestionStudentDelivery,
    ExamUpdate,
    GradeSingleResponseRequest,
    ProctoringEventCreate,
    ProctoringEventResponse,
    ProctoringStatusResponse,
    StudentExamResultResponse,
)
from campusflow.domain.exams.schemas import (
    ExamResponse as ExamResponseSchema,
)
from campusflow.domain.notifications.service import (
    create_notification,
    send_notification_email_if_enabled,
)
from campusflow.domain.question_banks.models import Question
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
        raise HTTPException(status_code=400, detail="End window must be strictly after start window.")

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
        config=payload.config or {
            "shuffle_questions": False,
            "shuffle_options": False,
            "auto_grade": True,
            "show_results_immediately": False,
            "proctoring_enabled": True,
            "max_violations": 5,
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


def serialize_exam_with_questions(exam: Exam, q_list: list[ExamQuestionResponse]) -> ExamResponseSchema:
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


async def get_exam(db: AsyncSession, exam_id: uuid.UUID) -> ExamResponseSchema:
    query = (
        select(Exam)
        .where(Exam.id == exam_id)
        .options(
            selectinload(Exam.course_offering).selectinload(CourseOffering.course),
            selectinload(Exam.questions).selectinload(ExamQuestion.question).selectinload(Question.options),
        )
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
                negative_marks=eq.negative_marks_override if eq.negative_marks_override is not None else q.negative_marks,
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
            selectinload(Exam.questions).selectinload(ExamQuestion.question).selectinload(Question.options),
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
                    negative_marks=eq.negative_marks_override if eq.negative_marks_override is not None else q.negative_marks,
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

    update_dict = payload.model_dump(exclude_unset=True)
    if "start_window" in update_dict and update_dict["start_window"]:
        update_dict["start_window"] = normalize_datetime(update_dict["start_window"])
    if "end_window" in update_dict and update_dict["end_window"]:
        update_dict["end_window"] = normalize_datetime(update_dict["end_window"])

    for field, value in update_dict.items():
        setattr(exam, field, value)

    await db.commit()
    await db.refresh(exam)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="exam.update",
        resource_type="exam",
        resource_id=str(exam.id),
        changes=update_dict,
    )
    return exam


async def delete_exam(
    db: AsyncSession,
    exam_id: uuid.UUID,
    current_user: User,
) -> None:
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise NotFoundError("Exam not found")

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

    # Get current max sort_order
    curr_order_res = await db.execute(
        select(func.coalesce(func.max(ExamQuestion.sort_order), -1)).where(ExamQuestion.exam_id == exam_id)
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
            selectinload(Exam.questions).selectinload(ExamQuestion.question).selectinload(Question.options),
        )
    )
    res = await db.execute(query)
    exam = res.scalar_one_or_none()
    if not exam:
        raise NotFoundError("Exam not found")

    now = get_utc_now()
    start_win = normalize_datetime(exam.start_window)
    end_win = normalize_datetime(exam.end_window)

    if now < start_win:
        raise HTTPException(
            status_code=400,
            detail=f"Exam has not started yet. Available from {start_win.isoformat()}.",
        )
    if now > end_win:
        raise HTTPException(status_code=400, detail="Exam testing window has concluded.")

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
            detail="Exam session is locked due to integrity violations (6/6 warnings reached). Awaiting faculty authorization to resume.",
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

    # Build student delivery questions (without revealing is_correct!)
    delivery_questions: list[ExamQuestionStudentDelivery] = []
    for eq in exam.questions:
        q = eq.question
        delivery_questions.append(
            ExamQuestionStudentDelivery(
                id=eq.id,
                question_id=eq.question_id,
                sort_order=eq.sort_order,
                marks=eq.marks_override if eq.marks_override is not None else q.marks,
                negative_marks=eq.negative_marks_override if eq.negative_marks_override is not None else q.negative_marks,
                question_type=q.question_type,
                body=q.body,
                options=[{"label": o.label, "body": o.body} for o in q.options],
            )
        )

    # Saved responses map
    saved_answers: dict[str, dict[str, Any]] = {}
    if active_attempt and active_attempt.responses:
        for r in active_attempt.responses:
            saved_answers[str(r.exam_question_id)] = {
                "answer_data": r.answer_data,
                "flagged_for_review": r.flagged_for_review,
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
        .options(selectinload(ExamAttempt.exam), selectinload(ExamAttempt.responses))
    )
    res = await db.execute(query)
    attempt = res.scalar_one_or_none()
    if not attempt:
        raise NotFoundError("Exam attempt not found")

    if attempt.student_id != student_user.id:
        raise AuthorizationError("Unauthorized attempt access.")

    if attempt.status != "in_progress":
        raise HTTPException(status_code=400, detail="Cannot save answers to an attempt that is not in progress.")

    # Time expiration check with 60-second network grace period
    now = get_utc_now()
    started = normalize_datetime(attempt.started_at)
    total_allowed = attempt.exam.duration_minutes * 60
    if (now - started).total_seconds() > total_allowed + 60:
        await submit_attempt(db, attempt_id, student_user, is_auto_submit=True)
        raise HTTPException(status_code=400, detail="Exam time expired. Attempt auto-submitted.")

    # Upsert responses
    resp_map = {r.exam_question_id: r for r in attempt.responses}

    for item in payload.answers:
        if item.exam_question_id in resp_map:
            resp = resp_map[item.exam_question_id]
            resp.answer_data = item.answer_data
            resp.time_spent_seconds += item.time_spent_seconds
            resp.flagged_for_review = item.flagged_for_review
        else:
            resp = ExamResponse(
                attempt_id=attempt.id,
                exam_question_id=item.exam_question_id,
                answer_data=item.answer_data,
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
            selectinload(ExamAttempt.exam).selectinload(Exam.questions).selectinload(ExamQuestion.question).selectinload(Question.options),
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
        neg_marks = eq.negative_marks_override if eq.negative_marks_override is not None else q.negative_marks

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

            if val is not None and target is not None and math.isclose(float(val), float(target), abs_tol=float(tolerance)):
                resp.marks_awarded = marks
            else:
                resp.marks_awarded = -neg_marks if neg_marks > 0 else 0.0
            resp.is_auto_graded = True
            total_score += resp.marks_awarded

        elif q.question_type == "fill_blank":
            user_blanks = [str(b).strip().lower() for b in ans.get("blanks", [])]
            accepted = [str(a).strip().lower() for a in (q.metadata_info or {}).get("accepted_answers", [])]
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
    attempt.percentage = round((attempt.total_score / exam.total_marks) * 100, 2) if exam.total_marks > 0 else 0.0

    if all_graded:
        attempt.status = "graded"


# ── Manual Grading Workflow ─────────────────────────────────────────────────

async def list_attempts_for_exam(
    db: AsyncSession,
    exam_id: uuid.UUID,
) -> list[ExamAttempt]:
    query = (
        select(ExamAttempt)
        .where(ExamAttempt.exam_id == exam_id)
        .options(selectinload(ExamAttempt.student))
        .order_by(desc(ExamAttempt.submitted_at))
    )
    res = await db.execute(query)
    return list(res.scalars().all())


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
    attempt.percentage = round((attempt.total_score / exam.total_marks) * 100, 2) if exam.total_marks > 0 else 0.0
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
    att_res = await db.execute(select(ExamAttempt.student_id).where(ExamAttempt.exam_id == exam_id).distinct())
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
            selectinload(ExamAttempt.responses).selectinload(ExamResponse.exam_question).selectinload(ExamQuestion.question).selectinload(Question.options),
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
        correct_summary = ", ".join(o.label for o in q.options if o.is_correct) if q.options else None

        response_details.append({
            "id": r.id,
            "exam_question_id": r.exam_question_id,
            "question_type": q.question_type,
            "question_body": q.body,
            "max_marks": eq.marks_override if eq.marks_override is not None else q.marks,
            "answer_data": r.answer_data,
            "marks_awarded": r.marks_awarded,
            "is_auto_graded": r.is_auto_graded,
            "feedback": r.feedback,
            "correct_answer_summary": correct_summary,
        })

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


# ── Proctoring & Violation Monitoring ───────────────────────────────────────

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

    if attempt.status != "in_progress":
        return ProctoringStatusResponse(
            violations_count=attempt.proctor_violations_count,
            max_violations=(attempt.exam.config or {}).get("max_violations", 6),
            auto_submitted=True,
            is_locked=attempt.status == "locked_violation",
            status=attempt.status,
            warning="Exam attempt already concluded or locked.",
        )

    # Record event
    event = ProctoringEvent(
        attempt_id=attempt.id,
        event_type=payload.event_type,
        timestamp=payload.timestamp or get_utc_now(),
        severity=payload.severity,
        details=payload.details,
    )
    db.add(event)

    attempt.proctor_violations_count += 1
    max_violations = (attempt.exam.config or {}).get("max_violations", 6)

    auto_submitted = False
    is_locked = False
    warning = None

    is_phone_violation = payload.event_type in ("mobile_phone_detected", "phone_detected", "unauthorized_device_detected")

    if is_phone_violation or attempt.proctor_violations_count >= max_violations:
        flags = list(attempt.proctor_flags)
        if is_phone_violation and "phone_detected" not in flags:
            flags.append("phone_detected")
        if "max_violations_exceeded" not in flags and not is_phone_violation:
            flags.append("max_violations_exceeded")
        attempt.proctor_flags = flags
        attempt.status = "locked_violation"
        auto_submitted = True
        is_locked = True
        if is_phone_violation:
            attempt.proctor_violations_count = max_violations
            warning = "CRITICAL SECURITY BREACH: Mobile phone detected during exam session. Exam has been instantly terminated and locked. Direct faculty authorization required."
            action_name = "exam.attempt_locked_phone_detected"
        else:
            warning = f"Maximum proctoring violation limit ({max_violations}) reached. Exam session has been locked and suspended. Faculty permission required to continue."
            action_name = "exam.attempt_locked_violation"

        await record_audit_event(
            db=db,
            user_id=student_user.id,
            user_email=student_user.email,
            action=action_name,
            resource_type="exam_attempt",
            resource_id=str(attempt.id),
            extra_data={"violations_count": attempt.proctor_violations_count, "max_violations": max_violations, "event_type": payload.event_type},
        )
    else:
        warning = f"Security Alert: {payload.event_type.replace('_', ' ')} detected (Violation {attempt.proctor_violations_count} of {max_violations})."

    await db.commit()

    return ProctoringStatusResponse(
        violations_count=attempt.proctor_violations_count,
        max_violations=max_violations,
        auto_submitted=auto_submitted,
        is_locked=is_locked,
        status=attempt.status,
        warning=warning,
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

    attempt.status = "in_progress"
    if reset_violations:
        attempt.proctor_violations_count = 0
    else:
        attempt.proctor_violations_count = max(0, attempt.proctor_violations_count - 1)

    flags = [f for f in attempt.proctor_flags if f != "max_violations_exceeded"]
    flags.append(f"unlocked_by_{faculty_user.email}")
    attempt.proctor_flags = flags

    await record_audit_event(
        db=db,
        user_id=faculty_user.id,
        user_email=faculty_user.email,
        action="exam.attempt_unlocked",
        resource_type="exam_attempt",
        resource_id=str(attempt.id),
        extra_data={"reason": reason, "violations_reset_to": attempt.proctor_violations_count},
    )

    await db.commit()
    await db.refresh(attempt)
    return attempt


async def get_proctoring_timeline(
    db: AsyncSession,
    attempt_id: uuid.UUID,
) -> list[ProctoringEventResponse]:
    query = (
        select(ProctoringEvent)
        .where(ProctoringEvent.attempt_id == attempt_id)
        .order_by(ProctoringEvent.timestamp.asc())
    )
    res = await db.execute(query)
    events = list(res.scalars().all())
    return [ProctoringEventResponse.model_validate(e) for e in events]


async def export_exam_results_csv(
    db: AsyncSession, exam_id: uuid.UUID
) -> tuple[str, str]:
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise NotFoundError("Exam not found")

    attempts = await list_attempts_for_exam(db, exam_id=exam_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
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
    ])

    for att in attempts:
        name = f"{att.student.first_name} {att.student.last_name}" if att.student else ""
        email = att.student.email if att.student else ""
        writer.writerow([
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
        ])

    sanitized_title = "".join(c if c.isalnum() else "_" for c in exam.title)
    filename = f"{sanitized_title}_results.csv"
    return output.getvalue(), filename


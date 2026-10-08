import csv
import io
import math
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from campusflow.bedrock.api.errors import NotFoundError
from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.rbac.service import get_user_roles
from campusflow.bedrock.storage.service import get_storage
from campusflow.domain.assignments.models import (
    Assignment,
    AssignmentSubmission,
    SubmissionGrade,
)
from campusflow.domain.assignments.schemas import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentSubmissionResponse,
    AssignmentUpdate,
    GradebookResponse,
    GradebookStudentEntry,
    GradeSubmissionRequest,
    MyAssignmentGrade,
    MyCourseGradesResponse,
    SubmissionGradeResponse,
)
from campusflow.domain.courses.access import (
    assert_can_manage_offering,
    assert_can_view_offering,
)
from campusflow.domain.courses.models import CourseOffering, FacultyAssignment
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.notifications.service import (
    create_notification,
    create_notifications_bulk,
    send_notification_email_if_enabled,
)
from campusflow.domain.users.models import User


# ── Assignments CRUD ────────────────────────────────────────────────────────
async def create_assignment(
    db: AsyncSession,
    payload: AssignmentCreate,
    current_user: User,
) -> Assignment:
    offering = await db.get(CourseOffering, payload.course_offering_id)
    if not offering:
        raise NotFoundError("Course offering not found")

    rubric_data = [r.model_dump() for r in payload.rubric] if payload.rubric else None

    assignment = Assignment(
        course_offering_id=payload.course_offering_id,
        title=payload.title,
        description=payload.description,
        assignment_type=payload.assignment_type,
        due_date=payload.due_date,
        total_marks=payload.total_marks,
        pass_marks=payload.pass_marks,
        weightage=payload.weightage,
        allow_late=payload.allow_late,
        late_penalty_percent_per_day=payload.late_penalty_percent_per_day,
        max_late_days=payload.max_late_days,
        rubric=rubric_data,
        is_published=payload.is_published,
        published_at=datetime.now(UTC) if payload.is_published else None,
        created_by_id=current_user.id,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)

    # Notify enrolled students
    if assignment.is_published:
        enrolled_res = await db.execute(
            select(Enrollment.student_id).where(
                Enrollment.course_offering_id == assignment.course_offering_id,
                Enrollment.status == "enrolled",
            )
        )
        student_ids = list(enrolled_res.scalars().all())
        if student_ids:
            await create_notifications_bulk(
                db=db,
                user_ids=student_ids,
                title=f"New Assignment: {assignment.title}",
                message=f"A new assignment has been posted: {assignment.title}. Due date: {assignment.due_date.strftime('%Y-%m-%d %H:%M UTC')}.",
                notification_type="assignment_posted",
                link=f"/courses/{assignment.course_offering_id}?tab=assignments",
            )

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="assignment.create",
        resource_type="assignment",
        resource_id=str(assignment.id),
        extra_data={"title": assignment.title, "course_offering_id": str(assignment.course_offering_id)},
    )

    return assignment


async def get_assignment(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    current_user: User,
) -> AssignmentResponse:
    query = (
        select(Assignment)
        .where(Assignment.id == assignment_id)
        .options(selectinload(Assignment.created_by))
    )
    res = await db.execute(query)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("Assignment not found")

    # Get submission for student if user is student
    my_sub_resp = None
    sub_query = (
        select(AssignmentSubmission)
        .where(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.student_id == current_user.id,
        )
        .options(selectinload(AssignmentSubmission.grade))
    )
    sub_res = await db.execute(sub_query)
    my_sub = sub_res.scalar_one_or_none()
    if my_sub:
        grade_resp = None
        if my_sub.grade:
            grade_resp = SubmissionGradeResponse.model_validate(my_sub.grade)
        my_sub_resp = AssignmentSubmissionResponse(
            id=my_sub.id,
            assignment_id=my_sub.assignment_id,
            student_id=my_sub.student_id,
            student_name=f"{current_user.first_name} {current_user.last_name}",
            student_email=current_user.email,
            status=my_sub.status,
            submitted_at=my_sub.submitted_at,
            content_text=my_sub.content_text,
            file_path=my_sub.file_path,
            file_name=my_sub.file_name,
            file_size=my_sub.file_size,
            mime_type=my_sub.mime_type,
            is_late=my_sub.is_late,
            late_days=my_sub.late_days,
            grade=grade_resp,
        )

    # Count total submissions
    count_query = (
        select(func.count(AssignmentSubmission.id))
        .where(AssignmentSubmission.assignment_id == assignment_id)
    )
    count_res = await db.execute(count_query)
    subs_count = count_res.scalar_one_or_none() or 0

    resp = AssignmentResponse.model_validate(assignment)
    resp.my_submission = my_sub_resp
    resp.submissions_count = subs_count
    return resp


async def list_assignments(
    db: AsyncSession,
    course_offering_id: uuid.UUID,
    current_user: User,
) -> list[AssignmentResponse]:
    query = (
        select(Assignment)
        .where(Assignment.course_offering_id == course_offering_id)
        .order_by(Assignment.due_date.asc())
    )
    res = await db.execute(query)
    assignments = list(res.scalars().all())

    if not assignments:
        return []

    assign_ids = [a.id for a in assignments]

    # Fetch user's own submissions if any
    sub_query = (
        select(AssignmentSubmission)
        .where(
            AssignmentSubmission.assignment_id.in_(assign_ids),
            AssignmentSubmission.student_id == current_user.id,
        )
        .options(selectinload(AssignmentSubmission.grade))
    )
    sub_res = await db.execute(sub_query)
    subs_by_assign = {s.assignment_id: s for s in sub_res.scalars().all()}

    # Fetch submissions counts for faculty/admins
    count_query = (
        select(AssignmentSubmission.assignment_id, func.count(AssignmentSubmission.id))
        .where(AssignmentSubmission.assignment_id.in_(assign_ids))
        .group_by(AssignmentSubmission.assignment_id)
    )
    count_res = await db.execute(count_query)
    counts_map = dict(count_res.all())

    results: list[AssignmentResponse] = []
    for a in assignments:
        resp = AssignmentResponse.model_validate(a)
        sub = subs_by_assign.get(a.id)
        if sub:
            grade_resp = None
            if sub.grade:
                grade_resp = SubmissionGradeResponse.model_validate(sub.grade)
            resp.my_submission = AssignmentSubmissionResponse(
                id=sub.id,
                assignment_id=sub.assignment_id,
                student_id=sub.student_id,
                student_name=f"{current_user.first_name} {current_user.last_name}",
                student_email=current_user.email,
                status=sub.status,
                submitted_at=sub.submitted_at,
                content_text=sub.content_text,
                file_path=sub.file_path,
                file_name=sub.file_name,
                file_size=sub.file_size,
                mime_type=sub.mime_type,
                is_late=sub.is_late,
                late_days=sub.late_days,
                grade=grade_resp,
            )
        resp.submissions_count = counts_map.get(a.id, 0)
        results.append(resp)

    return results


# Roles that may view assignments across every offering in the institution.
_ACADEMIC_OVERVIEW_ROLES = {"super_admin", "admin", "department_head", "exam_controller"}


async def list_my_assignments(
    db: AsyncSession,
    current_user: User,
) -> list[AssignmentResponse]:
    """Return assignments the current user should see across all their offerings.

    Students see assignments for offerings they are enrolled in; faculty see
    offerings they teach; academic-overview roles see everything.
    """
    roles = set(await get_user_roles(db, current_user.id))
    has_overview = bool(roles & _ACADEMIC_OVERVIEW_ROLES)

    offering_ids: set[uuid.UUID] = set()

    faculty_res = await db.execute(
        select(FacultyAssignment.course_offering_id).where(
            FacultyAssignment.faculty_id == current_user.id
        )
    )
    offering_ids.update(faculty_res.scalars().all())

    enroll_res = await db.execute(
        select(Enrollment.course_offering_id).where(
            Enrollment.student_id == current_user.id,
            Enrollment.status == "enrolled",
        )
    )
    offering_ids.update(enroll_res.scalars().all())

    if not has_overview and not offering_ids:
        return []

    query = select(Assignment).order_by(Assignment.due_date.asc())
    if not has_overview:
        query = query.where(Assignment.course_offering_id.in_(offering_ids))

    res = await db.execute(query)
    assignments = list(res.scalars().all())
    if not assignments:
        return []

    assign_ids = [a.id for a in assignments]

    # Offering → course metadata for display.
    offering_map: dict[uuid.UUID, CourseOffering] = {}
    offering_ids_in_use = {a.course_offering_id for a in assignments}
    offering_res = await db.execute(
        select(CourseOffering).where(CourseOffering.id.in_(offering_ids_in_use))
    )
    for offering in offering_res.scalars().all():
        offering_map[offering.id] = offering

    sub_res = await db.execute(
        select(AssignmentSubmission)
        .where(
            AssignmentSubmission.assignment_id.in_(assign_ids),
            AssignmentSubmission.student_id == current_user.id,
        )
        .options(selectinload(AssignmentSubmission.grade))
    )
    subs_by_assign = {s.assignment_id: s for s in sub_res.scalars().all()}

    count_res = await db.execute(
        select(AssignmentSubmission.assignment_id, func.count(AssignmentSubmission.id))
        .where(AssignmentSubmission.assignment_id.in_(assign_ids))
        .group_by(AssignmentSubmission.assignment_id)
    )
    counts_map = dict(count_res.all())

    results: list[AssignmentResponse] = []
    for a in assignments:
        resp = AssignmentResponse.model_validate(a)
        offering = offering_map.get(a.course_offering_id)
        if offering and offering.course:
            resp.course_code = offering.course.code
            resp.course_title = offering.course.title
        sub = subs_by_assign.get(a.id)
        if sub:
            grade_resp = (
                SubmissionGradeResponse.model_validate(sub.grade) if sub.grade else None
            )
            resp.my_submission = AssignmentSubmissionResponse(
                id=sub.id,
                assignment_id=sub.assignment_id,
                student_id=sub.student_id,
                student_name=f"{current_user.first_name} {current_user.last_name}",
                student_email=current_user.email,
                status=sub.status,
                submitted_at=sub.submitted_at,
                content_text=sub.content_text,
                file_path=sub.file_path,
                file_name=sub.file_name,
                file_size=sub.file_size,
                mime_type=sub.mime_type,
                is_late=sub.is_late,
                late_days=sub.late_days,
                grade=grade_resp,
            )
        resp.submissions_count = counts_map.get(a.id, 0)
        results.append(resp)

    return results


async def update_assignment(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    payload: AssignmentUpdate,
    current_user: User,
) -> Assignment:
    assignment = await db.get(Assignment, assignment_id)
    if not assignment:
        raise NotFoundError("Assignment not found")

    update_dict = payload.model_dump(exclude_unset=True)
    if "rubric" in update_dict and update_dict["rubric"] is not None:
        update_dict["rubric"] = [r.model_dump() if hasattr(r, "model_dump") else r for r in payload.rubric]  # type: ignore

    for field, value in update_dict.items():
        setattr(assignment, field, value)

    await db.commit()
    await db.refresh(assignment)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="assignment.update",
        resource_type="assignment",
        resource_id=str(assignment.id),
        changes=update_dict,
    )
    return assignment


async def delete_assignment(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    current_user: User,
) -> None:
    assignment = await db.get(Assignment, assignment_id)
    if not assignment:
        raise NotFoundError("Assignment not found")

    await db.delete(assignment)
    await db.commit()

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="assignment.delete",
        resource_type="assignment",
        resource_id=str(assignment.id),
    )


# ── Submissions & File Handling ─────────────────────────────────────────────
async def submit_assignment(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    current_user: User,
    content_text: str | None = None,
    file_bytes: bytes | None = None,
    filename: str | None = None,
    mime_type: str | None = None,
) -> AssignmentSubmission:
    assignment = await db.get(Assignment, assignment_id)
    if not assignment:
        raise NotFoundError("Assignment not found")

    # Verify enrollment
    enrollment_res = await db.execute(
        select(Enrollment).where(
            Enrollment.course_offering_id == assignment.course_offering_id,
            Enrollment.student_id == current_user.id,
            Enrollment.status == "enrolled",
        )
    )
    if not enrollment_res.scalar_one_or_none():
        # Check if user has administrative override role
        user_roles_res = await db.execute(
            select(User).where(User.id == current_user.id).options(selectinload(User.user_roles))
        )
        u = user_roles_res.scalar_one()
        role_names = [ur.role.name for ur in getattr(u, "user_roles", []) if ur.role]
        if not any(r in ("super_admin", "admin", "faculty") for r in role_names):
            raise HTTPException(status_code=403, detail="You are not enrolled in this course offering.")

    # Calculate deadline and late status
    now = datetime.now(UTC)
    due = assignment.due_date
    if due.tzinfo is None:
        due = due.replace(tzinfo=UTC)

    is_late = False
    late_days = 0
    if now > due:
        if not assignment.allow_late:
            raise HTTPException(
                status_code=400,
                detail="Late submissions are not accepted for this assignment.",
            )
        diff_seconds = (now - due).total_seconds()
        late_days = math.ceil(diff_seconds / 86400)
        if assignment.max_late_days > 0 and late_days > assignment.max_late_days:
            raise HTTPException(
                status_code=400,
                detail=f"Submission is {late_days} days late, which exceeds maximum allowed {assignment.max_late_days} days.",
            )
        is_late = True

    # Handle file upload if provided
    file_path = None
    file_size = None
    if file_bytes and filename:
        storage = get_storage()
        clean_name = "".join(c for c in filename if c.isalnum() or c in "._- ")
        storage_path = f"submissions/{assignment_id}/{current_user.id}_{uuid.uuid4().hex[:8]}_{clean_name}"
        await storage.upload(storage_path, file_bytes, content_type=mime_type or "application/octet-stream")
        file_path = storage_path
        file_size = len(file_bytes)

    # Check for existing submission
    existing_res = await db.execute(
        select(AssignmentSubmission).where(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.student_id == current_user.id,
        )
    )
    submission = existing_res.scalar_one_or_none()

    if submission:
        submission.submitted_at = now
        submission.is_late = is_late
        submission.late_days = late_days
        submission.status = "submitted"
        if content_text is not None:
            submission.content_text = content_text
        if file_path:
            submission.file_path = file_path
            submission.file_name = filename
            submission.file_size = file_size
            submission.mime_type = mime_type
    else:
        submission = AssignmentSubmission(
            assignment_id=assignment_id,
            student_id=current_user.id,
            status="submitted",
            submitted_at=now,
            content_text=content_text,
            file_path=file_path,
            file_name=filename,
            file_size=file_size,
            mime_type=mime_type,
            is_late=is_late,
            late_days=late_days,
        )
        db.add(submission)

    await db.commit()
    await db.refresh(submission)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="assignment.submit",
        resource_type="assignment_submission",
        resource_id=str(submission.id),
        extra_data={"assignment_id": str(assignment_id), "is_late": is_late, "late_days": late_days},
    )

    return submission


async def get_my_submission(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    current_user: User,
) -> AssignmentSubmission | None:
    query = (
        select(AssignmentSubmission)
        .where(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.student_id == current_user.id,
        )
        .options(
            selectinload(AssignmentSubmission.grade),
            selectinload(AssignmentSubmission.student),
        )
    )
    res = await db.execute(query)
    return res.scalar_one_or_none()


async def list_submissions(
    db: AsyncSession,
    assignment_id: uuid.UUID,
) -> list[AssignmentSubmission]:
    query = (
        select(AssignmentSubmission)
        .where(AssignmentSubmission.assignment_id == assignment_id)
        .options(
            selectinload(AssignmentSubmission.grade),
            selectinload(AssignmentSubmission.student),
        )
        .order_by(desc(AssignmentSubmission.submitted_at))
    )
    res = await db.execute(query)
    return list(res.scalars().all())


async def download_submission_file(
    db: AsyncSession,
    submission_id: uuid.UUID,
    current_user: User,
) -> tuple[bytes, str, str]:
    submission = await db.get(AssignmentSubmission, submission_id)
    if not submission or not submission.file_path:
        raise NotFoundError("Submission file not found")

    # Access check: student owner or faculty/admin
    if submission.student_id != current_user.id:
        user_roles_res = await db.execute(
            select(User).where(User.id == current_user.id).options(selectinload(User.user_roles))
        )
        u = user_roles_res.scalar_one()
        role_names = [ur.role.name for ur in getattr(u, "user_roles", []) if ur.role]
        if not any(r in ("super_admin", "admin", "faculty", "department_head") for r in role_names):
            raise HTTPException(status_code=403, detail="Forbidden: You cannot access this student's file.")

    storage = get_storage()
    file_bytes = await storage.download(submission.file_path)
    filename = submission.file_name or "submission.bin"
    mime_type = submission.mime_type or "application/octet-stream"
    return file_bytes, filename, mime_type


# ── Grading ─────────────────────────────────────────────────────────────────
async def grade_submission(
    db: AsyncSession,
    submission_id: uuid.UUID,
    payload: GradeSubmissionRequest,
    current_user: User,
) -> SubmissionGrade:
    query = (
        select(AssignmentSubmission)
        .where(AssignmentSubmission.id == submission_id)
        .options(
            selectinload(AssignmentSubmission.assignment),
            selectinload(AssignmentSubmission.grade),
            selectinload(AssignmentSubmission.student),
        )
    )
    res = await db.execute(query)
    submission = res.scalar_one_or_none()
    if not submission:
        raise NotFoundError("Submission not found")

    assignment = submission.assignment
    if payload.marks_obtained < 0 or payload.marks_obtained > assignment.total_marks:
        raise HTTPException(
            status_code=400,
            detail=f"Marks obtained must be between 0 and {assignment.total_marks}.",
        )

    # Calculate late penalty
    penalty_deducted = 0.0
    if submission.is_late and assignment.late_penalty_percent_per_day > 0:
        penalty_pct = min(100.0, submission.late_days * assignment.late_penalty_percent_per_day)
        penalty_deducted = round(payload.marks_obtained * (penalty_pct / 100.0), 2)

    final_marks = max(0.0, round(payload.marks_obtained - penalty_deducted, 2))

    now = datetime.now(UTC)
    grade = submission.grade
    if grade:
        grade.graded_by_id = current_user.id
        grade.marks_obtained = payload.marks_obtained
        grade.penalty_deducted = penalty_deducted
        grade.final_marks = final_marks
        grade.feedback = payload.feedback
        grade.rubric_evaluation = payload.rubric_evaluation
        grade.graded_at = now
    else:
        grade = SubmissionGrade(
            submission_id=submission_id,
            graded_by_id=current_user.id,
            marks_obtained=payload.marks_obtained,
            penalty_deducted=penalty_deducted,
            final_marks=final_marks,
            feedback=payload.feedback,
            rubric_evaluation=payload.rubric_evaluation,
            graded_at=now,
        )
        db.add(grade)

    submission.status = "graded"
    await db.commit()
    await db.refresh(grade)

    # Notify student
    await create_notification(
        db=db,
        user_id=submission.student_id,
        title=f"Assignment Graded: {assignment.title}",
        message=f"Your submission for '{assignment.title}' was graded. Score: {final_marks}/{assignment.total_marks}.",
        notification_type="submission_graded",
        link=f"/courses/{assignment.course_offering_id}?tab=assignments",
    )
    await send_notification_email_if_enabled(
        db=db,
        user_id=submission.student_id,
        category="grades",
        subject=f"Assignment Graded: {assignment.title}",
        body_text=f"Your submission for '{assignment.title}' was graded. Score: {final_marks}/{assignment.total_marks}.",
    )


    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="assignment.grade",
        resource_type="submission_grade",
        resource_id=str(grade.id),
        extra_data={
            "submission_id": str(submission_id),
            "marks_obtained": payload.marks_obtained,
            "penalty_deducted": penalty_deducted,
            "final_marks": final_marks,
        },
    )

    return grade


# ── Gradebook Aggregation & Export ──────────────────────────────────────────
async def get_course_gradebook(
    db: AsyncSession,
    course_offering_id: uuid.UUID,
    current_user: User,
) -> GradebookResponse:
    """Cohort gradebook. Teaching or administrative scope over the offering only."""
    offering = await db.get(CourseOffering, course_offering_id)
    if not offering:
        raise NotFoundError("Course offering not found")

    await assert_can_manage_offering(
        db, current_user, course_offering_id, purpose="course gradebook"
    )

    # Get published assignments
    assign_res = await db.execute(
        select(Assignment)
        .where(
            Assignment.course_offering_id == course_offering_id,
            Assignment.is_published.is_(True),
        )
        .order_by(Assignment.due_date.asc())
    )
    assignments = list(assign_res.scalars().all())

    # Get enrolled students
    enroll_res = await db.execute(
        select(Enrollment)
        .where(
            Enrollment.course_offering_id == course_offering_id,
        )
        .options(selectinload(Enrollment.student))
        .order_by(Enrollment.enrolled_at.asc())
    )
    enrollments = list(enroll_res.scalars().all())

    # Fetch all submissions with grades for this course's assignments
    assign_ids = [a.id for a in assignments]
    subs_map: dict[tuple[uuid.UUID, uuid.UUID], float] = {}  # (assignment_id, student_id) -> final_marks
    if assign_ids:
        sub_query = (
            select(AssignmentSubmission)
            .where(
                AssignmentSubmission.assignment_id.in_(assign_ids),
            )
            .options(selectinload(AssignmentSubmission.grade))
        )
        sub_res = await db.execute(sub_query)
        for s in sub_res.scalars().all():
            if s.grade:
                subs_map[(s.assignment_id, s.student_id)] = s.grade.final_marks

    max_possible_weighted = sum(a.weightage for a in assignments)

    students_entries: list[GradebookStudentEntry] = []
    for enr in enrollments:
        student = enr.student
        scores: dict[str, float | None] = {}
        total_weighted = 0.0

        for a in assignments:
            score = subs_map.get((a.id, student.id))
            scores[str(a.id)] = score
            if score is not None and a.total_marks > 0:
                ratio = min(1.0, score / a.total_marks)
                total_weighted += ratio * a.weightage

        pct = (
            round((total_weighted / max_possible_weighted) * 100.0, 2)
            if max_possible_weighted > 0
            else 0.0
        )

        students_entries.append(
            GradebookStudentEntry(
                student_id=student.id,
                student_name=f"{student.first_name} {student.last_name}",
                student_email=student.email,
                enrollment_status=enr.status,
                assignment_scores=scores,
                total_weighted_score=round(total_weighted, 2),
                max_possible_weighted=round(max_possible_weighted, 2),
                percentage=pct,
            )
        )

    assign_summary = [
        {
            "id": str(a.id),
            "title": a.title,
            "total_marks": a.total_marks,
            "weightage": a.weightage,
        }
        for a in assignments
    ]

    return GradebookResponse(
        course_offering_id=course_offering_id,
        # The course's real title. Previously this was built from `offering.section`,
        # which already reads "Section A" and produced "Section Section A".
        course_title=offering.course.title if offering.course else "Course",
        assignments=assign_summary,
        students=students_entries,
    )


async def export_course_gradebook_csv(
    db: AsyncSession,
    course_offering_id: uuid.UUID,
    current_user: User,
) -> str:
    gb = await get_course_gradebook(db, course_offering_id, current_user)
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    header = ["Student Name", "Email", "Status"]
    for a in gb.assignments:
        header.append(f"{a['title']} (Max: {a['total_marks']}, W: {a['weightage']}%)")
    max_w = gb.students[0].max_possible_weighted if gb.students else 100
    header.extend(["Total Weighted Score", f"Max Weight ({max_w})", "Overall Percentage (%)"])
    writer.writerow(header)

    # Rows
    for s in gb.students:
        row = [s.student_name, s.student_email, s.enrollment_status]
        for a in gb.assignments:
            score = s.assignment_scores.get(a["id"])
            row.append(str(score) if score is not None else "-")
        row.append(str(s.total_weighted_score))
        row.append(str(s.max_possible_weighted))
        row.append(f"{s.percentage}%")
        writer.writerow(row)

    return output.getvalue()


# ── Self-scoped student grades ──────────────────────────────────────────────
async def get_my_course_grades(
    db: AsyncSession,
    course_offering_id: uuid.UUID,
    student_user: User,
) -> MyCourseGradesResponse:
    """The caller's own marks in one offering — never the cohort.

    Uses the same weighted arithmetic as the staff gradebook so a student and
    their instructor always read the same number.
    """
    offering = await db.get(CourseOffering, course_offering_id)
    if not offering:
        raise NotFoundError("Course offering not found")

    await assert_can_view_offering(
        db, student_user, course_offering_id, purpose="your course grades"
    )

    assign_res = await db.execute(
        select(Assignment)
        .where(
            Assignment.course_offering_id == course_offering_id,
            Assignment.is_published.is_(True),
        )
        .order_by(Assignment.due_date.asc())
    )
    assignments = list(assign_res.scalars().all())

    my_subs: dict[uuid.UUID, AssignmentSubmission] = {}
    if assignments:
        sub_res = await db.execute(
            select(AssignmentSubmission)
            .where(
                AssignmentSubmission.assignment_id.in_([a.id for a in assignments]),
                AssignmentSubmission.student_id == student_user.id,
            )
            .options(selectinload(AssignmentSubmission.grade))
        )
        my_subs = {s.assignment_id: s for s in sub_res.scalars().all()}

    entries: list[MyAssignmentGrade] = []
    total_weighted = 0.0
    for a in assignments:
        submission = my_subs.get(a.id)
        grade = submission.grade if submission else None
        if grade is not None and a.total_marks > 0:
            ratio = min(1.0, grade.final_marks / a.total_marks)
            total_weighted += ratio * a.weightage
        entries.append(
            MyAssignmentGrade(
                assignment_id=a.id,
                title=a.title,
                total_marks=a.total_marks,
                weightage=a.weightage,
                due_date=a.due_date,
                submission_status=submission.status if submission else None,
                submitted_at=submission.submitted_at if submission else None,
                is_late=submission.is_late if submission else False,
                marks_obtained=grade.marks_obtained if grade else None,
                penalty_deducted=grade.penalty_deducted if grade else None,
                final_marks=grade.final_marks if grade else None,
                feedback=grade.feedback if grade else None,
                graded_at=grade.graded_at if grade else None,
            )
        )

    max_possible_weighted = sum(a.weightage for a in assignments)
    percentage = (
        round((total_weighted / max_possible_weighted) * 100.0, 2)
        if max_possible_weighted > 0
        else 0.0
    )

    return MyCourseGradesResponse(
        course_offering_id=course_offering_id,
        course_title=offering.course.title if offering.course else "Course",
        student_id=student_user.id,
        assignments=entries,
        total_weighted_score=round(total_weighted, 2),
        max_possible_weighted=round(max_possible_weighted, 2),
        percentage=percentage,
    )

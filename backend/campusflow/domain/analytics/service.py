import statistics
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from campusflow.bedrock.api.errors import NotFoundError
from campusflow.bedrock.audit.models import AuditLog
from campusflow.bedrock.rbac.models import Role, UserRole
from campusflow.domain.analytics.schemas import (
    CourseAnalyticsResponse,
    ExamAnalyticsResponse,
    InstitutionalOverviewResponse,
    StudentDashboardAnalyticsResponse,
)
from campusflow.domain.assignments.models import (
    Assignment,
    AssignmentSubmission,
    SubmissionGrade,
)
from campusflow.domain.courses.access import assert_can_manage_offering
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamAttempt
from campusflow.domain.users.models import User


async def get_institutional_overview(db: AsyncSession) -> InstitutionalOverviewResponse:
    # 1. User counts by role
    student_role_q = select(UserRole.user_id).join(Role, Role.id == UserRole.role_id).where(Role.name == "student")
    student_res = await db.execute(student_role_q)
    total_students = len(set(student_res.scalars().all()))

    faculty_role_q = select(UserRole.user_id).join(Role, Role.id == UserRole.role_id).where(Role.name.in_(["faculty", "department_head"]))
    faculty_res = await db.execute(faculty_role_q)
    total_faculty = len(set(faculty_res.scalars().all()))

    # 2. Total departments, courses, exams, submissions
    dept_res = await db.execute(select(func.count(Department.id)))
    total_departments = dept_res.scalar_one_or_none() or 0

    course_res = await db.execute(select(func.count(CourseOffering.id)))
    total_courses = course_res.scalar_one_or_none() or 0

    exam_res = await db.execute(select(func.count(Exam.id)))
    total_exams = exam_res.scalar_one_or_none() or 0

    sub_res = await db.execute(select(func.count(AssignmentSubmission.id)))
    total_submissions = sub_res.scalar_one_or_none() or 0

    # 3. Overall pass rate across all graded exam attempts
    att_res = await db.execute(
        select(ExamAttempt.percentage).where(
            ExamAttempt.percentage.is_not(None),
            ExamAttempt.status.in_(["graded", "submitted", "auto_submitted"]),
        )
    )
    percentages = [p for p in att_res.scalars().all() if p is not None]
    if percentages:
        passed_count = sum(1 for p in percentages if p >= 50.0)
        overall_pass_rate = round((passed_count / len(percentages)) * 100.0, 1)
    else:
        # No graded attempts yet: report "no data" rather than a placeholder rate.
        overall_pass_rate = None

    # 4. Department breakdown
    depts_q = select(Department)
    depts_res = await db.execute(depts_q)
    departments = list(depts_res.scalars().all())

    dept_breakdown: list[dict[str, Any]] = []
    for dept in departments:
        # Count courses in dept
        c_q = select(func.count(CourseOffering.id)).join(Course, Course.id == CourseOffering.course_id).where(Course.department_id == dept.id)
        c_count_res = await db.execute(c_q)
        c_count = c_count_res.scalar_one_or_none() or 0

        # Count enrollments in dept courses
        e_q = (
            select(func.count(Enrollment.id))
            .join(CourseOffering, CourseOffering.id == Enrollment.course_offering_id)
            .join(Course, Course.id == CourseOffering.course_id)
            .where(Course.department_id == dept.id, Enrollment.status == "enrolled")
        )
        e_count_res = await db.execute(e_q)
        e_count = e_count_res.scalar_one_or_none() or 0

        dept_breakdown.append({
            "department_id": str(dept.id),
            "department_name": dept.name,
            "code": dept.code,
            "courses_count": c_count,
            "students_enrolled": e_count,
        })

    # 5. Recent audit activity
    audit_q = select(AuditLog).order_by(desc(AuditLog.created_at)).limit(8)
    audit_res = await db.execute(audit_q)
    recent_activity = [
        {
            "id": str(a.id),
            "user_email": a.user_email,
            "action": a.action,
            "resource_type": a.resource_type,
            "timestamp": a.created_at.isoformat(),
        }
        for a in audit_res.scalars().all()
    ]

    return InstitutionalOverviewResponse(
        total_students=total_students,
        total_faculty=total_faculty,
        total_departments=total_departments,
        total_courses=total_courses,
        total_exams=total_exams,
        total_submissions=total_submissions,
        overall_pass_rate=overall_pass_rate,
        department_enrollment_breakdown=dept_breakdown,
        recent_activity=recent_activity,
    )


async def get_course_analytics(
    db: AsyncSession, course_offering_id: uuid.UUID, current_user: User
) -> CourseAnalyticsResponse:
    offering_q = (
        select(CourseOffering)
        .where(CourseOffering.id == course_offering_id)
        .options(selectinload(CourseOffering.course))
    )
    res = await db.execute(offering_q)
    offering = res.scalar_one_or_none()
    if not offering:
        raise NotFoundError("Course offering not found")

    # Cohort performance is teaching/administration-only data.
    await assert_can_manage_offering(
        db, current_user, course_offering_id, purpose="course analytics", allow_exam_bureau=True
    )

    course_code = offering.course.code if offering.course else "COURSE"
    course_title = offering.course.title if offering.course else "Course"

    # Total enrolled
    enroll_q = select(func.count(Enrollment.id)).where(
        Enrollment.course_offering_id == course_offering_id,
        Enrollment.status == "enrolled",
    )
    enroll_res = await db.execute(enroll_q)
    total_enrolled = enroll_res.scalar_one_or_none() or 0

    # Assignments in this offering
    assign_q = select(Assignment).where(Assignment.course_offering_id == course_offering_id)
    assign_res = await db.execute(assign_q)
    assignments = list(assign_res.scalars().all())
    assign_ids = [a.id for a in assignments]

    # Assignment submissions
    if assign_ids:
        sub_count_q = select(func.count(AssignmentSubmission.id)).where(
            AssignmentSubmission.assignment_id.in_(assign_ids)
        )
        sub_count_res = await db.execute(sub_count_q)
        total_subs = sub_count_res.scalar_one_or_none() or 0

        possible_subs = len(assignments) * total_enrolled
        assignment_completion_rate = (
            round((total_subs / possible_subs) * 100.0, 1) if possible_subs > 0 else 0.0
        )

        grades_q = (
            select(SubmissionGrade.final_marks, Assignment.total_marks)
            .join(AssignmentSubmission, AssignmentSubmission.id == SubmissionGrade.submission_id)
            .join(Assignment, Assignment.id == AssignmentSubmission.assignment_id)
            .where(AssignmentSubmission.assignment_id.in_(assign_ids))
        )
        grades_res = await db.execute(grades_q)
        grade_pairs = grades_res.all()
        if grade_pairs:
            pcts = [(final / total) * 100.0 for final, total in grade_pairs if total > 0]
            average_assignment_score = round(statistics.mean(pcts), 1) if pcts else None
        else:
            average_assignment_score = None
    else:
        assignment_completion_rate = 0.0
        average_assignment_score = None

    # Exam attempts for exams in this offering
    exams_q = select(Exam.id).where(Exam.course_offering_id == course_offering_id)
    exams_res = await db.execute(exams_q)
    exam_ids = list(exams_res.scalars().all())

    exam_average_score = None
    exam_pcts: list[float] = []
    if exam_ids:
        att_q = select(ExamAttempt.percentage).where(
            ExamAttempt.exam_id.in_(exam_ids),
            ExamAttempt.percentage.is_not(None),
        )
        att_res = await db.execute(att_q)
        exam_pcts = [p for p in att_res.scalars().all() if p is not None]
        if exam_pcts:
            exam_average_score = round(statistics.mean(exam_pcts), 1)

    # Grade distribution calculation
    all_scores = exam_pcts or ([average_assignment_score] if average_assignment_score is not None else [])
    grade_distribution = {
        "A (90-100)": 0,
        "B (80-89)": 0,
        "C (70-79)": 0,
        "D (60-69)": 0,
        "F (<60)": 0,
    }
    for s in all_scores:
        if s >= 90:
            grade_distribution["A (90-100)"] += 1
        elif s >= 80:
            grade_distribution["B (80-89)"] += 1
        elif s >= 70:
            grade_distribution["C (70-79)"] += 1
        elif s >= 60:
            grade_distribution["D (60-69)"] += 1
        else:
            grade_distribution["F (<60)"] += 1

    pass_count = sum(1 for s in all_scores if s >= 50.0)
    overall_course_pass_rate = (
        round((pass_count / len(all_scores)) * 100.0, 1) if all_scores else None
    )

    return CourseAnalyticsResponse(
        course_offering_id=course_offering_id,
        course_code=course_code,
        course_title=course_title,
        total_enrolled=total_enrolled,
        assignment_completion_rate=assignment_completion_rate,
        average_assignment_score=average_assignment_score,
        exam_average_score=exam_average_score,
        overall_course_pass_rate=overall_course_pass_rate,
        grade_distribution=grade_distribution,
    )


async def get_exam_analytics(
    db: AsyncSession, exam_id: uuid.UUID, current_user: User
) -> ExamAnalyticsResponse:
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise NotFoundError("Exam not found")

    # The exam author, the offering's teaching staff, administrators and the
    # examination bureau may read cohort examination statistics.
    if exam.created_by_id is None or exam.created_by_id != current_user.id:
        await assert_can_manage_offering(
            db, current_user, exam.course_offering_id, purpose="exam analytics", allow_exam_bureau=True
        )

    att_q = select(ExamAttempt).where(ExamAttempt.exam_id == exam_id)
    att_res = await db.execute(att_q)
    attempts = list(att_res.scalars().all())

    total_attempts = len(attempts)
    graded_attempts = [a for a in attempts if a.total_score is not None]
    graded_count = len(graded_attempts)

    scores = [a.total_score for a in graded_attempts if a.total_score is not None]
    percentages = [a.percentage for a in graded_attempts if a.percentage is not None]

    if scores:
        average_score = round(statistics.mean(scores), 2)
        median_score = round(statistics.median(scores), 2)
        highest_score = round(max(scores), 2)
        lowest_score = round(min(scores), 2)
    else:
        average_score = None
        median_score = None
        highest_score = None
        lowest_score = None

    passing_cutoff = exam.passing_marks if exam.passing_marks is not None else (0.4 * exam.total_marks)
    if scores:
        pass_count = sum(1 for s in scores if s >= passing_cutoff)
        pass_percentage = round((pass_count / len(scores)) * 100.0, 1)
    else:
        pass_percentage = None

    score_brackets = {
        "0-40": 0,
        "41-60": 0,
        "61-80": 0,
        "81-100": 0,
    }
    for p in percentages:
        if p <= 40:
            score_brackets["0-40"] += 1
        elif p <= 60:
            score_brackets["41-60"] += 1
        elif p <= 80:
            score_brackets["61-80"] += 1
        else:
            score_brackets["81-100"] += 1

    total_violations = sum(a.proctor_violations_count for a in attempts)
    attempts_with_violations = sum(1 for a in attempts if a.proctor_violations_count > 0)
    auto_submitted_breaches = sum(1 for a in attempts if a.status == "auto_submitted")

    violation_stats = {
        "total_violations": total_violations,
        "attempts_with_violations": attempts_with_violations,
        "auto_submitted_breaches": auto_submitted_breaches,
    }

    return ExamAnalyticsResponse(
        exam_id=exam_id,
        exam_title=exam.title,
        total_attempts=total_attempts,
        graded_attempts=graded_count,
        average_score=average_score,
        median_score=median_score,
        highest_score=highest_score,
        lowest_score=lowest_score,
        pass_percentage=pass_percentage,
        score_brackets=score_brackets,
        violation_stats=violation_stats,
    )


async def get_student_dashboard_analytics(
    db: AsyncSession, student_user_id: uuid.UUID
) -> StudentDashboardAnalyticsResponse:
    now = datetime.now(UTC)

    # 1. Enrolled courses
    enroll_q = select(Enrollment.course_offering_id).where(
        Enrollment.student_id == student_user_id,
        Enrollment.status == "enrolled",
    )
    enroll_res = await db.execute(enroll_q)
    enrolled_offering_ids = list(enroll_res.scalars().all())
    enrolled_courses_count = len(enrolled_offering_ids)

    # 2. Completed assignments
    sub_q = select(AssignmentSubmission).where(
        AssignmentSubmission.student_id == student_user_id,
        AssignmentSubmission.status.in_(["submitted", "graded"]),
    )
    sub_res = await db.execute(sub_q)
    submissions = list(sub_res.scalars().all())
    completed_assignments_count = len(submissions)

    # 3. Total assignments in enrolled courses
    if enrolled_offering_ids:
        assign_count_q = select(func.count(Assignment.id)).where(
            Assignment.course_offering_id.in_(enrolled_offering_ids),
            Assignment.is_published.is_(True),
        )
        assign_count_res = await db.execute(assign_count_q)
        total_published_assignments = assign_count_res.scalar_one_or_none() or 0
        pending_assignments_count = max(0, total_published_assignments - completed_assignments_count)
    else:
        pending_assignments_count = 0

    # 4. Exams
    att_q = (
        select(ExamAttempt)
        .where(
            ExamAttempt.student_id == student_user_id,
            ExamAttempt.status.in_(["submitted", "auto_submitted", "graded"]),
        )
        .options(selectinload(ExamAttempt.exam))
    )
    att_res = await db.execute(att_q)
    attempts = list(att_res.scalars().all())
    completed_exams_count = len(attempts)

    attempted_exam_ids = [a.exam_id for a in attempts]

    upcoming_exams_count = 0
    if enrolled_offering_ids:
        upcoming_q = select(func.count(Exam.id)).where(
            Exam.course_offering_id.in_(enrolled_offering_ids),
            Exam.status.in_(["scheduled", "live"]),
            Exam.id.not_in(attempted_exam_ids) if attempted_exam_ids else True,
            Exam.end_window >= now,
        )
        upcoming_res = await db.execute(upcoming_q)
        upcoming_exams_count = upcoming_res.scalar_one_or_none() or 0

    # 5. Recent scores & overall percentage
    recent_scores: list[dict[str, Any]] = []
    all_percentages: list[float] = []

    for att in attempts:
        if att.percentage is not None:
            all_percentages.append(att.percentage)
            recent_scores.append({
                "type": "exam",
                "title": att.exam.title if att.exam else "Exam",
                "score": att.total_score,
                "percentage": att.percentage,
                "date": (att.submitted_at or att.created_at).isoformat(),
            })

    # Add graded assignment scores
    for sub in submissions:
        if sub.grade and sub.grade.final_marks is not None:
            # Look up assignment total marks
            assign = await db.get(Assignment, sub.assignment_id)
            if assign and assign.total_marks > 0:
                pct = round((sub.grade.final_marks / assign.total_marks) * 100.0, 1)
                all_percentages.append(pct)
                recent_scores.append({
                    "type": "assignment",
                    "title": assign.title,
                    "score": sub.grade.final_marks,
                    "percentage": pct,
                    "date": sub.grade.graded_at.isoformat(),
                })

    recent_scores.sort(key=lambda x: x["date"], reverse=True)
    recent_scores = recent_scores[:5]

    overall_average_percentage = (
        round(statistics.mean(all_percentages), 1) if all_percentages else None
    )

    return StudentDashboardAnalyticsResponse(
        enrolled_courses_count=enrolled_courses_count,
        completed_assignments_count=completed_assignments_count,
        pending_assignments_count=pending_assignments_count,
        completed_exams_count=completed_exams_count,
        upcoming_exams_count=upcoming_exams_count,
        overall_average_percentage=overall_average_percentage,
        recent_scores=recent_scores,
    )

from datetime import UTC, datetime, timedelta

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.assignments.models import Assignment, AssignmentSubmission, SubmissionGrade
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamAttempt, ExamQuestion
from campusflow.domain.question_banks.models import Question, QuestionBank
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_notification_preferences_workflow(client, db_session):
    # Setup student user
    student = User(
        email="student.prefs@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Ada",
        last_name="Lovelace",
        status="active",
    )
    db_session.add(student)
    await db_session.flush()
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    token = create_access_token({"sub": str(student.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Fetch initial preferences
    get_res = await client.get("/api/v1/notifications/preferences", headers=headers)
    assert get_res.status_code == 200
    pref_data = get_res.json()["data"]
    assert pref_data["email_assignments"] is True
    assert pref_data["in_app_exams"] is True

    # 2. Update preferences
    update_res = await client.put(
        "/api/v1/notifications/preferences",
        headers=headers,
        json={
            "email_assignments": False,
            "in_app_exams": False,
        },
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()["data"]
    assert updated_data["email_assignments"] is False
    assert updated_data["in_app_exams"] is False
    assert updated_data["email_grades"] is True  # unchanged


@pytest.mark.asyncio
async def test_analytics_and_exam_results_export(client, db_session):
    now = datetime.now(UTC)

    # 1. Setup Users
    admin = User(
        email="admin.analytics@campusflow.edu",
        hashed_password=get_password_hash("AdminPass123!"),
        first_name="Grace",
        last_name="Hopper",
        status="active",
    )
    faculty = User(
        email="faculty.analytics@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Alan",
        last_name="Turing",
        status="active",
    )
    student = User(
        email="student.analytics@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Claude",
        last_name="Shannon",
        status="active",
    )
    db_session.add_all([admin, faculty, student])
    await db_session.flush()

    await assign_role_to_user(db_session, admin.id, "admin")
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    admin_token = create_access_token({"sub": str(admin.id)})
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    faculty_token = create_access_token({"sub": str(faculty.id)})
    faculty_headers = {"Authorization": f"Bearer {faculty_token}"}

    student_token = create_access_token({"sub": str(student.id)})
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # 2. Setup Academic Data
    dept = Department(name="Information Theory & AI", code="ITAI-P7")
    term = AcademicTerm(name="Fall 2026 Phase 7", start_date=now.date(), end_date=(now + timedelta(days=120)).date())
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(department_id=dept.id, code="AI701", title="Machine Learning Analytics", credits=4)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(course_id=course.id, academic_term_id=term.id, section="Sec-1", status="active")
    db_session.add(offering)
    await db_session.flush()

    enrollment = Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled")
    db_session.add(enrollment)
    await db_session.flush()

    # 3. Setup Assignment & Submission
    assignment = Assignment(
        course_offering_id=offering.id,
        title="Neural Net Optimization",
        total_marks=100.0,
        due_date=now + timedelta(days=7),
        is_published=True,
    )
    db_session.add(assignment)
    await db_session.flush()

    submission = AssignmentSubmission(
        assignment_id=assignment.id,
        student_id=student.id,
        status="graded",
        submitted_at=now,
    )
    db_session.add(submission)
    await db_session.flush()

    grade = SubmissionGrade(
        submission_id=submission.id,
        graded_by_id=faculty.id,
        marks_obtained=88.0,
        final_marks=88.0,
        graded_at=now,
    )
    db_session.add(grade)
    await db_session.flush()

    # 4. Setup Exam & Attempt
    q_bank = QuestionBank(title="Analytics QB", department_id=dept.id)
    db_session.add(q_bank)
    await db_session.flush()

    q1 = Question(
        question_bank_id=q_bank.id,
        question_type="mcq",
        body="What is gradient descent?",
        marks=10.0,
        difficulty="medium",
        status="approved",
    )
    db_session.add(q1)
    await db_session.flush()

    exam = Exam(
        course_offering_id=offering.id,
        title="AI Midterm Exam",
        exam_type="midterm",
        total_marks=50.0,
        passing_marks=20.0,
        duration_minutes=60,
        start_window=now - timedelta(hours=1),
        end_window=now + timedelta(hours=5),
        status="published",
        created_by_id=faculty.id,
    )
    db_session.add(exam)
    await db_session.flush()

    exam_q = ExamQuestion(exam_id=exam.id, question_id=q1.id, sort_order=1, marks_override=10.0)
    db_session.add(exam_q)

    await db_session.flush()

    attempt = ExamAttempt(
        exam_id=exam.id,
        student_id=student.id,
        attempt_number=1,
        started_at=now - timedelta(minutes=45),
        submitted_at=now - timedelta(minutes=15),
        status="graded",
        total_score=45.0,
        percentage=90.0,
        proctor_violations_count=1,
    )
    db_session.add(attempt)
    await db_session.commit()

    # 5. Verify Institutional Overview (Admin)
    overview_res = await client.get("/api/v1/analytics/overview", headers=admin_headers)
    assert overview_res.status_code == 200
    ov = overview_res.json()["data"]
    assert ov["total_students"] >= 1
    assert ov["total_courses"] >= 1
    assert ov["total_exams"] >= 1
    assert len(ov["department_enrollment_breakdown"]) >= 1

    # 6. Verify Course Analytics (Faculty)
    course_res = await client.get(f"/api/v1/analytics/courses/{offering.id}", headers=faculty_headers)
    assert course_res.status_code == 200
    ca = course_res.json()["data"]
    assert ca["course_code"] == "AI701"
    assert ca["total_enrolled"] == 1
    assert ca["grade_distribution"]["A (90-100)"] >= 1

    # 7. Verify Exam Analytics (Faculty)
    exam_analytics_res = await client.get(f"/api/v1/analytics/exams/{exam.id}", headers=faculty_headers)
    assert exam_analytics_res.status_code == 200
    ea = exam_analytics_res.json()["data"]
    assert ea["exam_title"] == "AI Midterm Exam"
    assert ea["total_attempts"] == 1
    assert ea["average_score"] == 45.0
    assert ea["pass_percentage"] == 100.0
    assert ea["violation_stats"]["total_violations"] == 1

    # 8. Verify Exam Results CSV Export (Faculty)
    export_res = await client.get(f"/api/v1/exams/{exam.id}/export-results", headers=faculty_headers)
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers.get("content-type", "")
    csv_text = export_res.text
    assert "Attempt ID,Student ID,Student Name,Student Email" in csv_text
    assert "Shannon" in csv_text
    assert "45.0" in csv_text

    # 9. Verify Student Dashboard Analytics (Student)
    student_dash_res = await client.get("/api/v1/analytics/student/me", headers=student_headers)
    assert student_dash_res.status_code == 200
    sda = student_dash_res.json()["data"]
    assert sda["enrolled_courses_count"] == 1
    assert sda["completed_assignments_count"] == 1
    assert sda["completed_exams_count"] == 1
    assert sda["overall_average_percentage"] == 89.0  # (88 + 90) / 2
    assert len(sda["recent_scores"]) >= 1

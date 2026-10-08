from datetime import UTC, datetime, timedelta

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.assignments.models import Assignment, AssignmentSubmission
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamQuestion
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_security_headers_and_request_id(client):
    """Verify production security headers and tracing request IDs are enforced."""
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("X-XSS-Protection") == "1; mode=block"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "geolocation=()" in res.headers.get("Permissions-Policy", "")
    assert res.headers.get("X-Request-ID") is not None


@pytest.mark.asyncio
async def test_institution_branding_and_rbac(client, db_session):
    """Verify institutional settings retrieval, RBAC protection, and updates."""
    # 1. The profile is authenticated, not public: anonymous callers get 401.
    anon_res = await client.get("/api/v1/institution")
    assert anon_res.status_code == 401, anon_res.text

    # 2. Setup Admin and Student users
    admin = User(
        email="admin.settings@campusflow.edu",
        hashed_password=get_password_hash("AdminPass123!"),
        first_name="Admin",
        last_name="User",
        status="active",
    )
    student = User(
        email="student.settings@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Student",
        last_name="User",
        status="active",
    )
    db_session.add_all([admin, student])
    await db_session.flush()
    await assign_role_to_user(db_session, admin.id, "admin")
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    admin_token = create_access_token({"sub": str(admin.id)})
    student_token = create_access_token({"sub": str(student.id)})

    # Any signed-in user may read the institution profile.
    get_res = await client.get(
        "/api/v1/institution", headers={"Authorization": f"Bearer {student_token}"}
    )
    assert get_res.status_code == 200, get_res.text
    data = get_res.json()["data"]
    assert "name" in data
    assert "primary_color" in data

    # 3. Student forbidden from updating institution
    stud_res = await client.put(
        "/api/v1/institution",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"name": "Hacked University"},
    )
    assert stud_res.status_code == 403

    # 4. Admin updates institution branding
    update_res = await client.put(
        "/api/v1/institution",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Apex Institute of Science",
            "primary_color": "#059669",
            "timezone": "America/New_York",
            "contact_email": "admin@apex.edu",
            "policies": {
                "allow_late_submissions": False,
                "exam_strict_proctoring": True,
            },
        },
    )
    assert update_res.status_code == 200
    updated = update_res.json()["data"]
    assert updated["name"] == "Apex Institute of Science"
    assert updated["primary_color"] == "#059669"
    assert updated["policies"]["allow_late_submissions"] is False


@pytest.mark.asyncio
async def test_end_to_end_academic_examination_lifecycle(client, db_session):
    """Complete end-to-end verification across department, assignment, exam, proctoring, and grading."""
    now = datetime.now(UTC)

    # 1. Users setup
    faculty = User(
        email="faculty.e2e@campusflow.edu",
        hashed_password=get_password_hash("FacPass123!"),
        first_name="Alan",
        last_name="Turing",
        status="active",
    )
    student = User(
        email="student.e2e@campusflow.edu",
        hashed_password=get_password_hash("StudPass123!"),
        first_name="Grace",
        last_name="Hopper",
        status="active",
    )
    db_session.add_all([faculty, student])
    await db_session.flush()
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    faculty_token = create_access_token({"sub": str(faculty.id)})
    student_token = create_access_token({"sub": str(student.id)})
    faculty_headers = {"Authorization": f"Bearer {faculty_token}"}
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # 2. Academic structure: Dept, Term, Course, Offering, Enrollment
    dept = Department(name="Aerospace Engineering", code="AERO", description="Aero Dept")
    db_session.add(dept)
    await db_session.flush()

    term = AcademicTerm(
        name="Summer Term 2026",
        term_type="semester",
        start_date=now.date(),
        end_date=(now + timedelta(days=60)).date(),
        is_current=True,
    )
    db_session.add(term)
    await db_session.flush()

    course = Course(title="Aerodynamics I", code="AERO101", credits=3, department_id=dept.id)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(
        course_id=course.id,
        academic_term_id=term.id,
        section="A",
        status="active",
    )
    db_session.add(offering)
    await db_session.flush()

    enrollment = Enrollment(
        course_offering_id=offering.id,
        student_id=student.id,
        status="enrolled",
    )
    db_session.add(enrollment)
    await db_session.flush()

    # 3. Assignment Workflow
    assignment = Assignment(
        course_offering_id=offering.id,
        title="Airfoil Lift Simulation",
        description="Calculate lift coefficient over subsonic speeds.",
        total_marks=50.0,
        weightage=15.0,
        due_date=now + timedelta(days=5),
        allow_late=True,
        is_published=True,
        created_by_id=faculty.id,
    )
    db_session.add(assignment)
    await db_session.flush()

    # Student submits assignment
    submission = AssignmentSubmission(
        assignment_id=assignment.id,
        student_id=student.id,
        content_text="Computed Cl vs alpha curves with 0.12 maximum slope.",
        status="submitted",
        submitted_at=now,
    )
    db_session.add(submission)
    await db_session.commit()

    # Faculty grades submission
    grade_res = await client.post(
        f"/api/v1/submissions/{submission.id}/grade",
        headers=faculty_headers,
        json={
            "marks_obtained": 48.0,
            "feedback": "Outstanding computational analysis and graphs.",
        },
    )
    assert grade_res.status_code == 200
    assert grade_res.json()["data"]["final_marks"] == 48.0

    # 4. Question Bank, Questions, Exam Workflow
    qb = QuestionBank(
        title="Aerodynamics Questions",
        department_id=dept.id,
        course_id=course.id,
        created_by_id=faculty.id,
    )
    db_session.add(qb)
    await db_session.flush()

    q1 = Question(
        question_bank_id=qb.id,
        body="Bernoulli's principle states that an increase in fluid speed occurs simultaneously with a decrease in static pressure.",
        question_type="true_false",
        marks=5.0,
        status="approved",
        created_by_id=faculty.id,
    )
    db_session.add(q1)
    await db_session.flush()

    opt1 = QuestionOption(question_id=q1.id, label="A", body="True", is_correct=True, sort_order=1)
    opt2 = QuestionOption(question_id=q1.id, label="B", body="False", is_correct=False, sort_order=2)
    db_session.add_all([opt1, opt2])
    await db_session.flush()

    exam = Exam(
        title="Midterm Aero Exam",
        course_offering_id=offering.id,
        created_by_id=faculty.id,
        duration_minutes=30,
        total_marks=5.0,
        passing_marks=2.5,
        start_window=now - timedelta(hours=1),
        end_window=now + timedelta(hours=3),
        config={"proctoring_enabled": True, "max_violations": 3},
        status="scheduled",
    )
    db_session.add(exam)
    await db_session.flush()

    session_q = ExamQuestion(
        exam_id=exam.id,
        question_id=q1.id,
        sort_order=1,
        marks_override=5.0,
    )
    db_session.add(session_q)
    await db_session.commit()

    # Student starts exam
    start_res = await client.post(f"/api/v1/exams/{exam.id}/start", headers=student_headers)
    assert start_res.status_code == 200
    attempt_id = start_res.json()["data"]["attempt_id"]

    # Student logs proctoring event
    proc_res = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={
            "event_type": "tab_switch",
            "severity": "low",
            "details": {"reason": "switched to reference sheet"},
        },
    )
    assert proc_res.status_code == 200

    # Student saves answer
    save_res = await client.put(
        f"/api/v1/exam-attempts/{attempt_id}/answers",
        headers=student_headers,
        json={
            "answers": [
                {
                    "exam_question_id": str(session_q.id),
                    "answer_data": {"selected": "True"},
                    "time_spent_seconds": 45,
                }
            ]
        },
    )
    assert save_res.status_code == 200

    # Student submits exam
    submit_res = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/submit",
        headers=student_headers,
    )
    assert submit_res.status_code == 200
    assert submit_res.json()["data"]["status"] in ("submitted", "graded")
    assert submit_res.json()["data"]["total_score"] == 5.0

    # Faculty inspects proctoring timeline
    proc_log_res = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=faculty_headers,
    )
    assert proc_log_res.status_code == 200
    events = proc_log_res.json()["data"]
    assert len(events) >= 1
    assert events[0]["event_type"] == "tab_switch"

    # Faculty publishes results
    pub_res = await client.post(f"/api/v1/exams/{exam.id}/publish", headers=faculty_headers)
    assert pub_res.status_code == 200

    # Student checks published scorecard
    result_res = await client.get(f"/api/v1/exams/{exam.id}/my-result", headers=student_headers)
    assert result_res.status_code == 200
    assert result_res.json()["data"]["total_score"] == 5.0
    assert result_res.json()["data"]["percentage"] == 100.0
    assert len(result_res.json()["data"]["responses"]) == 1

    # Export CSV results
    export_res = await client.get(f"/api/v1/exams/{exam.id}/export-results", headers=faculty_headers)
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers.get("content-type", "")
    assert "Attempt ID,Student ID,Student Name,Student Email" in export_res.text
    assert "Grace Hopper,student.e2e@campusflow.edu" in export_res.text

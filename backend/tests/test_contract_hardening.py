from datetime import UTC, datetime, timedelta

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.config.settings import DEFAULT_JWT_SECRET, Settings
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.assignments.models import Assignment
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamQuestion
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User


def test_production_secret_guard_rejects_default_secret():
    # Debug deployments may use the placeholder.
    Settings(debug=True, jwt_secret_key=DEFAULT_JWT_SECRET)

    # Non-debug deployments must not.
    with pytest.raises(ValueError):
        Settings(debug=False, jwt_secret_key=DEFAULT_JWT_SECRET)

    # A real secret is accepted.
    Settings(debug=False, jwt_secret_key="a-strong-unique-production-secret-value")


@pytest.mark.asyncio
async def test_auth_rate_limit_returns_429(client):
    last_status = None
    for _ in range(25):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@campusflow.edu", "password": "wrong-password"},
        )
        last_status = resp.status_code
        if last_status == 429:
            assert resp.json()["error"]["code"] == "RATE_LIMITED"
            assert "Retry-After" in resp.headers
            break
    assert last_status == 429, "Authentication attempts were never rate limited"


@pytest.mark.asyncio
async def test_assignments_me_returns_real_cross_offering_data(client, db_session):
    faculty = User(
        email="faculty.me@campusflow.edu",
        hashed_password=get_password_hash("Pass1234!"),
        first_name="Marie",
        last_name="Curie",
        status="active",
    )
    student = User(
        email="student.me@campusflow.edu",
        hashed_password=get_password_hash("Pass1234!"),
        first_name="Niels",
        last_name="Bohr",
        status="active",
    )
    db_session.add_all([faculty, student])
    await db_session.flush()
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    student_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    dept = Department(name="Physics", code="PHY-ME")
    term = AcademicTerm(
        name="Fall 2026 ME",
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(department_id=dept.id, code="PHY101-ME", title="Classical Mechanics", credits=4)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(course_id=course.id, academic_term_id=term.id, section="A", status="active")
    db_session.add(offering)
    await db_session.flush()
    db_session.add(Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled"))

    assignment = Assignment(
        course_offering_id=offering.id,
        title="Problem Set 1",
        due_date=datetime.now(UTC) + timedelta(days=7),
        total_marks=50,
        weightage=10,
        created_by_id=faculty.id,
    )
    db_session.add(assignment)
    await db_session.commit()

    resp = await client.get("/api/v1/assignments/me", headers=student_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert len(data) == 1
    assert data[0]["title"] == "Problem Set 1"
    assert data[0]["course_code"] == "PHY101-ME"
    assert data[0]["course_title"] == "Classical Mechanics"
    assert data[0]["my_submission"] is None


@pytest.mark.asyncio
async def test_attempt_responses_endpoint_is_faculty_only(client, db_session):
    faculty = User(
        email="faculty.ar@campusflow.edu",
        hashed_password=get_password_hash("Pass1234!"),
        first_name="Emmy",
        last_name="Noether",
        status="active",
    )
    student = User(
        email="student.ar@campusflow.edu",
        hashed_password=get_password_hash("Pass1234!"),
        first_name="Paul",
        last_name="Dirac",
        status="active",
    )
    db_session.add_all([faculty, student])
    await db_session.flush()
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    faculty_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"}
    student_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    dept = Department(name="Mathematics", code="MTH-AR")
    term = AcademicTerm(
        name="Fall 2026 AR",
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db_session.add_all([dept, term])
    await db_session.flush()
    course = Course(department_id=dept.id, code="MTH101-AR", title="Analysis", credits=3)
    db_session.add(course)
    await db_session.flush()
    offering = CourseOffering(course_id=course.id, academic_term_id=term.id, section="A", status="active")
    db_session.add(offering)
    await db_session.flush()
    db_session.add(Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled"))

    bank = QuestionBank(department_id=dept.id, course_id=course.id, title="Bank AR", created_by_id=faculty.id)
    db_session.add(bank)
    await db_session.flush()
    question = Question(
        question_bank_id=bank.id,
        question_type="mcq",
        marks=5.0,
        body="Which is the derivative of x^2?",
        status="approved",
        created_by_id=faculty.id,
    )
    db_session.add(question)
    await db_session.flush()
    db_session.add(
        QuestionOption(question_id=question.id, label="A", body="2x", is_correct=True, sort_order=0)
    )

    now = datetime.now(UTC)
    exam = Exam(
        course_offering_id=offering.id,
        title="Analysis Quiz",
        exam_type="quiz",
        total_marks=5.0,
        duration_minutes=30,
        start_window=now - timedelta(minutes=5),
        end_window=now + timedelta(hours=1),
        config={"max_attempts": 1},
        status="scheduled",
        created_by_id=faculty.id,
    )
    db_session.add(exam)
    await db_session.flush()
    exam_question = ExamQuestion(exam_id=exam.id, question_id=question.id, sort_order=1)
    db_session.add(exam_question)
    await db_session.commit()

    start = await client.post(
        f"/api/v1/exams/{exam.id}/start", headers=student_headers, json={"browser_fingerprint": None}
    )
    assert start.status_code == 200, start.text
    attempt_id = start.json()["data"]["attempt_id"]
    delivery_question_id = start.json()["data"]["questions"][0]["id"]

    save = await client.put(
        f"/api/v1/exam-attempts/{attempt_id}/answers",
        headers=student_headers,
        json={
            "answers": [
                {"exam_question_id": delivery_question_id, "answer_data": {"selected": "A"}, "flagged_for_review": False}
            ]
        },
    )
    assert save.status_code == 200, save.text

    submit = await client.post(f"/api/v1/exam-attempts/{attempt_id}/submit", headers=student_headers)
    assert submit.status_code == 200, submit.text

    # Faculty can now enumerate the real response IDs for manual grading.
    faculty_view = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/responses", headers=faculty_headers
    )
    assert faculty_view.status_code == 200, faculty_view.text
    responses = faculty_view.json()["data"]
    assert len(responses) == 1
    assert responses[0]["question_type"] == "mcq"
    assert responses[0]["max_marks"] == 5.0

    student_view = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/responses", headers=student_headers
    )
    assert student_view.status_code == 403

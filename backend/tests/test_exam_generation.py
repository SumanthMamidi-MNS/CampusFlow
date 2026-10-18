from datetime import UTC, datetime, timedelta

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User


async def _setup_syllabus_exam(db_session, *, suffix: str):
    """Faculty-authored exam plus a tagged question bank (the syllabus pool)."""
    faculty = User(
        email=f"faculty.gen{suffix}@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Barbara",
        last_name="Liskov",
        status="active",
    )
    outsider = User(
        email=f"faculty.outsider{suffix}@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Grace",
        last_name="Hopper",
        status="active",
    )
    student = User(
        email=f"student.gen{suffix}@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Donald",
        last_name="Knuth",
        status="active",
    )
    db_session.add_all([faculty, outsider, student])
    await db_session.flush()
    for user in (faculty, outsider):
        await assign_role_to_user(db_session, user.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    dept = Department(name=f"Data Structures {suffix}", code=f"DS{suffix}")
    term = AcademicTerm(
        name=f"Fall 2026 {suffix}",
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(department_id=dept.id, code=f"CS{suffix}", title="Data Structures", credits=3)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(
        course_id=course.id, academic_term_id=term.id, section="Sec-A", status="active"
    )
    db_session.add(offering)
    await db_session.flush()
    db_session.add(
        Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled")
    )

    bank = QuestionBank(
        department_id=dept.id, course_id=course.id, title="Syllabus Bank", created_by_id=faculty.id
    )
    db_session.add(bank)
    await db_session.flush()

    syllabus = [("trees", "easy"), ("trees", "medium"), ("graphs", "medium"), ("graphs", "hard")]
    questions: list[Question] = []
    for idx, (topic, difficulty) in enumerate(syllabus):
        q = Question(
            question_bank_id=bank.id,
            question_type="mcq",
            marks=2.0,
            body=f"Syllabus question {idx} about {topic} ({difficulty}).",
            difficulty=difficulty,
            tags=[topic],
            status="approved",
            created_by_id=faculty.id,
        )
        db_session.add(q)
        questions.append(q)
    await db_session.flush()
    for q in questions:
        db_session.add_all(
            [
                QuestionOption(question_id=q.id, label="A", body="Correct", is_correct=True, sort_order=0),
                QuestionOption(question_id=q.id, label="B", body="Wrong", is_correct=False, sort_order=1),
            ]
        )

    now = datetime.now(UTC)
    exam = Exam(
        course_offering_id=offering.id,
        title="Generated Structures Paper",
        exam_type="midterm",
        total_marks=100.0,
        passing_marks=40.0,
        duration_minutes=60,
        start_window=now - timedelta(minutes=5),
        end_window=now + timedelta(hours=2),
        config={"proctoring_enabled": True, "max_violations": 5},
        status="scheduled",
        created_by_id=faculty.id,
    )
    db_session.add(exam)
    await db_session.commit()

    headers = {
        "faculty": {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"},
        "outsider": {"Authorization": f"Bearer {create_access_token({'sub': str(outsider.id)})}"},
        "student": {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"},
    }
    return exam, questions, headers


@pytest.mark.asyncio
async def test_random_paper_from_syllabus_scope(client, db_session):
    exam, questions, headers = await _setup_syllabus_exam(db_session, suffix="G1")
    url = f"/api/v1/exams/{exam.id}/generate-questions"

    # No scope given: the whole course/department pool is the syllabus.
    resp = await client.post(url, headers=headers["faculty"], json={"question_count": 3})
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert len(data["questions"]) == 3
    # Marks must reflect the drawn paper, not the placeholder 100 the exam was
    # created with.
    assert data["total_marks"] == 6.0
    assert data["passing_marks"] <= data["total_marks"]
    drawn_ids = {q["question_id"] for q in data["questions"]}
    assert len(drawn_ids) == 3

    # Narrowing by syllabus topic only draws tagged questions.
    resp2 = await client.post(
        url,
        headers=headers["faculty"],
        json={"tags": ["graphs"], "question_count": 5, "replace_existing": True},
    )
    assert resp2.status_code == 200, resp2.text
    data2 = resp2.json()["data"]
    assert len(data2["questions"]) == 2
    graph_ids = {str(q.id) for q in questions if "graphs" in (q.tags or [])}
    assert {q["question_id"] for q in data2["questions"]} == graph_ids

    # Difficulty narrowing on top of the topic.
    resp3 = await client.post(
        url,
        headers=headers["faculty"],
        json={"tags": ["graphs"], "difficulties": ["hard"], "replace_existing": True},
    )
    assert resp3.status_code == 200, resp3.text
    assert len(resp3.json()["data"]["questions"]) == 1

    # A selection that matches nothing is a clear 400, not an empty paper.
    empty = await client.post(
        url,
        headers=headers["faculty"],
        json={"tags": ["quantum"], "replace_existing": True},
    )
    assert empty.status_code == 400
    assert "No questions matched" in empty.json()["error"]["message"]


@pytest.mark.asyncio
async def test_random_paper_enforces_authorisation(client, db_session):
    exam, _questions, headers = await _setup_syllabus_exam(db_session, suffix="G2")
    url = f"/api/v1/exams/{exam.id}/generate-questions"

    # Candidates may never author a paper.
    student = await client.post(url, headers=headers["student"], json={"question_count": 1})
    assert student.status_code == 403

    # A faculty member outside the offering (and not the author) is scoped out.
    outsider = await client.post(url, headers=headers["outsider"], json={"question_count": 1})
    assert outsider.status_code == 403

    # The endpoint requires the exams:create capability itself.
    unauthenticated = await client.post(url, json={"question_count": 1})
    assert unauthenticated.status_code == 401

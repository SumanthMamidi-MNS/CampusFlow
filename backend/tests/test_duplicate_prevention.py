"""Duplicate prevention at the database, not just in a pre-insert query.

The application's pre-checks produce good messages; these tests assert that the
*constraint* is the authority — a second identical row is refused even when the
first check is bypassed, which is what protects the data under concurrency.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Department
from campusflow.domain.exams.models import Exam, ExamAttempt
from campusflow.domain.users.models import User


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


@pytest_asyncio.fixture
async def dup_world(db_session):
    tag = uuid.uuid4().hex[:8]
    now = datetime.now(UTC)

    admin = User(email=f"admin.dp.{tag}@campusflow.edu", hashed_password=get_password_hash("AdmPass123!"), first_name="Ada", last_name="Min", status="active")
    faculty = User(email=f"fac.dp.{tag}@campusflow.edu", hashed_password=get_password_hash("FacPass123!"), first_name="Ann", last_name="Chen", status="active")
    student = User(email=f"stu.dp.{tag}@campusflow.edu", hashed_password=get_password_hash("StuPass123!"), first_name="Sam", last_name="Stone", status="active")
    db_session.add_all([admin, faculty, student])
    await db_session.flush()
    for user, role in ((admin, "admin"), (faculty, "faculty"), (student, "student")):
        await assign_role_to_user(db_session, user.id, role)

    dept = Department(name=f"Arts {tag}", code=f"ART-DP-{tag}")
    term = AcademicTerm(
        name=f"Term DP {tag}",
        start_date=now.date(),
        end_date=(now + timedelta(days=90)).date(),
        is_current=True,
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(code=f"AR101-DP-{tag}", title="Design", department_id=dept.id, credits=3)
    db_session.add(course)
    await db_session.flush()
    offering = CourseOffering(course_id=course.id, academic_term_id=term.id, section="A", status="active")
    db_session.add(offering)
    await db_session.commit()

    yield {
        "tag": tag,
        "headers": {"admin": auth_headers(admin)},
        "faculty_id": faculty.id,
        "student_id": student.id,
        "offering_id": offering.id,
        "db": db_session,
    }


@pytest.mark.asyncio
async def test_registration_number_is_normalized_and_unique(client, dup_world):
    h = dup_world["headers"]
    tag = dup_world["tag"]

    first = await client.post(
        "/api/v1/users",
        headers=h["admin"],
        json={
            "email": f"first.{tag}@campusflow.edu",
            "first_name": "First",
            "last_name": "Student",
            "password": "StudentPass123!",
            "roles": ["student"],
            "registration_number": f"cse/2026/{tag}",
        },
    )
    assert first.status_code == 200, first.text
    assert first.json()["data"]["registration_number"] == f"CSE/2026/{tag}".upper()

    # Same number, different case and surrounding whitespace: same student.
    # (Punctuation is deliberately *not* stripped — "A-12" and "A12" can be
    # different students, so only case and whitespace are canonicalised.)
    second = await client.post(
        "/api/v1/users",
        headers=h["admin"],
        json={
            "email": f"second.{tag}@campusflow.edu",
            "first_name": "Second",
            "last_name": "Student",
            "password": "StudentPass123!",
            "roles": ["student"],
            "registration_number": f"  cse/2026/{tag}  ",
        },
    )
    assert second.status_code == 409, second.text


@pytest.mark.asyncio
async def test_attempt_number_constraint_blocks_duplicate_attempt(db_session, dup_world):
    db = dup_world["db"]
    now = datetime.now(UTC)
    exam = Exam(
        course_offering_id=dup_world["offering_id"],
        title="Constraint exam",
        exam_type="quiz",
        total_marks=10,
        duration_minutes=30,
        start_window=now,
        end_window=now + timedelta(hours=2),
        config={"max_violations": 5},
        status="scheduled",
    )
    db.add(exam)
    await db.flush()

    db.add(
        ExamAttempt(
            exam_id=exam.id,
            student_id=dup_world["student_id"],
            attempt_number=1,
            started_at=now,
            status="in_progress",
        )
    )
    await db.commit()

    # The database itself refuses the duplicate — not a pre-check.
    db.add(
        ExamAttempt(
            exam_id=exam.id,
            student_id=dup_world["student_id"],
            attempt_number=1,
            started_at=now,
            status="in_progress",
        )
    )
    with pytest.raises(IntegrityError):
        await db.flush()
    await db.rollback()


@pytest.mark.asyncio
async def test_faculty_assignment_is_idempotent(client, dup_world):
    h = dup_world["headers"]
    offering = dup_world["offering_id"]
    faculty_id = dup_world["faculty_id"]

    for _ in range(2):
        res = await client.post(
            f"/api/v1/course-offerings/{offering}/faculty",
            headers=h["admin"],
            json={"faculty_id": str(faculty_id), "role": "primary"},
        )
        assert res.status_code == 200, res.text

    db = dup_world["db"]
    rows = await db.execute(
        select(FacultyAssignment).where(
            FacultyAssignment.course_offering_id == offering,
            FacultyAssignment.faculty_id == faculty_id,
        )
    )
    assert len(rows.scalars().all()) == 1, "assigning twice must not double the teaching link"

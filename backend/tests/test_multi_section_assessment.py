"""Section-scoped assessment creation.

An assessment may target one section or several the caller manages — and nothing
else. The important negative case is a direct API call that substitutes an
unrelated section id: it must be refused and must not leave a partial paper
behind.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Department
from campusflow.domain.users.models import User


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


@pytest_asyncio.fixture
async def sections_world(db_session):
    """Two sections of the same course/term, each taught by a different lecturer."""
    tag = uuid.uuid4().hex[:8]
    now = datetime.now(UTC)

    admin = User(email=f"admin.ms.{tag}@campusflow.edu", hashed_password=get_password_hash("AdmPass123!"), first_name="Ada", last_name="Min", status="active")
    faculty_a = User(email=f"fac.a.ms.{tag}@campusflow.edu", hashed_password=get_password_hash("FacPass123!"), first_name="Ann", last_name="Chen", status="active")
    faculty_b = User(email=f"fac.b.ms.{tag}@campusflow.edu", hashed_password=get_password_hash("FacPass123!"), first_name="Ben", last_name="Doe", status="active")
    db_session.add_all([admin, faculty_a, faculty_b])
    await db_session.flush()
    for user, role in ((admin, "admin"), (faculty_a, "faculty"), (faculty_b, "faculty")):
        await assign_role_to_user(db_session, user.id, role)

    dept = Department(name=f"Mech {tag}", code=f"MECH-MS-{tag}")
    term = AcademicTerm(
        name=f"Term MS {tag}",
        start_date=now.date(),
        end_date=(now + timedelta(days=90)).date(),
        is_current=True,
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(code=f"ME101-MS-{tag}", title="Statics", department_id=dept.id, credits=3)
    db_session.add(course)
    await db_session.flush()

    offering_a = CourseOffering(course_id=course.id, academic_term_id=term.id, section="A", status="active")
    offering_b = CourseOffering(course_id=course.id, academic_term_id=term.id, section="B", status="active")
    db_session.add_all([offering_a, offering_b])
    await db_session.flush()

    db_session.add_all([
        FacultyAssignment(course_offering_id=offering_a.id, faculty_id=faculty_a.id, role="primary"),
        FacultyAssignment(course_offering_id=offering_b.id, faculty_id=faculty_b.id, role="primary"),
    ])
    await db_session.commit()

    yield {
        "headers": {
            "admin": auth_headers(admin),
            "faculty_a": auth_headers(faculty_a),
            "faculty_b": auth_headers(faculty_b),
        },
        "ids": {
            "offering_a": offering_a.id,
            "offering_b": offering_b.id,
        },
    }


def _payload(offering_ids, title="Midterm"):
    now = datetime.now(UTC)
    return {
        "course_offering_ids": [str(o) for o in offering_ids],
        "title": title,
        "exam_type": "midterm",
        "total_marks": 50,
        "duration_minutes": 60,
        "start_window": now.isoformat(),
        "end_window": (now + timedelta(days=1)).isoformat(),
    }


async def _staff_exams_for(client, headers, offering_id) -> list[dict]:
    res = await client.get(
        f"/api/v1/exams?course_offering_id={offering_id}", headers=headers
    )
    assert res.status_code == 200, res.text
    return res.json()["data"]


@pytest.mark.asyncio
async def test_lecturer_creates_assessment_for_own_section(client, sections_world):
    h = sections_world["headers"]
    ids = sections_world["ids"]

    res = await client.post(
        "/api/v1/exams/multi-section",
        headers=h["faculty_a"],
        json=_payload([ids["offering_a"]], title="Section A quiz"),
    )
    assert res.status_code == 200, res.text
    created = res.json()["data"]
    assert len(created) == 1
    assert created[0]["course_offering_id"] == str(ids["offering_a"])
    assert created[0]["series_id"] is None


@pytest.mark.asyncio
async def test_unrelated_section_id_is_refused_and_nothing_is_created(client, sections_world):
    """Direct API call substituting Section B must not create Section A's paper."""
    h = sections_world["headers"]
    ids = sections_world["ids"]

    before_a = await _staff_exams_for(client, h["admin"], ids["offering_a"])
    before_b = await _staff_exams_for(client, h["admin"], ids["offering_b"])

    res = await client.post(
        "/api/v1/exams/multi-section",
        headers=h["faculty_a"],
        json=_payload([ids["offering_a"], ids["offering_b"]], title="Leaked paper"),
    )
    assert res.status_code == 403, res.text

    after_a = await _staff_exams_for(client, h["admin"], ids["offering_a"])
    after_b = await _staff_exams_for(client, h["admin"], ids["offering_b"])
    assert len(after_a) == len(before_a), "no partial paper may be created for Section A"
    assert len(after_b) == len(before_b), "nothing may be created for Section B"

    # The lecturer cannot even ask about the other section.
    denied = await client.get(
        f"/api/v1/exams?course_offering_id={ids['offering_b']}", headers=h["faculty_a"]
    )
    assert denied.status_code == 200
    assert denied.json()["data"] == []


@pytest.mark.asyncio
async def test_multi_section_assessment_links_sections_by_series(client, sections_world):
    h = sections_world["headers"]
    ids = sections_world["ids"]

    res = await client.post(
        "/api/v1/exams/multi-section",
        headers=h["admin"],
        json=_payload([ids["offering_a"], ids["offering_b"]], title="Common midterm"),
    )
    assert res.status_code == 200, res.text
    created = res.json()["data"]
    assert len(created) == 2
    series_ids = {exam["series_id"] for exam in created}
    assert len(series_ids) == 1
    assert None not in series_ids
    assert {exam["course_offering_id"] for exam in created} == {
        str(ids["offering_a"]),
        str(ids["offering_b"]),
    }


@pytest.mark.asyncio
async def test_duplicate_section_ids_collapse_to_one_exam(client, sections_world):
    h = sections_world["headers"]
    ids = sections_world["ids"]

    res = await client.post(
        "/api/v1/exams/multi-section",
        headers=h["faculty_a"],
        json=_payload([ids["offering_a"], ids["offering_a"]], title="Deduped quiz"),
    )
    assert res.status_code == 200, res.text
    created = res.json()["data"]
    assert len(created) == 1
    assert created[0]["series_id"] is None


@pytest.mark.asyncio
async def test_unknown_section_id_is_rejected(client, sections_world):
    h = sections_world["headers"]
    res = await client.post(
        "/api/v1/exams/multi-section",
        headers=h["admin"],
        json=_payload([uuid.uuid4()], title="Ghost section"),
    )
    assert res.status_code == 404, res.text

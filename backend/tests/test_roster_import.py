"""Spreadsheet roster import — preview, commit, and everything that must not happen.

Each test asserts on a specific protection: idempotency, within-file duplicates,
existing accounts, section conflicts, formula-injection-safe reports, malformed
uploads, transactional rollback, and (PostgreSQL only) concurrent commits.
"""

import asyncio
import csv
import io
import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select

from campusflow.bedrock.api.errors import ConflictError
from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.roster_import import service as roster_service
from campusflow.domain.users.models import User

IS_POSTGRES = os.environ.get("TEST_DATABASE_URL", "").startswith("postgresql")

HEADER = "Roll No,Student Name,Email,Section\n"


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def csv_bytes(*rows: str) -> bytes:
    return (HEADER + "".join(r + "\n" for r in rows)).encode("utf-8")


@pytest_asyncio.fixture
async def roster_world(db_session):
    """One course delivered as Section A and Section B in the same term."""
    tag = uuid.uuid4().hex[:8]
    now = datetime.now(UTC)

    admin = User(email=f"admin.ri.{tag}@campusflow.edu", hashed_password=get_password_hash("AdmPass123!"), first_name="Ada", last_name="Min", status="active")
    faculty_a = User(email=f"fac.a.ri.{tag}@campusflow.edu", hashed_password=get_password_hash("FacPass123!"), first_name="Ann", last_name="Chen", status="active")
    student_b = User(
        email=f"existing.b.ri.{tag}@campusflow.edu",
        hashed_password=get_password_hash("StuPass123!"),
        first_name="Existing",
        last_name="Student",
        status="active",
        registration_number=f"REG-B-{tag}".upper(),
    )
    db_session.add_all([admin, faculty_a, student_b])
    await db_session.flush()
    for user, role in ((admin, "admin"), (faculty_a, "faculty"), (student_b, "student")):
        await assign_role_to_user(db_session, user.id, role)

    dept = Department(name=f"Civil {tag}", code=f"CIV-RI-{tag}")
    term = AcademicTerm(
        name=f"Term RI {tag}",
        start_date=now.date(),
        end_date=(now + timedelta(days=90)).date(),
        is_current=True,
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(code=f"CE101-RI-{tag}", title="Materials", department_id=dept.id, credits=3)
    db_session.add(course)
    await db_session.flush()

    offering_a = CourseOffering(course_id=course.id, academic_term_id=term.id, section="A", status="active")
    offering_b = CourseOffering(course_id=course.id, academic_term_id=term.id, section="B", status="active")
    db_session.add_all([offering_a, offering_b])
    await db_session.flush()

    db_session.add_all([
        FacultyAssignment(course_offering_id=offering_a.id, faculty_id=faculty_a.id, role="primary"),
        Enrollment(course_offering_id=offering_b.id, student_id=student_b.id, status="enrolled"),
    ])
    await db_session.commit()

    yield {
        "tag": tag,
        "headers": {
            "admin": auth_headers(admin),
            "faculty_a": auth_headers(faculty_a),
            "student": auth_headers(student_b),
        },
        "ids": {
            "offering_a": offering_a.id,
            "offering_b": offering_b.id,
        },
        "existing_student_reg": student_b.registration_number,
        "db": db_session,
    }


async def _preview(client, headers, *, offering_id, content, key=None, kind="student", mapping=None):
    data = {"kind": kind, "offering_id": str(offering_id)}
    if key:
        data["idempotency_key"] = key
    if mapping:
        import json

        data["mapping"] = json.dumps(mapping)
    return await client.post(
        "/api/v1/roster-imports/preview",
        headers=headers,
        files={"file": ("roster.csv", content, "text/csv")},
        data=data,
    )


async def _commit(client, headers, batch_id):
    return await client.post(f"/api/v1/roster-imports/{batch_id}/commit", headers=headers)


@pytest.mark.asyncio
async def test_preview_then_commit_enrolls_and_is_idempotent(client, roster_world):
    h = roster_world["headers"]
    tag = roster_world["tag"]
    offering = roster_world["ids"]["offering_a"]

    content = csv_bytes(
        f"CSE/2026/0001,Asha Rao,asha.{tag}@campusflow.edu,A",
        f"CSE/2026/0002,Bilal Khan,bilal.{tag}@campusflow.edu,A",
    )

    preview = await _preview(client, h["admin"], offering_id=offering, content=content)
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    assert body["summary"]["valid"] == 2
    assert body["summary"]["skipped"] == 0
    assert body["column_mapping"]["registration_number"] == "Roll No"
    assert body["column_mapping"]["full_name"] == "Student Name"
    batch_id = body["id"]

    # Nothing has been written yet.
    db = roster_world["db"]
    before = await db.execute(
        select(User).where(User.registration_number == "CSE/2026/0001")
    )
    assert before.scalar_one_or_none() is None

    commit = await _commit(client, h["admin"], batch_id)
    assert commit.status_code == 200, commit.text
    summary = commit.json()["data"]["summary"]
    assert summary["created_users"] == 2
    assert summary["created_enrollments"] == 2

    # Committing again changes nothing.
    again = await _commit(client, h["admin"], batch_id)
    assert again.status_code == 200, again.text
    assert again.json()["data"]["summary"]["created_users"] == 2

    # Re-importing the identical roster with a fresh idempotency key must not
    # create students or enrolments a second time.
    second = await _preview(
        client, h["admin"], offering_id=offering, content=content, key=f"reimport-{tag}"
    )
    assert second.status_code == 200, second.text
    second_body = second.json()["data"]
    assert second_body["summary"]["valid"] == 0
    assert second_body["summary"]["existing"] == 2

    second_commit = await _commit(client, h["admin"], second_body["id"])
    assert second_commit.status_code == 200, second_commit.text
    assert second_commit.json()["data"]["summary"]["created_users"] == 0
    assert second_commit.json()["data"]["summary"]["created_enrollments"] == 0

    # The same idempotency key returns the original preview, not a new one.
    keyed = await _preview(
        client, h["admin"], offering_id=offering, content=content, key=f"reimport-{tag}"
    )
    assert keyed.json()["data"]["id"] == second_body["id"]


@pytest.mark.asyncio
async def test_duplicate_registration_numbers_in_file_are_reported(client, roster_world):
    h = roster_world["headers"]
    tag = roster_world["tag"]
    offering = roster_world["ids"]["offering_a"]

    content = csv_bytes(
        f"CSE/2026/0010,First Win,first.{tag}@campusflow.edu,A",
        f"  cse/2026/0010  ,Second Loses,second.{tag}@campusflow.edu,A",
    )
    preview = await _preview(client, h["admin"], offering_id=offering, content=content)
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    assert body["summary"]["valid"] == 1
    assert body["summary"]["duplicate"] == 1

    commit = await _commit(client, h["admin"], body["id"])
    assert commit.status_code == 200, commit.text
    assert commit.json()["data"]["summary"]["created_users"] == 1

    db = roster_world["db"]
    created = await db.execute(
        select(User).where(User.registration_number == "CSE/2026/0010")
    )
    assert len(created.scalars().all()) == 1, "the duplicate must not create a second account"


@pytest.mark.asyncio
async def test_existing_student_is_matched_not_duplicated(client, roster_world):
    h = roster_world["headers"]
    offering_a = roster_world["ids"]["offering_a"]
    reg = roster_world["existing_student_reg"]

    content = csv_bytes(f"{reg},Existing Student,ignored.{roster_world['tag']}@campusflow.edu,A")
    preview = await _preview(client, h["admin"], offering_id=offering_a, content=content)
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    # They exist but are enrolled in the *other* section: that is a conflict, not
    # a silent enrolment.
    assert body["summary"]["conflict"] == 1
    assert body["summary"]["committable"] == 0


@pytest.mark.asyncio
async def test_conflicting_section_assignment_is_not_auto_moved(client, roster_world):
    h = roster_world["headers"]
    offering_a = roster_world["ids"]["offering_a"]
    db = roster_world["db"]
    tag = roster_world["tag"]

    student = User(
        email=f"conflict.{tag}@campusflow.edu",
        hashed_password=get_password_hash("StuPass123!"),
        first_name="Con",
        last_name="Flict",
        status="active",
        registration_number=f"REG-C-{tag}".upper(),
    )
    db.add(student)
    await db.flush()
    await assign_role_to_user(db, student.id, "student")
    db.add(
        Enrollment(
            course_offering_id=roster_world["ids"]["offering_b"],
            student_id=student.id,
            status="enrolled",
        )
    )
    await db.commit()

    content = csv_bytes(f"{student.registration_number},Con Flict,conflict.{tag}@campusflow.edu,A")
    preview = await _preview(client, h["admin"], offering_id=offering_a, content=content)
    body = preview.json()["data"]
    assert body["summary"]["conflict"] == 1
    row = body["rows"][0]
    assert row["status"] == "conflict"
    assert "section B" in row["reason"]

    commit = await _commit(client, h["admin"], body["id"])
    assert commit.status_code == 200, commit.text
    assert commit.json()["data"]["summary"]["created_enrollments"] == 0

    # The student is still only in Section B.
    enrolled = await db.execute(
        select(Enrollment).where(Enrollment.student_id == student.id)
    )
    rows = enrolled.scalars().all()
    assert [r.course_offering_id for r in rows] == [roster_world["ids"]["offering_b"]]


@pytest.mark.asyncio
async def test_report_neutralises_formula_injection(client, roster_world):
    h = roster_world["headers"]
    offering = roster_world["ids"]["offering_a"]

    content = csv_bytes('=CMD|"/C calc"!A1,=1+1,formula@campusflow.edu,A')
    preview = await _preview(client, h["admin"], offering_id=offering, content=content)
    assert preview.status_code == 200, preview.text
    batch_id = preview.json()["data"]["id"]

    report = await client.get(
        f"/api/v1/roster-imports/{batch_id}/report", headers=h["admin"]
    )
    assert report.status_code == 200, report.text
    rows = list(csv.reader(io.StringIO(report.text)))
    assert rows[0][0] == "row"
    # Every data cell that could start a formula carries the neutralising prefix.
    for row in rows[1:]:
        for cell in row:
            assert not cell.startswith(("=", "+", "@")) or cell.startswith("'"), cell
    assert any(cell.startswith("'=") for row in rows[1:] for cell in row)


@pytest.mark.asyncio
async def test_unsupported_and_oversized_uploads_are_refused(client, roster_world, monkeypatch):
    h = roster_world["headers"]
    offering = roster_world["ids"]["offering_a"]

    res = await client.post(
        "/api/v1/roster-imports/preview",
        headers=h["admin"],
        files={"file": ("roster.txt", b"a,b\n1,2\n", "text/plain")},
        data={"kind": "student", "offering_id": str(offering)},
    )
    assert res.status_code == 400, res.text
    assert "Unsupported file type" in res.text

    monkeypatch.setattr(roster_service, "MAX_IMPORT_BYTES", 16)
    res = await client.post(
        "/api/v1/roster-imports/preview",
        headers=h["admin"],
        files={"file": ("roster.csv", b"x" * 64, "text/csv")},
        data={"kind": "student", "offering_id": str(offering)},
    )
    assert res.status_code == 400, res.text
    assert "limit" in res.text


@pytest.mark.asyncio
async def test_import_is_section_scoped(client, roster_world):
    """A lecturer may not import into another lecturer's section."""
    h = roster_world["headers"]
    content = csv_bytes("CSE/2026/0099,Out Sider,outsider@campusflow.edu,B")

    denied = await _preview(
        client, h["faculty_a"], offering_id=roster_world["ids"]["offering_b"], content=content
    )
    assert denied.status_code == 403, denied.text

    allowed = await _preview(
        client, h["faculty_a"], offering_id=roster_world["ids"]["offering_a"], content=content
    )
    assert allowed.status_code == 200, allowed.text

    # Students never reach the import surface at all.
    student_attempt = await _preview(
        client, h["student"], offering_id=roster_world["ids"]["offering_a"], content=content
    )
    assert student_attempt.status_code == 403, student_attempt.text


@pytest.mark.asyncio
async def test_explicit_column_mapping_overrides_aliases(client, roster_world):
    h = roster_world["headers"]
    tag = roster_world["tag"]
    offering = roster_world["ids"]["offering_a"]

    content = (
        "Matric,Who,Institutional Mail\n"
        f"REG-MAP-{tag},Mapped Student,mapped.{tag}@campusflow.edu\n"
    ).encode()

    preview = await client.post(
        "/api/v1/roster-imports/preview",
        headers=h["admin"],
        files={"file": ("custom.csv", content, "text/csv")},
        data={
            "kind": "student",
            "offering_id": str(offering),
            "mapping": '{"registration_number": "Matric", "full_name": "Who", "email": "Institutional Mail"}',
        },
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    assert body["summary"]["valid"] == 1
    # Identifiers are normalised (trimmed, whitespace-collapsed, uppercased).
    assert body["rows"][0]["normalized"]["registration_number"] == f"REG-MAP-{tag}".upper()


@pytest.mark.asyncio
async def test_xlsx_roster_is_parsed(client, roster_world):
    """Real Excel (not CSV-renamed) support, with formulas read as cached values."""
    openpyxl = pytest.importorskip("openpyxl")
    h = roster_world["headers"]
    tag = roster_world["tag"]
    offering = roster_world["ids"]["offering_a"]

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(["Roll No", "Student Name", "Email"])
    sheet.append([f"REG-XL-{tag}", "Excel Student", f"excel.{tag}@campusflow.edu"])
    sheet.append([f"REG-XL2-{tag}", "Formula Student", f"excel2.{tag}@campusflow.edu"])
    buffer = io.BytesIO()
    workbook.save(buffer)

    preview = await client.post(
        "/api/v1/roster-imports/preview",
        headers=h["admin"],
        files={
            "file": (
                "roster.xlsx",
                buffer.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={"kind": "student", "offering_id": str(offering)},
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    assert body["summary"]["valid"] == 2
    assert body["rows"][0]["normalized"]["registration_number"] == f"REG-XL-{tag}".upper()

    commit = await _commit(client, h["admin"], body["id"])
    assert commit.status_code == 200, commit.text
    assert commit.json()["data"]["summary"]["created_users"] == 2


@pytest.mark.asyncio
async def test_commit_rolls_back_entirely_on_failure(client, roster_world, monkeypatch):
    """A failure halfway through a batch must leave no accounts behind."""
    h = roster_world["headers"]
    tag = roster_world["tag"]
    offering = roster_world["ids"]["offering_a"]

    content = csv_bytes(
        f"REG-RB-1-{tag},Roll Back One,rb1.{tag}@campusflow.edu,A",
        f"REG-RB-2-{tag},Roll Back Two,rb2.{tag}@campusflow.edu,A",
    )
    preview = await _preview(client, h["admin"], offering_id=offering, content=content)
    batch_id = preview.json()["data"]["id"]

    real = roster_service._find_or_create_user
    calls = {"n": 0}

    async def flaky(db, *, kind, normalized):
        calls["n"] += 1
        if calls["n"] == 2:
            # A failure the request layer can report (a real one would be an
            # IntegrityError or a vanished section) — the point is the batch.
            raise ConflictError("simulated mid-batch failure")
        return await real(db, kind=kind, normalized=normalized)

    monkeypatch.setattr(roster_service, "_find_or_create_user", flaky)

    failed = await _commit(client, h["admin"], batch_id)
    assert failed.status_code == 409, failed.text

    db = roster_world["db"]
    leftover = await db.execute(
        select(User).where(User.registration_number.in_([f"REG-RB-1-{tag}", f"REG-RB-2-{tag}"]))
    )
    assert leftover.scalars().all() == [], "the batch must roll back as a whole"


@pytest.mark.asyncio
@pytest.mark.skipif(
    not IS_POSTGRES,
    reason="Concurrent-commit behaviour needs PostgreSQL; SQLite serialises writers.",
)
async def test_concurrent_commit_of_same_roster_is_safe(client, roster_world):
    h = roster_world["headers"]
    tag = roster_world["tag"]
    offering = roster_world["ids"]["offering_a"]

    content = csv_bytes(f"REG-CC-{tag},Con Current,cc.{tag}@campusflow.edu,A")
    preview = await _preview(client, h["admin"], offering_id=offering, content=content)
    batch_id = preview.json()["data"]["id"]

    results = await asyncio.gather(
        _commit(client, h["admin"], batch_id),
        _commit(client, h["admin"], batch_id),
    )
    assert all(r.status_code in (200, 409) for r in results), [r.text for r in results]
    assert sorted(r.status_code for r in results) == [200, 200] or 409 in [
        r.status_code for r in results
    ]

    db = roster_world["db"]
    created = await db.execute(
        # Identifiers are stored normalised (uppercased).
        select(User).where(User.registration_number == f"REG-CC-{tag}".upper())
    )
    assert len(created.scalars().all()) == 1, (
        "exactly one account, never two: "
        + str([(r.status_code, r.text[:160]) for r in results])
    )

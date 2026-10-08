"""Wave 1 scoping regressions — the shared authorization kernel, enforced.

Three defects drove this file:

1. ``list_course_offerings`` chose its filter from an ``if/elif`` chain on raw
   role names. A ``department_head`` who was not also faculty fell through
   every branch and received an *unscoped* query — every offering in the
   institution — and so did a user with no role at all. The kernel
   (``domain.courses.access.visible_offering_ids``) now answers the question,
   and these tests pin the head, the roleless bystander, the faculty member
   and the examination bureau.
2. The question-bank surface (answer keys: ``is_correct``, explanations,
   accepted answers, tolerances) was readable by *any authenticated* user and
   writable by anyone with the global ``questions:manage`` capability without
   a department scope.
3. Materials routes performed no offering-scope check, so any student could
   read another cohort's course files and any capable faculty member could
   publish into someone else's offering.

The directory endpoints (departments, programs, batches, academic terms,
institution) were anonymous; they now require a session.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.bedrock.storage.service import get_storage
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.materials.models import Material
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


@pytest_asyncio.fixture
async def wave1_world(db_session):
    """Two departments, two offerings, real content in each.

    The engine (and its data) is shared across the whole test session, so
    every world gets a unique tag: rows never collide, and each test's exact
    assertions only ever reference ids from its own world.
    """
    now = datetime.now(UTC)
    tag = uuid.uuid4().hex[:8]

    admin = User(email=f"admin.w1.{tag}@campusflow.edu", hashed_password=get_password_hash("AdminPass123!"), first_name="Ada", last_name="Min", status="active")
    # department_head *only* — never also faculty: this is the fall-through actor.
    hod = User(email=f"hod.w1.{tag}@campusflow.edu", hashed_password=get_password_hash("HodPass123!"), first_name="Mo", last_name="Sterling", status="active")
    controller = User(email=f"controller.w1.{tag}@campusflow.edu", hashed_password=get_password_hash("CtrlPass123!"), first_name="Eve", last_name="Vance", status="active")
    faculty_a = User(email=f"faculty.a.w1.{tag}@campusflow.edu", hashed_password=get_password_hash("FacPass123!"), first_name="Ann", last_name="Chen", status="active")
    faculty_b = User(email=f"faculty.b.w1.{tag}@campusflow.edu", hashed_password=get_password_hash("FacPass123!"), first_name="Ben", last_name="Davies", status="active")
    student_a = User(email=f"student.a.w1.{tag}@campusflow.edu", hashed_password=get_password_hash("StuPass123!"), first_name="Ari", last_name="Rivera", status="active")
    # No roles at all: previously fell through to an unscoped offerings list.
    bystander = User(email=f"bystander.w1.{tag}@campusflow.edu", hashed_password=get_password_hash("BystPass123!"), first_name="Bys", last_name="Tander", status="active")

    db_session.add_all([admin, hod, controller, faculty_a, faculty_b, student_a, bystander])
    await db_session.flush()

    for user, role in (
        (admin, "admin"),
        (hod, "department_head"),
        (controller, "exam_controller"),
        (faculty_a, "faculty"),
        (faculty_b, "faculty"),
        (student_a, "student"),
    ):
        await assign_role_to_user(db_session, user.id, role)

    dept_a = Department(name=f"Science W1 {tag}", code=f"SCI-W1-{tag}", head_id=hod.id)
    dept_b = Department(name=f"Engineer W1 {tag}", code=f"ENG-W1-{tag}")
    term = AcademicTerm(
        name=f"Term W1 {tag}",
        start_date=now.date(),
        end_date=(now + timedelta(days=90)).date(),
        is_current=True,
    )
    db_session.add_all([dept_a, dept_b, term])
    await db_session.flush()

    course_a = Course(code=f"SCI101-W1-{tag}", title="Foundations W1", department_id=dept_a.id, credits=3)
    course_b = Course(code=f"ENG101-W1-{tag}", title="Statics W1", department_id=dept_b.id, credits=3)
    db_session.add_all([course_a, course_b])
    await db_session.flush()

    offering_a = CourseOffering(course_id=course_a.id, academic_term_id=term.id, section="A", status="active")
    offering_b = CourseOffering(course_id=course_b.id, academic_term_id=term.id, section="B", status="active")
    db_session.add_all([offering_a, offering_b])
    await db_session.flush()

    db_session.add_all(
        [
            FacultyAssignment(course_offering_id=offering_a.id, faculty_id=faculty_a.id, role="primary"),
            FacultyAssignment(course_offering_id=offering_b.id, faculty_id=faculty_b.id, role="primary"),
            Enrollment(course_offering_id=offering_a.id, student_id=student_a.id, status="enrolled"),
        ]
    )

    # Answer material in both departments.
    bank_a = QuestionBank(department_id=dept_a.id, course_id=course_a.id, title="SCI Bank W1", created_by_id=faculty_a.id)
    bank_b = QuestionBank(department_id=dept_b.id, course_id=course_b.id, title="ENG Bank W1", created_by_id=faculty_b.id)
    db_session.add_all([bank_a, bank_b])
    await db_session.flush()

    question_a = Question(
        question_bank_id=bank_a.id,
        question_type="mcq",
        marks=5.0,
        body="Which unit measures force?",
        explanation="Force is measured in newtons.",
        status="approved",
        created_by_id=faculty_a.id,
    )
    db_session.add(question_a)
    await db_session.flush()
    db_session.add_all(
        [
            QuestionOption(question_id=question_a.id, label="A", body="Newton", is_correct=True, sort_order=1),
            QuestionOption(question_id=question_a.id, label="B", body="Joule", is_correct=False, sort_order=2),
        ]
    )

    # Course files in both offerings; offering A's file is a real stored file
    # so the positive download path is exercised end to end.
    storage = get_storage()
    storage_path = "tests/wave1_material_a.txt"
    await storage.upload(storage_path, b"wave1 course material", content_type="text/plain")
    material_a = Material(
        course_offering_id=offering_a.id,
        title="Notes A",
        material_type="file",
        file_path=storage_path,
        mime_type="text/plain",
    )
    material_b = Material(
        course_offering_id=offering_b.id,
        title="Notes B",
        material_type="file",
        file_path="tests/wave1_material_b.txt",
        mime_type="text/plain",
    )
    db_session.add_all([material_a, material_b])

    await db_session.commit()

    world = {
        "headers": {
            "admin": auth_headers(admin),
            "hod": auth_headers(hod),
            "controller": auth_headers(controller),
            "faculty_a": auth_headers(faculty_a),
            "faculty_b": auth_headers(faculty_b),
            "student_a": auth_headers(student_a),
            "bystander": auth_headers(bystander),
        },
        "ids": {
            "dept_a": dept_a.id,
            "dept_b": dept_b.id,
            "offering_a": offering_a.id,
            "offering_b": offering_b.id,
            "bank_a": bank_a.id,
            "bank_b": bank_b.id,
            "question_a": question_a.id,
            "material_a": material_a.id,
            "material_b": material_b.id,
        },
    }
    yield world
    await storage.delete(storage_path)


async def _offering_ids(client, headers) -> set[str]:
    res = await client.get("/api/v1/course-offerings", headers=headers)
    assert res.status_code == 200, res.text
    return {row["id"] for row in res.json()["data"]}


@pytest.mark.asyncio
async def test_offering_list_scope_replaces_role_fall_through(client, wave1_world):
    """The kernel answers offering visibility for every role — no fall-through."""
    ids = wave1_world["ids"]
    h = wave1_world["headers"]
    a, b = str(ids["offering_a"]), str(ids["offering_b"])

    # Administrators and the examination bureau are institution-wide: their
    # lists contain every world's offerings, so assert containment, not
    # equality (other tests in this session create their own worlds).
    assert {a, b} <= await _offering_ids(client, h["admin"])
    assert {a, b} <= await _offering_ids(client, h["controller"])

    # department_head with NO faculty role: only their headed department.
    # (Fell through the role chain to the *unscoped* query before Wave 1.)
    assert await _offering_ids(client, h["hod"]) == {a}

    # Teaching and enrolment scope.
    assert await _offering_ids(client, h["faculty_b"]) == {b}
    assert await _offering_ids(client, h["student_a"]) == {a}

    # No roles at all: no offerings, never everything.
    assert await _offering_ids(client, h["bystander"]) == set()

    # Anonymous callers never reach the handler.
    res = await client.get("/api/v1/course-offerings")
    assert res.status_code == 401, res.text


@pytest.mark.asyncio
async def test_question_banks_are_staff_only_and_department_scoped(client, wave1_world):
    ids = wave1_world["ids"]
    h = wave1_world["headers"]
    bank_a, bank_b, question_a = str(ids["bank_a"]), str(ids["bank_b"]), str(ids["question_a"])

    # ── Candidates never reach answer material ──────────────────────────────
    for path in (
        "/api/v1/question-banks",
        f"/api/v1/question-banks/{bank_a}",
        f"/api/v1/question-banks/{bank_a}/questions",
        f"/api/v1/questions/{question_a}",
        f"/api/v1/question-banks/{bank_a}/export-csv",
    ):
        res = await client.get(path, headers=h["student_a"])
        assert res.status_code == 403, f"{path} -> {res.status_code}: {res.text}"
        assert "is_correct" not in res.text

    anonymous = await client.get("/api/v1/question-banks")
    assert anonymous.status_code == 401, anonymous.text

    # ── Authoring still works, scoped to the department ─────────────────────
    own_list = await client.get("/api/v1/question-banks", headers=h["faculty_a"])
    assert own_list.status_code == 200, own_list.text
    listed = {row["id"] for row in own_list.json()["data"]}
    # Exactly their own department's bank: nothing of the other department,
    # and nothing leaking in from worlds other tests created.
    assert listed == {bank_a}, listed

    own_questions = await client.get(
        f"/api/v1/question-banks/{bank_a}/questions", headers=h["faculty_a"]
    )
    assert own_questions.status_code == 200, own_questions.text
    assert any(opt["is_correct"] for q in own_questions.json()["data"] for opt in q["options"]), \
        "authoring staff must still receive the answer key"

    export = await client.get(f"/api/v1/question-banks/{bank_a}/export-csv", headers=h["faculty_a"])
    assert export.status_code == 200, export.text

    # The department head reaches their own department's bank.
    hod_bank = await client.get(f"/api/v1/question-banks/{bank_a}", headers=h["hod"])
    assert hod_bank.status_code == 200, hod_bank.text

    # The examination bureau assembles papers institution-wide.
    bureau_list = await client.get("/api/v1/question-banks", headers=h["controller"])
    assert bureau_list.status_code == 200, bureau_list.text
    assert {bank_a, bank_b} <= {row["id"] for row in bureau_list.json()["data"]}

    admin_list = await client.get("/api/v1/question-banks", headers=h["admin"])
    assert admin_list.status_code == 200
    assert {bank_a, bank_b} <= {row["id"] for row in admin_list.json()["data"]}

    # ── Other departments are refused, read and write ───────────────────────
    for path in (
        f"/api/v1/question-banks/{bank_a}",
        f"/api/v1/question-banks/{bank_a}/questions",
        f"/api/v1/questions/{question_a}",
        f"/api/v1/question-banks/{bank_a}/export-csv",
    ):
        res = await client.get(path, headers=h["faculty_b"])
        assert res.status_code == 403, f"{path} -> {res.status_code}: {res.text}"
        assert "is_correct" not in res.text
        assert "Newton" not in res.text

    cross = await client.post(
        "/api/v1/question-banks",
        headers=h["faculty_a"],
        json={"department_id": str(ids["dept_b"]), "title": "Cross dept attempt"},
    )
    assert cross.status_code == 403, cross.text

    put = await client.put(
        f"/api/v1/question-banks/{bank_b}",
        headers=h["faculty_a"],
        json={"title": "Hijacked"},
    )
    assert put.status_code == 403, put.text

    delete = await client.delete(f"/api/v1/question-banks/{bank_b}", headers=h["faculty_a"])
    assert delete.status_code == 403, delete.text


@pytest.mark.asyncio
async def test_materials_are_offering_scoped(client, wave1_world):
    ids = wave1_world["ids"]
    h = wave1_world["headers"]
    a, b = str(ids["offering_a"]), str(ids["offering_b"])

    # Enrolled student reads own course, is refused in the other cohort's.
    own = await client.get(f"/api/v1/course-offerings/{a}/materials", headers=h["student_a"])
    assert own.status_code == 200, own.text
    foreign = await client.get(f"/api/v1/course-offerings/{b}/materials", headers=h["student_a"])
    assert foreign.status_code == 403, foreign.text
    folders = await client.get(f"/api/v1/course-offerings/{b}/folders", headers=h["student_a"])
    assert folders.status_code == 403, folders.text

    # A capable faculty member may not publish into another cohort's offering.
    payload = {"title": "Injected notes", "material_type": "link", "url": "https://example.edu/x"}
    cross_create = await client.post(
        f"/api/v1/course-offerings/{a}/materials", headers=h["faculty_b"], json=payload
    )
    assert cross_create.status_code == 403, cross_create.text
    cross_folders = await client.post(
        f"/api/v1/course-offerings/{a}/folders",
        headers=h["faculty_b"],
        json={"title": "Injected folder"},
    )
    assert cross_folders.status_code == 403, cross_folders.text
    cross_read = await client.get(f"/api/v1/course-offerings/{a}/materials", headers=h["faculty_b"])
    assert cross_read.status_code == 403, cross_read.text

    # Students hold materials:read but never materials:manage.
    own_create = await client.post(
        f"/api/v1/course-offerings/{a}/materials", headers=h["student_a"], json=payload
    )
    assert own_create.status_code == 403, own_create.text

    # Downloads follow the same offering scope, both directions.
    own_download = await client.get(
        f"/api/v1/materials/{ids['material_a']}/download", headers=h["student_a"]
    )
    assert own_download.status_code == 200, own_download.text
    assert own_download.content == b"wave1 course material"
    foreign_download = await client.get(
        f"/api/v1/materials/{ids['material_b']}/download", headers=h["student_a"]
    )
    assert foreign_download.status_code == 403, foreign_download.text
    cross_download = await client.get(
        f"/api/v1/materials/{ids['material_a']}/download", headers=h["faculty_b"]
    )
    assert cross_download.status_code == 403, cross_download.text

    # Anonymous callers never reach the handler.
    anon = await client.get(f"/api/v1/course-offerings/{a}/materials")
    assert anon.status_code == 401, anon.text


@pytest.mark.asyncio
async def test_directory_routes_require_a_session(client, wave1_world):
    """The organisational directory is authenticated, not anonymous."""
    ids = wave1_world["ids"]
    h = wave1_world["headers"]

    for path in (
        "/api/v1/departments",
        f"/api/v1/departments/{ids['dept_a']}",
        "/api/v1/programs",
        "/api/v1/batches",
        "/api/v1/academic-terms",
        "/api/v1/institution",
    ):
        anon = await client.get(path)
        assert anon.status_code == 401, f"{path} anonymous -> {anon.status_code}"
        as_student = await client.get(path, headers=h["student_a"])
        assert as_student.status_code == 200, f"{path} student -> {as_student.status_code}"

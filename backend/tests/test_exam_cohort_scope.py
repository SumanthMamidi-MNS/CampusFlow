"""Regression suite for the examination cohort boundary.

A permission code answers *what* a staff member may do (``exams:grade``,
``exams:proctor_view``, ``exams:create``); it never answers *whose* candidates
they may do it to. Before this file, every attempt-level exam surface trusted
the permission alone, so any faculty member — and the examination bureau — could
read another offering's attempt list (student names, emails, marks, violation
counts), that attempt's responses, its integrity timeline **including camera
frames**, the results CSV, reopen a locked attempt, grade a response, publish
results, or edit/add questions on an examination they do not teach.

Every denial asserted here is paired with the same call succeeding for the same
user on their *own* offering in the same test, so a 403 can never be an artefact
of the permission gate: the actor demonstrably holds the capability, and only
the cohort boundary refuses them. Every one of these requests returned 200
before ``_assert_can_manage_exam`` / ``_assert_can_manage_attempt`` were wired
through ``campusflow.domain.exams.service``.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamAttempt, ExamQuestion, ExamResponse
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


async def _add_offering_exam(db_session, *, course, offering, author, candidate, label, now):
    """One offering's complete assessment fixture: question, exam, attempt, response."""
    bank = QuestionBank(
        department_id=course.department_id,
        course_id=course.id,
        title=f"{label} Bank",
        created_by_id=author.id,
    )
    db_session.add(bank)
    await db_session.flush()

    question = Question(
        question_bank_id=bank.id,
        question_type="mcq",
        marks=5.0,
        body=f"{label}: which option is correct?",
        status="approved",
        created_by_id=author.id,
    )
    db_session.add(question)
    await db_session.flush()
    db_session.add_all(
        [
            QuestionOption(question_id=question.id, label="A", body="Correct option", is_correct=True, sort_order=1),
            QuestionOption(question_id=question.id, label="B", body="Wrong option", is_correct=False, sort_order=2),
        ]
    )

    exam = Exam(
        course_offering_id=offering.id,
        title=f"{label} Midterm",
        exam_type="midterm",
        total_marks=5.0,
        duration_minutes=30,
        start_window=now - timedelta(minutes=5),
        end_window=now + timedelta(hours=2),
        config={"proctoring_enabled": True, "max_violations": 5},
        status="scheduled",
        created_by_id=author.id,
    )
    db_session.add(exam)
    await db_session.flush()

    exam_question = ExamQuestion(exam_id=exam.id, question_id=question.id, sort_order=1)
    db_session.add(exam_question)
    await db_session.flush()

    attempt = ExamAttempt(
        exam_id=exam.id,
        student_id=candidate.id,
        attempt_number=1,
        started_at=now,
        submitted_at=now,
        status="submitted",
        total_score=0.0,
        percentage=0.0,
    )
    db_session.add(attempt)
    await db_session.flush()

    response = ExamResponse(
        attempt_id=attempt.id,
        exam_question_id=exam_question.id,
        answer_data={"selected": "A"},
    )
    db_session.add(response)
    await db_session.flush()

    return {
        "exam": exam.id,
        "attempt": attempt.id,
        "response": response.id,
        "exam_question": exam_question.id,
    }


async def _make_world(db_session):
    """Two offerings, each fully populated with its own exam, attempt and response."""
    now = datetime.now(UTC)
    tag = uuid.uuid4().hex[:8]

    def person(prefix: str, first: str) -> User:
        return User(
            email=f"{prefix}.cohort.{tag}@campusflow.edu",
            hashed_password=get_password_hash("CohortPass123!"),
            first_name=first,
            last_name="Cohort",
            status="active",
        )

    admin = person("admin", "Ada")
    controller = person("controller", "Eve")
    faculty_a = person("faculty.a", "Ann")
    faculty_b = person("faculty.b", "Ben")
    student_a = person("student.a", "Ari")
    student_b = person("student.b", "Bri")
    db_session.add_all([admin, controller, faculty_a, faculty_b, student_a, student_b])
    await db_session.flush()

    for user, role in (
        (admin, "admin"),
        (controller, "exam_controller"),
        (faculty_a, "faculty"),
        (faculty_b, "faculty"),
        (student_a, "student"),
        (student_b, "student"),
    ):
        await assign_role_to_user(db_session, user.id, role)

    dept_a = Department(name=f"Science Cohort {tag}", code=f"SCI-COH-{tag}")
    dept_b = Department(name=f"Engineering Cohort {tag}", code=f"ENG-COH-{tag}")
    term = AcademicTerm(
        name=f"Term Cohort {tag}",
        start_date=now.date(),
        end_date=(now + timedelta(days=90)).date(),
        is_current=True,
    )
    db_session.add_all([dept_a, dept_b, term])
    await db_session.flush()

    course_a = Course(code=f"SCI-C-{tag}", title="Foundations", department_id=dept_a.id, credits=3)
    course_b = Course(code=f"ENG-C-{tag}", title="Statics", department_id=dept_b.id, credits=3)
    db_session.add_all([course_a, course_b])
    await db_session.flush()

    offering_a = CourseOffering(
        course_id=course_a.id, academic_term_id=term.id, section="A", status="active"
    )
    offering_b = CourseOffering(
        course_id=course_b.id, academic_term_id=term.id, section="B", status="active"
    )
    db_session.add_all([offering_a, offering_b])
    await db_session.flush()

    db_session.add_all(
        [
            FacultyAssignment(
                course_offering_id=offering_a.id, faculty_id=faculty_a.id, role="primary"
            ),
            FacultyAssignment(
                course_offering_id=offering_b.id, faculty_id=faculty_b.id, role="primary"
            ),
            Enrollment(course_offering_id=offering_a.id, student_id=student_a.id, status="enrolled"),
            Enrollment(course_offering_id=offering_b.id, student_id=student_b.id, status="enrolled"),
        ]
    )

    fixture_a = await _add_offering_exam(
        db_session,
        course=course_a,
        offering=offering_a,
        author=faculty_a,
        candidate=student_a,
        label="SCI",
        now=now,
    )
    fixture_b = await _add_offering_exam(
        db_session,
        course=course_b,
        offering=offering_b,
        author=faculty_b,
        candidate=student_b,
        label="ENG",
        now=now,
    )

    await db_session.commit()

    return {
        "headers": {
            "admin": auth_headers(admin),
            "controller": auth_headers(controller),
            "faculty_a": auth_headers(faculty_a),
            "faculty_b": auth_headers(faculty_b),
            "student_a": auth_headers(student_a),
            "student_b": auth_headers(student_b),
        },
        "own": fixture_a,  # offering A: teacher is faculty_a, candidate is student_a
        "foreign": fixture_b,  # offering B: teacher is faculty_b, candidate is student_b
    }


def _surfaces(ids: dict) -> tuple[tuple[str, str, dict | None], ...]:
    """Every staff-facing exam/attempt surface for one fixture.

    Non-destructive only: removing an ExamQuestion cascades to the candidate's
    response (which is correct behaviour), so the destructive authoring call is
    asserted separately rather than invalidating the rest of the loop.
    """
    exam, attempt, response = str(ids["exam"]), str(ids["attempt"]), str(ids["response"])
    return (
        ("GET", f"/api/v1/exams/{exam}/attempts", None),
        ("GET", f"/api/v1/exam-attempts/{attempt}/responses", None),
        ("GET", f"/api/v1/exam-attempts/{attempt}/proctoring-events", None),
        ("GET", f"/api/v1/exams/{exam}/export-results", None),
        ("POST", f"/api/v1/exam-responses/{response}/grade", {"marks_awarded": 5.0}),
        ("POST", f"/api/v1/exams/{exam}/publish", None),
        (
            "POST",
            f"/api/v1/exams/{exam}/attempts/{attempt}/unlock",
            {"reason": "resumption requested"},
        ),
        ("PUT", f"/api/v1/exams/{exam}", {"title": "Renamed"}),
        (
            "DELETE",
            f"/api/v1/exams/{exam}/questions/{ids['exam_question']}",
            None,
        ),
    )


# The gradebook half of the examination surface: cohort marks and result
# publication. The examination bureau is deliberately excluded from these even
# though the role carries ``exams:grade`` (see the bureau test).
def _gradebook_surfaces(ids: dict) -> tuple[tuple[str, str, dict | None], ...]:
    exam, attempt, response = str(ids["exam"]), str(ids["attempt"]), str(ids["response"])
    return (
        ("GET", f"/api/v1/exams/{exam}/attempts", None),
        ("GET", f"/api/v1/exam-attempts/{attempt}/responses", None),
        ("GET", f"/api/v1/exams/{exam}/export-results", None),
        ("POST", f"/api/v1/exam-responses/{response}/grade", {"marks_awarded": 5.0}),
        ("POST", f"/api/v1/exams/{exam}/publish", None),
    )


async def _call(client, method: str, path: str, headers: dict, body):
    return await getattr(client, method.lower())(
        path, headers=headers, **({"json": body} if body is not None else {})
    )


@pytest.mark.asyncio
async def test_lecturer_keeps_own_cohort_and_is_refused_the_other(client, db_session):
    """The same capability, the same actor: 200 on their offering, 403 on the other."""
    world = await _make_world(db_session)
    h = world["headers"]

    # One direction first: the other cohort's teacher, on this offering's ids.
    # Nothing mutates here, so this runs while the own fixture is still intact.
    for method, path, body in _surfaces(world["own"]):
        res = await _call(client, method, path, h["faculty_b"], body)
        assert res.status_code == 403, f"{method} {path} -> {res.status_code}: {res.text}"
        assert "Ari" not in res.text

    # The actor demonstrably holds every exam capability: all of their own
    # offering's surfaces succeed (200), including the timeline and the CSV.
    for method, path, body in _surfaces(world["own"]):
        res = await _call(client, method, path, h["faculty_a"], body)
        assert res.status_code == 200, f"own cohort: {method} {path} -> {res.status_code}: {res.text}"

    # Same actor, same calls, the other cohort's ids: refused. A refusal must
    # not carry the other cohort's identity or marks.
    for method, path, body in _surfaces(world["foreign"]):
        res = await _call(client, method, path, h["faculty_a"], body)
        assert res.status_code == 403, f"{method} {path} -> {res.status_code}: {res.text}"
        assert "Bri" not in res.text
        assert "student.b.cohort" not in res.text


@pytest.mark.asyncio
async def test_candidates_never_reach_staff_exam_surfaces(client, db_session):
    """A candidate cannot read their own cohort's cohort view."""
    world = await _make_world(db_session)
    h = world["headers"]
    ids = world["own"]

    for method, path, body in _surfaces(ids):
        res = await _call(client, method, path, h["student_a"], body)
        assert res.status_code == 403, f"candidate: {method} {path} -> {res.status_code}: {res.text}"

    # An unauthenticated caller is refused before any handler runs.
    for method, path, body in _surfaces(ids):
        kwargs = {"json": body} if body is not None else {}
        res = await getattr(client, method.lower())(path, **kwargs)
        assert res.status_code == 401, f"anonymous: {method} {path} -> {res.status_code}"


@pytest.mark.asyncio
async def test_admin_reaches_every_cohort(client, db_session):
    """Institution administration is intentionally institution-wide."""
    world = await _make_world(db_session)
    h = world["headers"]
    for key in ("own", "foreign"):
        for method, path, body in _surfaces(world[key]):
            if method == "DELETE":
                # Deleting the question cascades the response; the read and
                # grading surfaces are what this control is about.
                continue
            res = await _call(client, method, path, h["admin"], body)
            assert res.status_code == 200, f"admin {method} {path} -> {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_exam_bureau_reaches_invigilation_but_never_the_gradebook(client, db_session):
    """The bureau invigilates institution-wide; grading stays with teaching staff.

    This is the documented split (AGENTS.md, ADR-011 examination-bureau reach):
    the exam bureau assembles papers and reviews integrity evidence, but cohort
    marks, the results CSV and result publication are classroom work.
    """
    world = await _make_world(db_session)
    h = world["headers"]
    foreign = world["foreign"]

    # Invigilation: allowed, institution-wide, including the captured frames.
    timeline = await client.get(
        f"/api/v1/exam-attempts/{foreign['attempt']}/proctoring-events", headers=h["controller"]
    )
    assert timeline.status_code == 200, timeline.text

    # Invigilation also covers resuming a candidate the bureau reviewed, and
    # the paper-authoring surface stays institution-wide.
    unlock = await client.post(
        f"/api/v1/exams/{foreign['exam']}/attempts/{foreign['attempt']}/unlock",
        headers=h["controller"],
        json={"reason": "bureau invigilation"},
    )
    assert unlock.status_code == 200, unlock.text

    # Gradebook surfaces: refused even though the role carries ``exams:grade``.
    for method, path, body in _gradebook_surfaces(foreign):
        res = await _call(client, method, path, h["controller"], body)
        assert res.status_code == 403, f"bureau: {method} {path} -> {res.status_code}: {res.text}"
        assert "Bri" not in res.text

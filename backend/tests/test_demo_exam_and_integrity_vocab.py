"""Demo examination and extended integrity vocabulary.

Covers the two public demo endpoints (idempotency + session scope) and the
four new observable integrity signals: returning inside the grace window is
recorded but never penalised; leaving and not returning is penalised; camera
obstruction and a second device are recorded as review evidence.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.demo import DEMO_EXAM_TITLE, DEMO_QUESTIONS, DEMO_STUDENT_EMAIL
from campusflow.domain.exams.models import Exam, ExamQuestion
from campusflow.domain.question_banks.models import Question, QuestionOption
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_demo_prepare_is_idempotent(client, db_session):
    """Repeated prepare calls create no duplicates anywhere."""
    first = await client.post("/api/v1/exams/demo/prepare")
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["data"]["exam_id"]

    again = await client.post("/api/v1/exams/demo/prepare")
    assert again.status_code == 200, again.text
    assert again.json()["data"]["exam_id"] == body["data"]["exam_id"]

    from campusflow.domain.courses.models import Course, CourseOffering
    from campusflow.domain.exams.models import Exam

    courses = (await db_session.execute(select(Course))).scalars().all()
    demo_courses = [c for c in courses if c.code.startswith("DEMO")]
    assert len(demo_courses) == 1
    offerings = (await db_session.execute(select(CourseOffering))).scalars().all()
    demo_offerings = [o for o in offerings if o.section == "DEMO"]
    assert len(demo_offerings) == 1
    exams = (await db_session.execute(select(Exam))).scalars().all()
    demo_exams = [e for e in exams if e.title == DEMO_EXAM_TITLE]
    assert len(demo_exams) == 1
    exam = demo_exams[0]
    assert len(exam.questions) == len(DEMO_QUESTIONS)
    assert exam.config["max_attempts"] >= 5
    # Always open
    start = exam.start_window if exam.start_window.tzinfo else exam.start_window.replace(tzinfo=UTC)
    end = exam.end_window if exam.end_window.tzinfo else exam.end_window.replace(tzinfo=UTC)
    assert start < datetime.now(UTC) < end


@pytest.mark.asyncio
async def test_demo_login_mints_student_session_and_is_repeatable(client, db_session):
    """Demo login returns a real token bound to the demo student, and never duplicates the account."""
    first = await client.post("/api/v1/exams/demo/login")
    assert first.status_code == 200, first.text
    data = first.json()["data"]
    assert data["access_token"]
    assert data["user"]["email"] == DEMO_STUDENT_EMAIL
    assert data["user"]["roles"] == ["student"]

    second = await client.post("/api/v1/exams/demo/login")
    assert second.status_code == 200
    assert second.json()["data"]["user"]["id"] == data["user"]["id"]

    from sqlalchemy import func, select

    from campusflow.domain.users.models import User

    count = (
        await db_session.execute(select(func.count()).select_from(User).where(User.email == DEMO_STUDENT_EMAIL))
    ).scalar_one()
    assert count == 1

    # The minted token works for the normal exam APIs.
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    exams = await client.get("/api/v1/exams", headers=headers)
    assert exams.status_code == 200, exams.text
    assert isinstance(exams.json()["data"], list)


@pytest.mark.asyncio
async def test_demo_exam_is_startable_and_concluded_gradeable(client, db_session):
    """A demo session can start the paper, answer, submit and see the result immediately."""
    login = await client.post("/api/v1/exams/demo/login")
    assert login.status_code == 200, login.text
    token = login.json()["data"]["access_token"]
    exam_id = login.json()["data"]["exam_id"]
    headers = {"Authorization": f"Bearer {token}"}

    brief = await client.get(f"/api/v1/exams/{exam_id}/public", headers=headers)
    assert brief.status_code == 200, brief.text
    # The demo must be marked as practice and configured for instant results.
    assert brief.json()["data"]["exam_type"] == "practice"
    assert brief.json()["data"]["config"]["show_results_immediately"] is True

    start = await client.post(f"/api/v1/exams/{exam_id}/start", headers=headers, json={})
    assert start.status_code == 200, start.text
    delivery = start.json()["data"]
    assert delivery["questions"], "demo paper must carry questions"
    assert delivery["remaining_seconds"] > 0    # Build the correct answer for each question straight from the source.
    res = await db_session.execute(
        select(ExamQuestion, Question).join(Question, Question.id == ExamQuestion.question_id).where(
            ExamQuestion.exam_id == uuid.UUID(exam_id)
        )
    )
    exam_questions = res.all()
    answer_payload = []
    for _eq, question in exam_questions:
        options = (
            await db_session.execute(
                select(QuestionOption)
                .where(QuestionOption.question_id == question.id)
                .order_by(QuestionOption.sort_order)
            )
        ).scalars().all()
        meta = question.metadata_info or {}
        correct_labels = [o.label for o in options if o.is_correct]
        if question.question_type == "mcq":
            answer_data = {"selected": correct_labels[0]}
        elif question.question_type == "msq":
            answer_data = {"selected": correct_labels}
        elif question.question_type == "true_false":
            answer_data = {"selected": correct_labels[0].lower()}
        elif question.question_type == "numerical":
            answer_data = {"value": meta["answer"]}
        elif question.question_type == "fill_blank":
            answer_data = {"blanks": meta["accepted_answers"]}
        else:
            # code / short_answer: recorded but not machine-gradable here.
            answer_data = {"text": "def sum_even(nums): return sum(n for n in nums if n % 2 == 0)"}
        answer_payload.append(
            {"exam_question_id": str(_eq.id), "answer_data": answer_data, "flagged_for_review": False}
        )

    save = await client.put(
        f"/api/v1/exam-attempts/{delivery['attempt_id']}/answers",
        headers=headers,
        json={"answers": answer_payload},
    )
    assert save.status_code == 200, save.text

    submit = await client.post(
        f"/api/v1/exam-attempts/{delivery['attempt_id']}/submit", headers=headers
    )
    assert submit.status_code == 200, submit.text
    assert submit.json()["data"]["status"] in {"graded", "submitted", "auto_submitted"}

    result = await client.get(f"/api/v1/exams/{exam_id}/my-result", headers=headers)
    # Instant results are configured, so the candidate must be able to see them
    # immediately — no lecturer publication step in the demo.
    assert result.status_code == 200, result.text


@pytest.mark.asyncio
async def test_quick_tab_return_recorded_not_penalised(client, db_session):
    """Returning inside the five-second grace is observed, never punished."""
    faculty, student, exam = await _make_proctored_fixture(db_session)
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    start = await client.post(f"/api/v1/exams/{exam.id}/start", headers=headers, json={})
    assert start.status_code == 200, start.text
    attempt_id = start.json()["data"]["attempt_id"]

    ev = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "quick_tab_return", "severity": "low"},
    )
    assert ev.status_code == 200, ev.text
    status = ev.json()["data"]
    assert status["violations_count"] == 0
    assert status["is_locked"] is False
    assert status["warning"] is None

    # The signal is on the lecturer's timeline even though it is not a violation.
    timeline = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers={"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"},
    )
    assert timeline.status_code == 200
    assert "quick_tab_return" in [e["event_type"] for e in timeline.json()["data"]]


@pytest.mark.asyncio
async def test_tab_switch_then_return_counts_as_violation(client, db_session):
    """Leaving the paper (outside the 5-second grace) still consumes the allowance."""
    faculty, student, exam = await _make_proctored_fixture(db_session)
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    start = await client.post(f"/api/v1/exams/{exam.id}/start", headers=headers, json={})
    attempt_id = start.json()["data"]["attempt_id"]

    ev = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "tab_switch", "severity": "medium"},
    )
    assert ev.status_code == 200
    assert ev.json()["data"]["violations_count"] == 1


@pytest.mark.asyncio
async def test_camera_obstruction_and_second_device_are_recorded(client, db_session):
    """Obstruction and second-device detection exist in the server vocabulary and are reviewable evidence."""
    faculty, student, exam = await _make_proctored_fixture(db_session)
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    start = await client.post(f"/api/v1/exams/{exam.id}/start", headers=headers, json={})
    attempt_id = start.json()["data"]["attempt_id"]

    obstructed = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "camera_obstructed", "severity": "medium", "details": {"reason": "frozen_frame_4s"}},
    )
    assert obstructed.status_code == 200, obstructed.text
    assert obstructed.json()["data"]["violations_count"] == 1

    device = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "second_device_detected", "severity": "medium", "details": {"basis": "motion_in_frame"}},
    )
    assert device.status_code == 200, device.text
    device_status = device.json()["data"]
    # ADR-024: a modelled device observation is evidence plus a faculty review, so
    # it must NOT move the allowance (still the one obstruction), must not submit
    # or lock anything, and must say so plainly to the candidate.
    assert device_status["violations_count"] == 1, "a device observation must not consume the allowance"
    assert device_status["auto_submitted"] is False
    assert device_status["is_locked"] is False
    assert device_status["status"] == "in_progress"
    assert "no allowance" in device_status["warning"].lower()

    timeline = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers={"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"},
    )
    types = [e["event_type"] for e in timeline.json()["data"]]
    assert "camera_obstructed" in types
    assert "second_device_detected" in types

    # The review flag is what makes the observation actionable for faculty.
    faculty_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"}
    flagged = await client.get(
        f"/api/v1/exams/{exam.id}/attempts",
        params={"flagged_only": True},
        headers=faculty_headers,
    )
    assert flagged.status_code == 200, flagged.text
    assert [a["id"] for a in flagged.json()["data"]] == [attempt_id]


@pytest.mark.asyncio
async def test_window_resized_is_in_vocabulary(client, db_session):
    faculty, student, exam = await _make_proctored_fixture(db_session)
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    start = await client.post(f"/api/v1/exams/{exam.id}/start", headers=headers, json={})
    attempt_id = start.json()["data"]["attempt_id"]

    ev = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "window_resized", "severity": "low"},
    )
    assert ev.status_code == 200
    assert ev.json()["data"]["violations_count"] == 1


# ── Fixture ────────────────────────────────────────────────────────────────


async def _make_proctored_fixture(db_session):
    """Faculty + enrolled student + one-question proctored exam, window open now."""
    tag = uuid.uuid4().hex[:12]
    faculty = User(
        email=f"faculty.integrity{tag}@campusflow.test",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Ada",
        last_name="Byron",
        status="active",
    )
    student = User(
        email=f"student.integrity{tag}@campusflow.test",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Grace",
        last_name="Hopper",
        status="active",
    )
    db_session.add_all([faculty, student])
    await db_session.flush()
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")

    dept = Department(name="Integrity Testing", code=f"ITG-{tag}")
    term = AcademicTerm(
        name=f"ITG Term {tag}",
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=30)).date(),
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(department_id=dept.id, code=f"ITG101-{tag}", title="Integrity Signals", credits=1)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(course_id=course.id, academic_term_id=term.id, section="A", status="active")
    db_session.add(offering)
    await db_session.flush()

    db_session.add(Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled"))

    now = datetime.now(UTC)
    exam = Exam(
        course_offering_id=offering.id,
        title="Integrity Probe",
        exam_type="quiz",
        total_marks=5.0,
        duration_minutes=30,
        start_window=now - timedelta(minutes=1),
        end_window=now + timedelta(hours=2),
        config={"proctoring_enabled": True, "max_violations": 5},
        status="scheduled",
        created_by_id=faculty.id,
    )
    db_session.add(exam)
    await db_session.commit()
    return faculty, student, exam

"""Per-exam integrity profile: sensitivity tiers and the two new weak cues.

ADR-029 adds two signals that an ordinary webcam or microphone can produce but
that have no published false-positive rate — a hand held at the face and a
sustained second voice. The contract these tests hold to:

  * a paper's dwell tier is authored per exam and disclosed as *values*, so the
    client enforces the seconds the candidate was told about;
  * every confirmed cue is recorded as evidence, raises a faculty review, and
    costs exactly one of the warnings the candidate was told about (D-31): a
    cue that is recorded but never warns is indistinguishable from a detector
    that does not work;
  * the ladder is the product's — the authored allowance, then a stop that only
    a lecturer can lift — so a camera cue and a tab switch end the same way;
  * the tier is validated at authoring time, so a cohort can never be held to a
    dwell nobody authored.
"""

import uuid
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
from campusflow.domain.exams.schemas import INTEGRITY_DWELL_MS, integrity_dwell_ms
from campusflow.domain.users.models import User


async def _make_exam(db_session, config: dict | None = None):
    """Faculty + enrolled student + one open exam carrying `config`."""
    tag = uuid.uuid4().hex[:12]
    faculty = User(
        email=f"faculty.profile{tag}@campusflow.test",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Ada",
        last_name="Byron",
        status="active",
    )
    student = User(
        email=f"student.profile{tag}@campusflow.test",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Grace",
        last_name="Hopper",
        status="active",
    )
    db_session.add_all([faculty, student])
    await db_session.flush()
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")

    dept = Department(name="Profile Testing", code=f"PRF-{tag}")
    term = AcademicTerm(
        name=f"PRF Term {tag}",
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=30)).date(),
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(department_id=dept.id, code=f"PRF101-{tag}", title="Profiles", credits=1)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(
        course_id=course.id, academic_term_id=term.id, section="A", status="active"
    )
    db_session.add(offering)
    await db_session.flush()
    db_session.add(Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled"))

    now = datetime.now(UTC)
    exam = Exam(
        course_offering_id=offering.id,
        title="Profile Probe",
        exam_type="quiz",
        total_marks=5.0,
        duration_minutes=30,
        start_window=now - timedelta(minutes=1),
        end_window=now + timedelta(hours=2),
        config=config if config is not None else {"proctoring_enabled": True, "max_violations": 5},
        status="scheduled",
        created_by_id=faculty.id,
    )
    db_session.add(exam)
    await db_session.commit()
    return faculty, student, exam


def test_dwell_tiers_are_ordered_and_complete():
    """Every tier defines every cue, and tighter tiers never wait longer."""
    cues = {"turn", "absence", "hand", "voice", "mouth"}
    for tier, values in INTEGRITY_DWELL_MS.items():
        assert set(values) == cues, f"{tier} must define every cue"
        assert all(value > 0 for value in values.values())

    for cue in cues:
        relaxed = INTEGRITY_DWELL_MS["relaxed"][cue]
        standard = INTEGRITY_DWELL_MS["standard"][cue]
        strict = INTEGRITY_DWELL_MS["strict"][cue]
        assert relaxed > standard > strict, f"{cue} must tighten across the tiers"


def test_unknown_or_missing_sensitivity_falls_back_to_standard():
    """An older row keeps the dwell its cohort was already held to."""
    assert integrity_dwell_ms(None) == INTEGRITY_DWELL_MS["standard"]
    assert integrity_dwell_ms({}) == INTEGRITY_DWELL_MS["standard"]
    assert integrity_dwell_ms({"integrity_sensitivity": "paranoid"}) == INTEGRITY_DWELL_MS["standard"]
    assert integrity_dwell_ms({"integrity_sensitivity": "strict"}) == INTEGRITY_DWELL_MS["strict"]


@pytest.mark.asyncio
async def test_authoring_refuses_an_unknown_sensitivity(client, db_session):
    """A misspelled tier is an authoring mistake, not a silent downgrade."""
    faculty, _student, exam = await _make_exam(db_session)
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"}

    bad = await client.put(
        f"/api/v1/exams/{exam.id}",
        headers=headers,
        json={"config": {"integrity_sensitivity": "maximum"}},
    )
    assert bad.status_code == 422, bad.text
    assert "integrity_sensitivity" in bad.text

    # A non-boolean cue switch is refused the same way.
    flag = await client.put(
        f"/api/v1/exams/{exam.id}",
        headers=headers,
        json={"config": {"hand_monitoring_enabled": "yes"}},
    )
    assert flag.status_code == 422, flag.text
    assert "hand_monitoring_enabled" in flag.text

    good = await client.put(
        f"/api/v1/exams/{exam.id}",
        headers=headers,
        json={"config": {"integrity_sensitivity": "strict", "hand_monitoring_enabled": True}},
    )
    assert good.status_code == 200, good.text
    assert good.json()["data"]["config"]["integrity_sensitivity"] == "strict"


@pytest.mark.asyncio
async def test_strict_tier_and_switches_reach_the_candidate(client, db_session):
    """The brief and the delivery disclose the tier, the switches and the seconds.

    The candidate surface must never have to hard-code a dwell: the values it
    renders are the ones the monitors enforce.
    """
    faculty, student, exam = await _make_exam(
        db_session,
        config={
            "proctoring_enabled": True,
            "max_violations": 5,
            "integrity_sensitivity": "strict",
            "hand_monitoring_enabled": True,
            "audio_monitoring_enabled": True,
        },
    )
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    brief = await client.get(f"/api/v1/exams/{exam.id}/public", headers=headers)
    assert brief.status_code == 200, brief.text
    config = brief.json()["data"]["config"]
    assert config["integrity_sensitivity"] == "strict"
    assert config["hand_monitoring_enabled"] is True
    assert config["audio_monitoring_enabled"] is True
    assert config["dwell_ms"] == INTEGRITY_DWELL_MS["strict"]

    start = await client.post(f"/api/v1/exams/{exam.id}/start", headers=headers, json={})
    assert start.status_code == 200, start.text
    delivery = start.json()["data"]
    assert delivery["integrity_sensitivity"] == "strict"
    assert delivery["hand_monitoring_enabled"] is True
    assert delivery["audio_monitoring_enabled"] is True
    assert delivery["dwell_ms"] == INTEGRITY_DWELL_MS["strict"]


@pytest.mark.asyncio
async def test_defaults_monitor_every_cue_of_an_unauthored_paper(client, db_session):
    """An exam that authored nothing still runs the standard tier on every cue.

    Nothing is off by default (D-31): the assessments nobody remembered to
    configure are exactly the ones where a held-up phone used to pass unrecorded.
    """
    _faculty, student, exam = await _make_exam(db_session)
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    delivery = (await client.post(f"/api/v1/exams/{exam.id}/start", headers=headers, json={})).json()[
        "data"
    ]
    assert delivery["integrity_sensitivity"] == "standard"
    assert delivery["dwell_ms"] == INTEGRITY_DWELL_MS["standard"]
    assert delivery["face_monitoring_enabled"] is True
    assert delivery["hand_monitoring_enabled"] is True
    assert delivery["audio_monitoring_enabled"] is True
    assert delivery["device_detection_enabled"] is True
    # Mouth motion is opt-in per paper (ADR-039): the pixel heuristic could not
    # separate a mouth from a jaw or compression noise on a still face, and
    # candidates who were not talking were warned. Only an author who explicitly
    # switches it on runs it; the voice check remains the talking signal.
    assert delivery["mouth_monitoring_enabled"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_type", "details"),
    [
        ("hand_near_face", {"dwell_ms": 4200, "proximity": 0.41, "hands": 1}),
        ("voice_detected", {"dwell_ms": 5000, "level": 0.081, "recorded": False}),
        (
            "mouth_movement_detected",
            {
                "dwell_ms": 3100,
                "mouth_motion": 0.061,
                "reference_motion": 0.008,
                "dominance": 7.6,
                "audio_active": False,
            },
        ),
        (
            # A watch found in the wrist close-up the hand landmarker supplies.
            # `region` is what tells a reviewer this came from the crop rather
            # than the weak whole-frame read, so it has to survive the round trip.
            "second_device_detected",
            {
                "category": "smartwatch",
                "region": "wrist",
                "confidence": 0.62,
                "model": "mobilenet",
                "confirmations": 3,
            },
        ),
    ],
)
async def test_camera_cues_warn_and_raise_a_review(client, db_session, event_type, details):
    """A model cue (hand, voice, mouth, device) warns and raises a faculty review.

    The candidate is told which behaviour was seen and which warning this is, the
    lecturer gets an actionable item with the measurement attached, and the cue
    spends exactly one unit of the disclosed allowance (D-31).
    """
    faculty, student, exam = await _make_exam(
        db_session,
        config={
            "proctoring_enabled": True,
            "max_violations": 7,
            "integrity_sensitivity": "strict",
            "hand_monitoring_enabled": True,
            "audio_monitoring_enabled": True,
            "mouth_monitoring_enabled": True,
            "device_detection_enabled": True,
        },
    )
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}
    start = await client.post(f"/api/v1/exams/{exam.id}/start", headers=headers, json={})
    attempt_id = start.json()["data"]["attempt_id"]

    # One browser/page violation first, so the cue's own increment is measured
    # against a non-zero counter rather than against zero.
    counted = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "tab_switch", "severity": "medium"},
    )
    assert counted.json()["data"]["violations_count"] == 1

    event = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": event_type, "severity": "medium", "details": details},
    )
    assert event.status_code == 200, event.text
    body = event.json()["data"]
    assert body["violations_count"] == 2, f"{event_type} must spend one warning"
    assert body["is_locked"] is False
    assert body["auto_submitted"] is False
    assert body["status"] == "in_progress"
    # The candidate is told the count and what was actually seen, not just that
    # something happened.
    assert "2 of 7" in body["warning"]
    assert body["event_category"] == "camera_observation"

    # The measurement travels with the event, so a reviewer can weigh the cue.
    faculty_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"}
    timeline = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events", headers=faculty_headers
    )
    events = timeline.json()["data"]
    matching = [e for e in events if e["event_type"] == event_type]
    assert matching, f"{event_type} must appear on the lecturer's timeline"
    for key, value in details.items():
        assert matching[0]["details"][key] == value

    # And it raises the review flag that makes it actionable.
    flagged = await client.get(
        f"/api/v1/exams/{exam.id}/attempts",
        params={"flagged_only": True},
        headers=faculty_headers,
    )
    assert [a["id"] for a in flagged.json()["data"]] == [attempt_id]


@pytest.mark.asyncio
async def test_hand_near_face_reaches_the_lock_and_only_lecturer_reopens(client, db_session):
    """A camera cue walks the same ladder as a tab switch, stop included.

    An allowance of two is deliberately tight: the second confirmed hand cue has
    to stop the paper, and the attempt may only come back through the lecturer's
    unlock. Anything else would mean the candidate's most reliable route back to
    an answer — a phone in shot — was never really watched.
    """
    faculty, student, exam = await _make_exam(
        db_session,
        config={
            "proctoring_enabled": True,
            "max_violations": 2,
            "hand_monitoring_enabled": True,
        },
    )
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}
    start = await client.post(f"/api/v1/exams/{exam.id}/start", headers=headers, json={})
    attempt_id = start.json()["data"]["attempt_id"]

    first = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "hand_near_face", "severity": "medium", "details": {"dwell_ms": 2600}},
    )
    assert first.status_code == 200, first.text
    assert first.json()["data"]["violations_count"] == 1
    assert first.json()["data"]["is_locked"] is False

    second = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "hand_near_face", "severity": "medium", "details": {"dwell_ms": 2700}},
    )
    assert second.status_code == 200, second.text
    locked = second.json()["data"]
    assert locked["violations_count"] == 2
    assert locked["is_locked"] is True
    assert locked["status"] == "locked_violation"
    assert "hand" in locked["warning"].lower()
    # Answers are kept, and the candidate is told who can lift the stop.
    assert "lecturer" in locked["warning"].lower()

    # The student cannot reopen it: the resume request only asks the lecturer.
    asked = await client.post(f"/api/v1/exams/{exam.id}/resume-request", headers=headers)
    assert asked.status_code == 200, asked.text
    assert asked.json()["data"]["resume_requested"] is True
    # Still stopped: the request is a message to the lecturer, not a key.
    assert asked.json()["data"]["status"] == "locked_violation"

    faculty_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"}
    reopened = await client.post(
        f"/api/v1/exams/{exam.id}/attempts/{attempt_id}/unlock",
        headers=faculty_headers,
        json={"reason": "Booked a room check after reviewing the frame", "reset_violations": True},
    )
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["data"]["status"] == "in_progress"

    # A fresh allowance, so the next cue is warning 1 again.
    third = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "hand_near_face", "severity": "medium", "details": {"dwell_ms": 2400}},
    )
    assert third.json()["data"]["violations_count"] == 1

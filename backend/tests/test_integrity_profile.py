"""Per-exam integrity profile: sensitivity tiers and the two new weak cues.

ADR-029 adds two signals that an ordinary webcam or microphone can produce but
that have no published false-positive rate — a hand held at the face and a
sustained second voice. The contract these tests hold to:

  * a paper's dwell tier is authored per exam and disclosed as *values*, so the
    client enforces the seconds the candidate was told about;
  * what a cue costs is a disposition the server owns (ADR-040): a deliberate act
    the browser can attest to spends one of the warnings the candidate was told
    about, while a model's inference about the candidate is recorded with its
    measurement and raises a faculty review without ever being charged;
  * the split is disclosed before the paper starts, from the same sets the
    ingest path applies, so the brief cannot promise a cost the server does not
    charge;
  * the ladder is the product's — the authored allowance, then a stop that only
    a lecturer can lift — and a deliberate camera act (the feed stopped, the
    picture was blocked) reaches it exactly as a tab switch does;
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
from campusflow.domain.exams.service import (
    COUNTED_EVENT_TYPES,
    NON_VIOLATION_EVENT_TYPES,
    PROCTORING_EVENT_TYPES,
    REVIEW_ONLY_EVENT_TYPES,
    _proctoring_event_disposition,
)
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


def test_every_signal_has_exactly_one_disposition():
    """The three dispositions partition the vocabulary, and every name is decided.

    A future cue cannot silently inherit "counted": a name added to
    `PROCTORING_EVENT_TYPES` without a classification fails here first (ADR-040).
    """
    assert (
        COUNTED_EVENT_TYPES | REVIEW_ONLY_EVENT_TYPES | NON_VIOLATION_EVENT_TYPES
        == PROCTORING_EVENT_TYPES
    )
    assert not COUNTED_EVENT_TYPES & REVIEW_ONLY_EVENT_TYPES
    assert not COUNTED_EVENT_TYPES & NON_VIOLATION_EVENT_TYPES
    assert not REVIEW_ONLY_EVENT_TYPES & NON_VIOLATION_EVENT_TYPES

    # Deliberate acts stay on the ladder, including the three camera acts whose
    # cheapness is exactly why they must be charged.
    for counted in (
        "tab_switch",
        "camera_off",
        "camera_obstructed",
        "second_device_detected",
        "ip_change",
    ):
        assert _proctoring_event_disposition(counted) == "counted"
    # Inference never does.
    for cue in REVIEW_ONLY_EVENT_TYPES:
        assert _proctoring_event_disposition(cue) == "review_only"
    assert _proctoring_event_disposition("camera_snapshot") == "evidence"
    assert _proctoring_event_disposition("quick_tab_return") == "evidence"


@pytest.mark.asyncio
async def test_the_split_is_disclosed_before_the_paper(client, db_session):
    """The brief and the delivery carry the split the ingest path actually applies.

    A candidate who is told which cues can spend the allowance, and which are
    only recorded for their lecturer, is not surprised by a counter they were
    never shown the rules of (ADR-040).
    """
    _faculty, student, exam = await _make_exam(db_session)
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    brief = await client.get(f"/api/v1/exams/{exam.id}/public", headers=headers)
    assert brief.status_code == 200, brief.text
    config = brief.json()["data"]["config"]
    assert set(config["counted_event_types"]) == set(COUNTED_EVENT_TYPES)
    assert set(config["review_only_event_types"]) == set(REVIEW_ONLY_EVENT_TYPES)
    assert "camera_off" in config["counted_event_types"]
    assert "hand_near_face" in config["review_only_event_types"]

    started = await client.post(f"/api/v1/exams/{exam.id}/start", headers=headers, json={})
    assert started.status_code == 200, started.text
    delivery = started.json()["data"]
    assert set(delivery["counted_event_types"]) == set(COUNTED_EVENT_TYPES)
    assert set(delivery["review_only_event_types"]) == set(REVIEW_ONLY_EVENT_TYPES)


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
            "looking_away",
            {"direction": "right", "yaw_degrees": 62, "dwell_ms": 2000},
        ),
        (
            "face_not_visible",
            {"reason": "no_face_in_view", "dwell_ms": 3000},
        ),
        (
            "multiple_faces_detected",
            {"faces": 2, "dwell_ms": 1500},
        ),
    ],
)
async def test_inference_cues_are_recorded_and_never_counted(client, db_session, event_type, details):
    """A model's reading of the candidate is evidence for a human, not a charge.

    The candidate is told nothing and loses nothing; the lecturer receives the
    measurement and the review flag (ADR-040). One counted browser event goes
    first, so "unchanged" is measured against a non-zero counter.
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
    assert body["violations_count"] == 1, f"{event_type} must never spend the allowance"
    assert body["is_locked"] is False
    assert body["auto_submitted"] is False
    assert body["status"] == "in_progress"
    # Nothing is charged and nothing is announced: an inference that can be
    # wrong is not something the candidate has to answer for at the desk.
    assert body["warning"] is None
    assert body["event_category"] == "camera_observation"
    assert body["disposition"] == "review_only"

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
    assert matching[0]["disposition"] == "review_only"

    # And it raises the review flag that makes it actionable.
    flagged = await client.get(
        f"/api/v1/exams/{exam.id}/attempts",
        params={"flagged_only": True},
        headers=faculty_headers,
    )
    assert [a["id"] for a in flagged.json()["data"]] == [attempt_id]


@pytest.mark.asyncio
async def test_review_only_cue_never_reaches_the_lock_and_a_deliberate_act_does(client, db_session):
    """An inference is evidence; only a deliberate act can stop the paper.

    An allowance of two makes the boundary visible: any number of hand-at-face
    readings leaves the candidate working with a full allowance, while the
    cheapest deliberate act — killing the camera feed — still walks the ladder to
    the stop, which only the lecturer's unlock lifts (ADR-040).
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

    # More readings than the whole allowance: none of them spends anything.
    for dwell in (2400, 2600, 2700, 3100):
        cue = await client.post(
            f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
            headers=headers,
            json={
                "event_type": "hand_near_face",
                "severity": "medium",
                "details": {"dwell_ms": dwell},
            },
        )
        assert cue.status_code == 200, cue.text
        body = cue.json()["data"]
        assert body["violations_count"] == 0, "an inference must never spend the allowance"
        assert body["warning"] is None
        assert body["is_locked"] is False
        assert body["disposition"] == "review_only"

    # The lecturer still receives every one of them, with its measurement.
    faculty_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"}
    timeline = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events", headers=faculty_headers
    )
    hands = [e for e in timeline.json()["data"] if e["event_type"] == "hand_near_face"]
    assert len(hands) == 4
    assert {e["disposition"] for e in hands} == {"review_only"}
    assert [e["details"]["dwell_ms"] for e in hands] == [2400, 2600, 2700, 3100]

    # A deliberate act is still charged, and the ladder still stops the paper.
    for _ in range(2):
        off = await client.post(
            f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
            headers=headers,
            json={
                "event_type": "camera_off",
                "severity": "high",
                "details": {"reason": "track_ended"},
            },
        )
        assert off.status_code == 200, off.text
    locked = off.json()["data"]
    assert locked["violations_count"] == 2
    assert locked["is_locked"] is True
    assert locked["status"] == "locked_violation"
    assert locked["disposition"] == "counted"
    assert "camera" in locked["warning"].lower()
    # Answers are kept, and the candidate is told who can lift the stop.
    assert "lecturer" in locked["warning"].lower()

    # The student cannot reopen it: the resume request only asks the lecturer.
    asked = await client.post(f"/api/v1/exams/{exam.id}/resume-request", headers=headers)
    assert asked.status_code == 200, asked.text
    assert asked.json()["data"]["resume_requested"] is True
    # Still stopped: the request is a message to the lecturer, not a key.
    assert asked.json()["data"]["status"] == "locked_violation"

    reopened = await client.post(
        f"/api/v1/exams/{exam.id}/attempts/{attempt_id}/unlock",
        headers=faculty_headers,
        json={"reason": "Booked a room check after reviewing the frame", "reset_violations": True},
    )
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["data"]["status"] == "in_progress"

    # A fresh allowance, and the review-only cue is still free afterwards.
    after = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=headers,
        json={"event_type": "hand_near_face", "severity": "medium", "details": {"dwell_ms": 2400}},
    )
    assert after.json()["data"]["violations_count"] == 0

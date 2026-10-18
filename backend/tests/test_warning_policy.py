"""The integrity tolerance is a per-exam policy with two well-defined outcomes.

Whatever the policy, the candidate must be told which consequence applies
*before* they start, and the server — not the browser — decides it. These tests
pin both branches, the ladder a candidate sees on the way there, the audit trail
of the review flag, and the authoring-time refusal of a policy the engine would
otherwise have to guess at.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from campusflow.bedrock.audit.models import AuditLog
from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamAttempt, ExamQuestion
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User


async def _seed_assessment(
    db_session, *, tag: str, max_violations: int, policy: str | None, extra_config: dict | None = None
):
    """One offering, one faculty owner, one enrolled candidate, one exam.

    Returns everything the test needs to act as each party.
    """
    faculty = User(
        email=f"faculty.policy.{tag}@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Grace",
        last_name="Hopper",
        status="active",
    )
    student = User(
        email=f"student.policy.{tag}@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Alan",
        last_name="Turing",
        status="active",
    )
    db_session.add_all([faculty, student])
    await db_session.flush()
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")

    dept = Department(name=f"Policy Dept {tag}", code=f"POL-{tag}")
    term = AcademicTerm(
        name=f"Policy Term {tag}",
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(department_id=dept.id, code=f"POL{tag}", title="Integrity Policy", credits=3)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(
        course_id=course.id,
        academic_term_id=term.id,
        section="Sec-A",
        status="active",
    )
    db_session.add(offering)
    await db_session.flush()
    # Teaching scope is the faculty assignment, not a column on the offering:
    # this is what lets the authoring endpoints scope-check the caller.
    db_session.add(
        FacultyAssignment(course_offering_id=offering.id, faculty_id=faculty.id, role="primary")
    )
    db_session.add(Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled"))

    bank = QuestionBank(
        department_id=dept.id, course_id=course.id, title=f"Bank {tag}", created_by_id=faculty.id
    )
    db_session.add(bank)
    await db_session.flush()
    question = Question(
        question_bank_id=bank.id,
        question_type="mcq",
        marks=5.0,
        body="Which policy applies to this attempt?",
        status="approved",
        created_by_id=faculty.id,
    )
    db_session.add(question)
    await db_session.flush()
    db_session.add(
        QuestionOption(question_id=question.id, label="A", body="The disclosed one", is_correct=True)
    )

    now = datetime.now(UTC)
    config: dict = {"proctoring_enabled": True, "max_violations": max_violations}
    if policy is not None:
        config["warning_policy"] = policy
    if extra_config:
        config.update(extra_config)
    exam = Exam(
        course_offering_id=offering.id,
        title=f"Policy Assessment {tag}",
        exam_type="midterm",
        total_marks=5.0,
        duration_minutes=30,
        start_window=now - timedelta(minutes=5),
        end_window=now + timedelta(hours=2),
        config=config,
        status="scheduled",
        created_by_id=faculty.id,
    )
    db_session.add(exam)
    await db_session.flush()
    db_session.add(ExamQuestion(exam_id=exam.id, question_id=question.id, sort_order=1))
    await db_session.commit()

    return {
        "faculty": faculty,
        "student": student,
        "offering": offering,
        "exam": exam,
        "question": question,
        "headers": {
            "faculty": {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"},
            "student": {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"},
        },
    }


async def _begin(client, seeded, fingerprint: str) -> str:
    resp = await client.post(
        f"/api/v1/exams/{seeded['exam'].id}/start",
        headers=seeded["headers"]["student"],
        json={"browser_fingerprint": fingerprint},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["attempt_id"]


async def _event(client, seeded, attempt_id: str, event_type: str = "tab_switch"):
    resp = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=seeded["headers"]["student"],
        json={"event_type": event_type, "severity": "medium", "details": {"action": "switch"}},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


@pytest.mark.asyncio
async def test_review_policy_flags_the_attempt_and_lets_the_candidate_continue(client, db_session):
    """Reaching the tolerance under the review policy is a flag, never a removal."""
    seeded = await _seed_assessment(db_session, tag="REV", max_violations=3, policy="review")
    attempt_id = await _begin(client, seeded, "browser_policy_review")

    # The candidate is told the consequence before they start, and the policy in
    # force is echoed back on every status so the browser never assumes one.
    brief = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/public", headers=seeded["headers"]["student"]
    )
    assert brief.status_code == 200, brief.text
    assert brief.json()["data"]["config"]["warning_policy"] == "review"
    delivery = await client.post(
        f"/api/v1/exams/{seeded['exam'].id}/start",
        headers=seeded["headers"]["student"],
        json={},
    )
    assert delivery.status_code == 200, delivery.text
    assert delivery.json()["data"]["warning_policy"] == "review"

    first = await _event(client, seeded, attempt_id)
    assert first["violations_count"] == 1
    assert first["warning_policy"] == "review"
    assert first["is_locked"] is False
    assert first["status"] == "in_progress"
    assert "reminder" in first["warning"].lower()

    second = await _event(client, seeded, attempt_id, "window_blur")
    assert second["violations_count"] == 2
    assert second["is_locked"] is False
    assert "second assessment-integrity reminder" in second["warning"].lower()

    # Third event reaches the disclosed tolerance: flagged, not removed.
    third = await _event(client, seeded, attempt_id, "fullscreen_exit")
    assert third["violations_count"] == 3
    assert third["is_locked"] is False
    assert third["auto_submitted"] is False
    assert third["status"] == "in_progress"
    assert "flagged for your lecturer's review" in third["warning"].lower()
    # Told plainly that the paper continues, and no removal consequence.
    assert "not removed" in third["warning"].lower()
    assert "removed from this examination" not in third["warning"].lower()

    attempt = (
        await db_session.execute(
            select(ExamAttempt).where(ExamAttempt.id == uuid.UUID(attempt_id))
        )
    ).scalar_one()
    await db_session.refresh(attempt)
    assert attempt.status == "in_progress"
    assert "flagged_for_review" in attempt.proctor_flags
    assert not any(str(f).startswith("locked_at:") for f in attempt.proctor_flags)

    # Past the tolerance the paper keeps running: one flag, not a flag per event.
    # A different event kind, because the same signal inside the dedupe window is
    # deliberately one event rather than two.
    fourth = await _event(client, seeded, attempt_id, "copy_paste_attempt")
    assert fourth["violations_count"] == 4
    assert fourth["is_locked"] is False
    assert fourth["status"] == "in_progress"
    await db_session.refresh(attempt)
    assert list(attempt.proctor_flags).count("flagged_for_review") == 1

    # The candidate can still work: answers save and the paper is resumable.
    saved = await client.put(
        f"/api/v1/exam-attempts/{attempt_id}/answers",
        headers=seeded["headers"]["student"],
        json={
            "answers": [
                {
                    "exam_question_id": str(
                        [q.id for q in (await db_session.execute(
                            select(ExamQuestion).where(ExamQuestion.exam_id == seeded["exam"].id)
                        )).scalars().all()][0]
                    ),
                    "answer_data": {"selected": "A"},
                }
            ]
        },
    )
    assert saved.status_code == 200, saved.text

    resumed = await client.post(
        f"/api/v1/exams/{seeded['exam'].id}/start", headers=seeded["headers"]["student"], json={}
    )
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["data"]["status"] == "in_progress"

    # The review is one auditable event, not one per recorded signal.
    audits = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "exam.attempt_flagged_for_review",
                AuditLog.resource_id == str(attempt_id),
            )
        )
    ).scalars().all()
    assert len(audits) == 1
    assert audits[0].extra_data["violations_count"] == 3

    # Faculty still see the whole timeline for the review.
    timeline = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=seeded["headers"]["faculty"],
    )
    assert timeline.status_code == 200, timeline.text
    assert len(timeline.json()["data"]) == 4

    # The flag has to be actionable, not just stored: the staff attempt list
    # carries it (with when) and can be narrowed to the review queue.
    listed = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/attempts",
        headers=seeded["headers"]["faculty"],
    )
    assert listed.status_code == 200, listed.text
    row = next(a for a in listed.json()["data"] if a["id"] == attempt_id)
    assert row["flagged_for_review"] is True
    assert row["review_flagged_at"] is not None
    assert row["status"] == "in_progress"

    queue = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/attempts",
        params={"flagged_only": True},
        headers=seeded["headers"]["faculty"],
    )
    assert queue.status_code == 200, queue.text
    assert [a["id"] for a in queue.json()["data"]] == [attempt_id]

    # Candidates never see the staff review surface.
    student_view = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/attempts",
        headers=seeded["headers"]["student"],
    )
    assert student_view.status_code == 403, student_view.text

    # Reviewing an attempt clears the flag, so an actioned review stops showing
    # up in the queue it was raised in.
    reviewed = await client.post(
        f"/api/v1/exams/{seeded['exam'].id}/attempts/{attempt_id}/unlock",
        headers=seeded["headers"]["faculty"],
        json={"reason": "Technical fault verified; review completed."},
    )
    assert reviewed.status_code == 200, reviewed.text
    after = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/attempts",
        params={"flagged_only": True},
        headers=seeded["headers"]["faculty"],
    )
    assert after.json()["data"] == []


@pytest.mark.asyncio
async def test_removal_policy_stays_the_default_for_exams_that_never_chose(client, db_session):
    """An exam authored before the setting existed keeps the policy it shipped with."""
    seeded = await _seed_assessment(db_session, tag="DEF", max_violations=2, policy=None)
    attempt_id = await _begin(client, seeded, "browser_policy_default")

    brief = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/public", headers=seeded["headers"]["student"]
    )
    assert brief.status_code == 200, brief.text
    assert brief.json()["data"]["config"]["warning_policy"] == "remove"

    first = await _event(client, seeded, attempt_id)
    assert first["warning_policy"] == "remove"
    assert first["is_locked"] is False
    assert "allowance remaining" in first["warning"].lower()

    second = await _event(client, seeded, attempt_id, "fullscreen_exit")
    assert second["is_locked"] is True
    assert second["status"] == "locked_violation"
    assert "removed from this examination" in second["warning"].lower()

    attempt = (
        await db_session.execute(
            select(ExamAttempt).where(ExamAttempt.id == uuid.UUID(attempt_id))
        )
    ).scalar_one()
    await db_session.refresh(attempt)
    assert attempt.status == "locked_violation"
    assert "flagged_for_review" not in attempt.proctor_flags

    # A locked attempt is not a review-queue entry, and the queue is empty rather
    # than a second, parallel reminder of the same event.
    listed = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/attempts",
        headers=seeded["headers"]["faculty"],
    )
    row = next(a for a in listed.json()["data"] if a["id"] == attempt_id)
    assert row["flagged_for_review"] is False
    assert row["review_flagged_at"] is None
    queue = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/attempts",
        params={"flagged_only": True},
        headers=seeded["headers"]["faculty"],
    )
    assert queue.json()["data"] == []


@pytest.mark.asyncio
async def test_authoring_refuses_an_integrity_policy_the_engine_cannot_honour(client, db_session):
    """A typo must fail at authoring time rather than silently applying removal."""
    seeded = await _seed_assessment(db_session, tag="VAL", max_violations=5, policy=None)
    now = datetime.now(UTC)
    base = {
        "course_offering_id": str(seeded["offering"].id),
        "title": "Policy Validation Assessment",
        "total_marks": 10.0,
        "duration_minutes": 20,
        "start_window": (now - timedelta(minutes=1)).isoformat(),
        "end_window": (now + timedelta(hours=1)).isoformat(),
        "status": "scheduled",
    }

    typo = await client.post(
        "/api/v1/exams",
        headers=seeded["headers"]["faculty"],
        json={**base, "config": {"proctoring_enabled": True, "warning_policy": "lockout"}},
    )
    assert typo.status_code == 422, typo.text

    out_of_range = await client.post(
        "/api/v1/exams",
        headers=seeded["headers"]["faculty"],
        json={**base, "config": {"proctoring_enabled": True, "max_violations": 0}},
    )
    assert out_of_range.status_code == 422, out_of_range.text

    # The device-scan switch and the obstruction threshold are authored values
    # too, so a mistyped one is refused rather than silently ignored.
    bad_flag = await client.post(
        "/api/v1/exams",
        headers=seeded["headers"]["faculty"],
        json={**base, "config": {"device_detection_enabled": "yes"}},
    )
    assert bad_flag.status_code == 422, bad_flag.text

    bad_threshold = await client.post(
        "/api/v1/exams",
        headers=seeded["headers"]["faculty"],
        json={**base, "config": {"obstruction_threshold_seconds": 1}},
    )
    assert bad_threshold.status_code == 422, bad_threshold.text

    accepted = await client.post(
        "/api/v1/exams",
        headers=seeded["headers"]["faculty"],
        json={
            **base,
            "config": {"proctoring_enabled": True, "max_violations": 4, "warning_policy": "review"},
        },
    )
    assert accepted.status_code in (200, 201), accepted.text
    created = accepted.json()["data"]
    assert created["config"]["warning_policy"] == "review"
    assert created["config"]["max_violations"] == 4


@pytest.mark.asyncio
async def test_device_observation_raises_review_and_never_a_failure(client, db_session):
    """A modelled device is an observation for a human, not a verdict (ADR-024).

    The detector is browser-side and can be wrong, so the server must record what
    was seen, ask faculty to look, and leave the candidate's allowance and attempt
    state exactly as they were.
    """
    seeded = await _seed_assessment(
        db_session,
        tag="DEV",
        max_violations=5,
        policy="review",
        extra_config={"device_detection_enabled": True, "obstruction_threshold_seconds": 6},
    )
    attempt_id = await _begin(client, seeded, "browser_device_observation")

    # Both authored values are disclosed to the candidate before the paper starts.
    brief = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/public", headers=seeded["headers"]["student"]
    )
    assert brief.status_code == 200, brief.text
    assert brief.json()["data"]["config"]["device_detection_enabled"] is True
    assert brief.json()["data"]["config"]["obstruction_threshold_seconds"] == 6

    started = await client.post(
        f"/api/v1/exams/{seeded['exam'].id}/start", headers=seeded["headers"]["student"], json={}
    )
    assert started.status_code == 200, started.text
    assert started.json()["data"]["device_detection_enabled"] is True
    assert started.json()["data"]["obstruction_threshold_seconds"] == 6

    observation = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=seeded["headers"]["student"],
        json={
            "event_type": "second_device_detected",
            "severity": "medium",
            "details": {
                "category": "mobile_phone",
                "confidence": 0.91,
                "model": "coco-ssd",
                "confirmations": 3,
                "bbox": [10, 20, 120, 90],
                "snapshot": "data:image/jpeg;base64,AAAA",
            },
        },
    )
    assert observation.status_code == 200, observation.text
    status = observation.json()["data"]

    # The whole point: no allowance consumed, nothing submitted, still working.
    assert status["violations_count"] == 0
    assert status["is_locked"] is False
    assert status["auto_submitted"] is False
    assert status["status"] == "in_progress"
    assert "allowance was used" in status["warning"].lower()
    assert "no allowance" in status["warning"].lower()

    attempt = (
        await db_session.execute(
            select(ExamAttempt).where(ExamAttempt.id == uuid.UUID(attempt_id))
        )
    ).scalar_one()
    await db_session.refresh(attempt)
    assert attempt.status == "in_progress"
    assert attempt.proctor_violations_count == 0
    assert "flagged_for_review" in attempt.proctor_flags

    # Faculty can find it in the review queue, and the evidence frame was kept.
    queue = await client.get(
        f"/api/v1/exams/{seeded['exam'].id}/attempts",
        params={"flagged_only": True},
        headers=seeded["headers"]["faculty"],
    )
    assert queue.status_code == 200, queue.text
    assert [a["id"] for a in queue.json()["data"]] == [attempt_id]

    timeline = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=seeded["headers"]["faculty"],
    )
    assert timeline.status_code == 200, timeline.text
    recorded = timeline.json()["data"]
    assert [e["event_type"] for e in recorded] == ["second_device_detected"]
    assert recorded[0]["details"]["category"] == "mobile_phone"
    assert recorded[0]["details"]["confidence"] == 0.91

    audits = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "exam.attempt_flagged_device_observation",
                AuditLog.resource_id == str(attempt_id),
            )
        )
    ).scalars().all()
    assert len(audits) == 1

    # A second, different device signal does not multiply the flag or the audit.
    second = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=seeded["headers"]["student"],
        json={
            "event_type": "second_device_detected",
            "severity": "medium",
            "details": {"category": "earbuds", "confidence": 0.72, "model": "mobilenet"},
        },
    )
    assert second.status_code == 200, second.text
    assert second.json()["data"]["violations_count"] == 0
    after = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "exam.attempt_flagged_device_observation",
                AuditLog.resource_id == str(attempt_id),
            )
        )
    ).scalars().all()
    assert len(after) == 1
    await db_session.refresh(attempt)
    assert list(attempt.proctor_flags).count("flagged_for_review") == 1

    # And the candidate's work is untouched: answers still save.
    question_ids = (
        await db_session.execute(
            select(ExamQuestion.id).where(ExamQuestion.exam_id == seeded["exam"].id)
        )
    ).scalars().all()
    saved = await client.put(
        f"/api/v1/exam-attempts/{attempt_id}/answers",
        headers=seeded["headers"]["student"],
        json={
            "answers": [
                {"exam_question_id": str(question_ids[0]), "answer_data": {"selected": "A"}}
            ]
        },
    )
    assert saved.status_code == 200, saved.text

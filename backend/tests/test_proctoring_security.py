from datetime import UTC, datetime, timedelta

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamAttempt, ExamQuestion, ProctoringEvent
from campusflow.domain.exams.schemas import DEFAULT_EVIDENCE_RETENTION_DAYS
from campusflow.domain.exams.service import purge_proctoring_evidence
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_observable_proctoring_threshold_and_faculty_review(client, db_session):
    # 1. Setup Users
    faculty = User(
        email="faculty.phase6@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Barbara",
        last_name="Liskov",
        status="active",
    )
    student = User(
        email="student.phase6@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Donald",
        last_name="Knuth",
        status="active",
    )
    db_session.add_all([faculty, student])
    await db_session.flush()

    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    faculty_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"}
    student_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}

    # 2. Setup Academic Structure, Course Offering, and Question Bank
    dept = Department(name="Computer Security & Networks", code="CSN-P6")
    term = AcademicTerm(
        name="Fall 2026 Phase 6",
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(
        department_id=dept.id, code="CS601-P6", title="Network & Web Security", credits=3
    )
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
        department_id=dept.id,
        course_id=course.id,
        title="Security Exam Bank",
        created_by_id=faculty.id,
    )
    db_session.add(bank)
    await db_session.flush()

    q1 = Question(
        question_bank_id=bank.id,
        question_type="mcq",
        marks=5.0,
        body="Which protocol secures HTTP transport with asymmetric/symmetric encryption?",
        status="approved",
        created_by_id=faculty.id,
    )
    db_session.add(q1)
    await db_session.flush()
    db_session.add_all(
        [
            QuestionOption(
                question_id=q1.id, label="A", body="TLS / SSL", is_correct=True, sort_order=0
            ),
            QuestionOption(
                question_id=q1.id, label="B", body="FTP", is_correct=False, sort_order=1
            ),
        ]
    )
    await db_session.commit()

    # 3. Create Exam with max_violations = 3 threshold
    now = datetime.now(UTC)
    exam = Exam(
        course_offering_id=offering.id,
        title="Proctored Security Assessment",
        exam_type="midterm",
        total_marks=5.0,
        duration_minutes=30,
        start_window=now - timedelta(minutes=5),
        end_window=now + timedelta(hours=2),
        config={"proctoring_enabled": True, "max_violations": 3, "auto_grade": True},
        status="scheduled",
        created_by_id=faculty.id,
    )
    db_session.add(exam)
    await db_session.flush()
    db_session.add(ExamQuestion(exam_id=exam.id, question_id=q1.id, sort_order=1))
    await db_session.commit()

    # 4. Student Starts Exam Attempt
    start_resp = await client.post(
        f"/api/v1/exams/{exam.id}/start",
        headers=student_headers,
        json={"browser_fingerprint": "browser_test_fingerprint_secure"},
    )
    assert start_resp.status_code == 200, start_resp.text
    attempt_id = start_resp.json()["data"]["attempt_id"]

    # 5. Event 1: tab switch — recorded, not auto-submitted, neutral wording
    ev1 = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={"event_type": "tab_switch", "severity": "medium", "details": {"action": "switch"}},
    )
    assert ev1.status_code == 200, ev1.text
    status1 = ev1.json()["data"]
    assert status1["violations_count"] == 1
    assert status1["max_violations"] == 3
    assert status1["auto_submitted"] is False
    assert status1["is_locked"] is False
    # Every warning states which one it is and what is left (D-31), so the count
    # the candidate is judged by is never mysterious.
    assert "warning 1 of 3" in status1["warning"].lower()
    assert "2 warning(s) left" in status1["warning"].lower()

    # 6. Event 2: window blur
    ev2 = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={"event_type": "window_blur", "severity": "low", "details": {"reason": "focus_lost"}},
    )
    assert ev2.status_code == 200
    status2 = ev2.json()["data"]
    assert status2["violations_count"] == 2
    assert status2["auto_submitted"] is False

    # 7. Event 3: fullscreen exit reaches the configured tolerance -> lockout
    ev3 = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={"event_type": "fullscreen_exit", "severity": "high", "details": {"reason": "escape"}},
    )
    assert ev3.status_code == 200
    status3 = ev3.json()["data"]
    assert status3["violations_count"] == 3
    assert status3["auto_submitted"] is False
    assert status3["is_locked"] is True
    # The candidate is thrown out with their answers preserved; only faculty
    # authorisation brings them back (ADR-015).
    assert status3["status"] == "locked_violation"
    assert "examination stopped" in status3["warning"].lower()
    assert "only your lecturer" in status3["warning"].lower()

    # A locked candidate cannot restart or resume the paper on their own.
    locked_start = await client.post(
        f"/api/v1/exams/{exam.id}/start",
        headers=student_headers,
        json={},
    )
    assert locked_start.status_code == 423, locked_start.text

    # 8. Faculty integrity timeline
    timeline_resp = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=faculty_headers,
    )
    assert timeline_resp.status_code == 200, timeline_resp.text
    timeline = timeline_resp.json()["data"]
    assert [e["event_type"] for e in timeline] == ["tab_switch", "window_blur", "fullscreen_exit"]

    # Students cannot read the proctoring timeline (faculty-only permission)
    forbidden = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
    )
    assert forbidden.status_code == 403

    # Students cannot authorise their own resumed attempt
    student_unlock = await client.post(
        f"/api/v1/exams/{exam.id}/attempts/{attempt_id}/unlock",
        headers=student_headers,
        json={"reason": "self-service"},
    )
    assert student_unlock.status_code == 403

    # 9. Faculty authorises a resumed attempt after review
    unlock_resp = await client.post(
        f"/api/v1/exams/{exam.id}/attempts/{attempt_id}/unlock",
        headers=faculty_headers,
        json={"reason": "Peripheral monitor issue verified; resumed."},
    )
    assert unlock_resp.status_code == 200, unlock_resp.text
    unlock_data = unlock_resp.json()["data"]
    assert unlock_data["status"] == "in_progress"
    assert unlock_data["proctor_violations_count"] == 0

    # 10. After resumption the counter restarts and events are counted normally
    ev4 = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={"event_type": "copy_paste_attempt", "severity": "medium", "details": None},
    )
    assert ev4.status_code == 200
    status4 = ev4.json()["data"]
    assert status4["violations_count"] == 1
    assert status4["auto_submitted"] is False

    # 11. A captured camera frame is evidence, never a violation: the counter
    # must not move and the candidate's tolerance must not be consumed.
    snap = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={
            "event_type": "camera_snapshot",
            "severity": "low",
            "details": {"snapshot": "data:image/jpeg;base64,AAAA", "interval_seconds": 60},
        },
    )
    assert snap.status_code == 200, snap.text
    snap_status = snap.json()["data"]
    assert snap_status["violations_count"] == 1
    assert snap_status["warning"] is None
    assert snap_status["is_locked"] is False
    assert snap_status["status"] == "in_progress"
    assert snap_status["disposition"] == "evidence"

    # 11b. A camera inference is recorded for the lecturer and never counted:
    # the number the candidate is judged by must not move (ADR-040).
    inference = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={
            "event_type": "looking_away",
            "severity": "medium",
            "details": {"direction": "right", "yaw_degrees": 55, "dwell_ms": 2400},
        },
    )
    assert inference.status_code == 200, inference.text
    inference_status = inference.json()["data"]
    assert inference_status["violations_count"] == 1
    assert inference_status["warning"] is None
    assert inference_status["is_locked"] is False
    assert inference_status["event_category"] == "camera_observation"
    assert inference_status["disposition"] == "review_only"

    # 12. Camera loss is a counted warning as well as a camera observation: the
    # candidate is told, and the number they are judged by stays truthful.
    cam_off = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={"event_type": "camera_off", "severity": "high", "details": {"reason": "track_ended"}},
    )
    assert cam_off.status_code == 200, cam_off.text
    cam_status = cam_off.json()["data"]
    assert cam_status["violations_count"] == 2
    assert cam_status["auto_submitted"] is False
    assert cam_status["is_locked"] is False
    assert cam_status["event_category"] == "camera_observation"
    assert cam_status["disposition"] == "counted"

    # 13. Oversized frames are refused instead of being stored.
    huge = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={
            "event_type": "camera_snapshot",
            "severity": "low",
            "details": {"snapshot": "x" * 400_001},
        },
    )
    assert huge.status_code == 422

    # 14. The instructor's trail now carries the camera evidence too.
    final_timeline = await client.get(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=faculty_headers,
    )
    assert final_timeline.status_code == 200
    final_types = [e["event_type"] for e in final_timeline.json()["data"]]
    assert "camera_snapshot" in final_types
    assert "camera_off" in final_types
    assert "looking_away" in final_types
    # The timeline states what each entry cost, so a reviewer never has to infer
    # it from the source category (ADR-040).
    by_type = {e["event_type"]: e["disposition"] for e in final_timeline.json()["data"]}
    assert by_type["camera_snapshot"] == "evidence"
    assert by_type["camera_off"] == "counted"
    assert by_type["looking_away"] == "review_only"


@pytest.mark.asyncio
async def test_camera_evidence_is_erased_after_its_retention_window(db_session):
    """D-2: an expired evidence frame is erased; the event itself survives.

    Erasure is deliberately narrow: only the stored image goes. A reviewer must
    still see that a frame was captured and when it was erased, and a recent
    frame and an older non-evidence event must be left alone. A non-positive
    retention uses the finite application default, rather than disabling purge.
    """
    now = datetime.now(UTC)

    faculty = User(
        email="faculty.retention@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Grace",
        last_name="Hopper",
        status="active",
    )
    student = User(
        email="student.retention@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Alan",
        last_name="Turing",
        status="active",
    )
    db_session.add_all([faculty, student])
    await db_session.flush()

    dept = Department(name="Retention Studies", code="RTS-P2")
    term = AcademicTerm(
        name="Fall 2026 Retention",
        start_date=(now - timedelta(days=200)).date(),
        end_date=(now - timedelta(days=100)).date(),
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(department_id=dept.id, code="RT101", title="Evidence Retention", credits=3)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(
        course_id=course.id, academic_term_id=term.id, section="Sec-A", status="active"
    )
    db_session.add(offering)
    await db_session.flush()

    exam = Exam(
        course_offering_id=offering.id,
        title="Retention Assessment",
        exam_type="midterm",
        total_marks=5.0,
        duration_minutes=30,
        start_window=now - timedelta(days=200),
        end_window=now - timedelta(days=199),
        config={"proctoring_enabled": True},
        status="completed",
        created_by_id=faculty.id,
    )
    db_session.add(exam)
    await db_session.flush()

    attempt = ExamAttempt(
        exam_id=exam.id,
        student_id=student.id,
        started_at=now - timedelta(days=200),
        submitted_at=now - timedelta(days=200) + timedelta(minutes=30),
        status="submitted",
    )
    db_session.add(attempt)
    await db_session.flush()

    expired = ProctoringEvent(
        attempt_id=attempt.id,
        event_type="camera_snapshot",
        timestamp=now - timedelta(days=120),
        severity="low",
        details={"snapshot": "data:image/jpeg;base64,AAAA", "width": 320},
    )
    recent = ProctoringEvent(
        attempt_id=attempt.id,
        event_type="camera_snapshot",
        timestamp=now - timedelta(days=5),
        severity="low",
        details={"snapshot": "data:image/jpeg;base64,BBBB", "width": 320},
    )
    other = ProctoringEvent(
        attempt_id=attempt.id,
        event_type="tab_switch",
        timestamp=now - timedelta(days=120),
        severity="medium",
        details={"action": "switch"},
    )
    db_session.add_all([expired, recent, other])
    await db_session.commit()

    first = await purge_proctoring_evidence(db_session, 90)
    assert first["frames_erased"] == 1

    await db_session.refresh(expired)
    await db_session.refresh(recent)
    await db_session.refresh(other)
    assert "snapshot" not in expired.details
    assert "evidence_purged_at" in expired.details
    assert expired.details["width"] == 320
    assert recent.details["snapshot"].startswith("data:image/jpeg")
    assert other.details == {"action": "switch"}

    # Running again erases nothing: the frame is already gone.
    second = await purge_proctoring_evidence(db_session, 90)
    assert second["frames_erased"] == 0

    # A frame older than the default is still purged when the caller passes 0.
    stale = ProctoringEvent(
        attempt_id=attempt.id,
        event_type="second_device_detected",
        timestamp=now - timedelta(days=DEFAULT_EVIDENCE_RETENTION_DAYS + 1),
        severity="medium",
        details={"snapshot": "data:image/jpeg;base64,CCCC", "category": "mobile_phone"},
    )
    db_session.add(stale)
    await db_session.commit()
    fallback = await purge_proctoring_evidence(db_session, 0, now=now)
    assert fallback["frames_erased"] == 1
    await db_session.refresh(stale)
    assert "snapshot" not in stale.details
    assert "evidence_purged_at" in stale.details
    await db_session.refresh(recent)
    assert recent.details["snapshot"].startswith("data:image/jpeg")

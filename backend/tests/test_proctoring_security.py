from datetime import UTC, datetime, timedelta

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamQuestion
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

    course = Course(department_id=dept.id, code="CS601-P6", title="Network & Web Security", credits=3)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(course_id=course.id, academic_term_id=term.id, section="Sec-A", status="active")
    db_session.add(offering)
    await db_session.flush()

    db_session.add(Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled"))

    bank = QuestionBank(
        department_id=dept.id, course_id=course.id, title="Security Exam Bank", created_by_id=faculty.id
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
    db_session.add_all([
        QuestionOption(question_id=q1.id, label="A", body="TLS / SSL", is_correct=True, sort_order=0),
        QuestionOption(question_id=q1.id, label="B", body="FTP", is_correct=False, sort_order=1),
    ])
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
    assert "assessment-integrity notice" in status1["warning"].lower()

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

    # 7. Event 3: fullscreen exit reaches the configured tolerance -> auto-submit
    ev3 = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/proctoring-events",
        headers=student_headers,
        json={"event_type": "fullscreen_exit", "severity": "high", "details": {"reason": "escape"}},
    )
    assert ev3.status_code == 200
    status3 = ev3.json()["data"]
    assert status3["violations_count"] == 3
    assert status3["auto_submitted"] is True
    assert status3["is_locked"] is False
    # The attempt is concluded. Because this exam contains only objectively
    # gradable questions, auto-grading completes it immediately.
    assert status3["status"] in {"auto_submitted", "graded"}
    assert "tolerance" in status3["warning"].lower()

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

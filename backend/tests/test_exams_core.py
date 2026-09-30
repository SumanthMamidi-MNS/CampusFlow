import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import ExamAttempt
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_examination_core_end_to_end_lifecycle(client, db_session):
    # 1. Setup Users
    faculty = User(
        email="faculty.phase5@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Alan",
        last_name="Turing",
        status="active",
    )
    student = User(
        email="student.phase5@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Grace",
        last_name="Hopper",
        status="active",
    )
    db_session.add_all([faculty, student])
    await db_session.flush()

    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    faculty_token = create_access_token({"sub": str(faculty.id)})
    faculty_headers = {"Authorization": f"Bearer {faculty_token}"}

    student_token = create_access_token({"sub": str(student.id)})
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # 2. Setup Academic Structure & Course Offering
    dept = Department(name="Computer Science & Systems", code="CSS-P5")
    term = AcademicTerm(name="Fall 2026 Phase 5", start_date=datetime.now(UTC).date(), end_date=(datetime.now(UTC) + timedelta(days=90)).date())
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(department_id=dept.id, code="CS501-P5", title="Advanced Operating Systems", credits=4)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(course_id=course.id, academic_term_id=term.id, section="Sec-A", status="active")
    db_session.add(offering)
    await db_session.flush()

    # Enroll student
    enrollment = Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled")
    db_session.add(enrollment)

    # 3. Setup Question Bank & Questions
    bank = QuestionBank(department_id=dept.id, course_id=course.id, title="OS Midterm Bank", created_by_id=faculty.id)
    db_session.add(bank)
    await db_session.flush()

    # Q1: MCQ (Single Choice)
    q1 = Question(
        question_bank_id=bank.id,
        question_type="mcq",
        marks=2.0,
        negative_marks=0.5,
        body="What scheduling algorithm guarantees no starvation when priorities are not used?",
        status="approved",
        created_by_id=faculty.id,
    )
    db_session.add(q1)
    await db_session.flush()
    db_session.add_all([
        QuestionOption(question_id=q1.id, label="A", body="Round Robin", is_correct=True, sort_order=0),
        QuestionOption(question_id=q1.id, label="B", body="Shortest Job First", is_correct=False, sort_order=1),
        QuestionOption(question_id=q1.id, label="C", body="Priority Scheduling", is_correct=False, sort_order=2),
    ])

    # Q2: Numerical
    q2 = Question(
        question_bank_id=bank.id,
        question_type="numerical",
        marks=3.0,
        body="If a page size is 4KB and memory is 64KB, how many frames exist?",
        metadata_info={"answer": 16.0, "tolerance": 0.0},
        status="approved",
        created_by_id=faculty.id,
    )
    db_session.add(q2)

    # Q3: Short Answer (Subjective - Manual Grading)
    q3 = Question(
        question_bank_id=bank.id,
        question_type="short_answer",
        marks=5.0,
        body="Explain the difference between a process and a thread.",
        status="approved",
        created_by_id=faculty.id,
    )
    db_session.add(q3)
    await db_session.commit()

    # 4. Faculty creates Exam
    now = datetime.now(UTC)
    start_window = now - timedelta(minutes=5)
    end_window = now + timedelta(hours=2)

    create_exam_resp = await client.post(
        "/api/v1/exams",
        headers=faculty_headers,
        json={
            "course_offering_id": str(offering.id),
            "title": "Operating Systems Midterm 1",
            "description": "Midterm covering processes, scheduling, and memory.",
            "exam_type": "midterm",
            "total_marks": 10.0,
            "duration_minutes": 60,
            "start_window": start_window.isoformat(),
            "end_window": end_window.isoformat(),
            "instructions": "All objective questions are auto-graded. Short answer is manually reviewed.",
            "status": "scheduled",
        },
    )
    assert create_exam_resp.status_code == 200, create_exam_resp.text
    exam_data = create_exam_resp.json()["data"]
    exam_id = exam_data["id"]
    assert exam_data["title"] == "Operating Systems Midterm 1"

    # 5. Add Questions to Exam
    add_q_resp = await client.post(
        f"/api/v1/exams/{exam_id}/questions",
        headers=faculty_headers,
        json={
            "questions": [
                {"question_id": str(q1.id), "sort_order": 1, "marks_override": 2.0},
                {"question_id": str(q2.id), "sort_order": 2, "marks_override": 3.0},
                {"question_id": str(q3.id), "sort_order": 3, "marks_override": 5.0},
            ]
        },
    )
    assert add_q_resp.status_code == 200
    assert len(add_q_resp.json()["data"]["questions"]) == 3
    exam_questions = add_q_resp.json()["data"]["questions"]
    eq1_id = exam_questions[0]["id"]
    eq2_id = exam_questions[1]["id"]
    eq3_id = exam_questions[2]["id"]

    # 6. Student Starts Exam
    start_resp = await client.post(
        f"/api/v1/exams/{exam_id}/start",
        headers=student_headers,
        json={"browser_fingerprint": "fp_test_12345"},
    )
    assert start_resp.status_code == 200, start_resp.text
    delivery_data = start_resp.json()["data"]
    attempt_id = delivery_data["attempt_id"]
    assert delivery_data["remaining_seconds"] > 3500
    assert len(delivery_data["questions"]) == 3

    # Verify student question options do NOT leak is_correct!
    for q_del in delivery_data["questions"]:
        for opt in q_del["options"]:
            assert "is_correct" not in opt

    # 7. Student Auto-Saves Answers (Batch Save)
    save_resp = await client.put(
        f"/api/v1/exam-attempts/{attempt_id}/answers",
        headers=student_headers,
        json={
            "answers": [
                {
                    "exam_question_id": str(eq1_id),
                    "answer_data": {"selected": "A"},  # Correct Round Robin
                    "time_spent_seconds": 45,
                    "flagged_for_review": False,
                },
                {
                    "exam_question_id": str(eq2_id),
                    "answer_data": {"value": 16.0},  # Correct 16.0
                    "time_spent_seconds": 60,
                    "flagged_for_review": False,
                },
                {
                    "exam_question_id": str(eq3_id),
                    "answer_data": {"text": "A process has its own address space, whereas threads share memory."},
                    "time_spent_seconds": 120,
                    "flagged_for_review": True,
                },
            ]
        },
    )
    assert save_resp.status_code == 200
    assert save_resp.json()["data"]["status"] == "saved"

    # 8. Student Submits Exam
    submit_resp = await client.post(
        f"/api/v1/exam-attempts/{attempt_id}/submit",
        headers=student_headers,
    )
    assert submit_resp.status_code == 200, submit_resp.text
    sub_data = submit_resp.json()["data"]
    assert sub_data["status"] == "submitted"
    # Q1 (2.0) + Q2 (3.0) auto-graded = 5.0 points so far (Q3 pending manual grading)
    assert sub_data["total_score"] == 5.0
    assert sub_data["percentage"] == 50.0

    # 9. Faculty Manual Grading Queue
    attempts_resp = await client.get(
        f"/api/v1/exams/{exam_id}/attempts",
        headers=faculty_headers,
    )
    assert attempts_resp.status_code == 200
    attempts_list = attempts_resp.json()["data"]
    assert len(attempts_list) == 1
    assert attempts_list[0]["student_email"] == "student.phase5@campusflow.edu"

    # Get attempt responses from DB to find the subjective question response
    resp_records = await client.get(f"/api/v1/exams/{exam_id}", headers=faculty_headers)
    assert resp_records.status_code == 200

    # Retrieve response id for Q3
    att_res = await db_session.execute(
        select(ExamAttempt)
        .where(ExamAttempt.exam_id == uuid.UUID(str(exam_id)))
        .options(selectinload(ExamAttempt.responses))
    )
    att_rec = att_res.scalar_one()
    subjective_resp = next(r for r in att_rec.responses if r.exam_question_id == uuid.UUID(str(eq3_id)))

    # Faculty awards 4.5 out of 5.0 marks with feedback
    grade_resp = await client.post(
        f"/api/v1/exam-responses/{subjective_resp.id}/grade",
        headers=faculty_headers,
        json={"marks_awarded": 4.5, "feedback": "Accurate distinction regarding address space."},
    )
    assert grade_resp.status_code == 200
    graded_info = grade_resp.json()["data"]
    # Total score is now 2.0 (Q1) + 3.0 (Q2) + 4.5 (Q3) = 9.5
    assert graded_info["attempt_total_score"] == 9.5
    assert graded_info["attempt_status"] == "graded"

    # 10. Student tries to view results before publish (should be blocked)
    pre_pub_resp = await client.get(f"/api/v1/exams/{exam_id}/my-result", headers=student_headers)
    assert pre_pub_resp.status_code == 403

    # 11. Faculty Publishes Results
    publish_resp = await client.post(
        f"/api/v1/exams/{exam_id}/publish",
        headers=faculty_headers,
    )
    assert publish_resp.status_code == 200
    assert publish_resp.json()["data"]["status"] == "published"

    # 12. Student Views Results
    my_result_resp = await client.get(f"/api/v1/exams/{exam_id}/my-result", headers=student_headers)
    assert my_result_resp.status_code == 200, my_result_resp.text
    result_data = my_result_resp.json()["data"]
    assert result_data["total_score"] == 9.5
    assert result_data["percentage"] == 95.0
    assert len(result_data["responses"]) == 3

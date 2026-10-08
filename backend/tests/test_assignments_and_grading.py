from datetime import UTC, datetime, timedelta

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Batch, Department, Program
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_assignments_grading_and_gradebook_lifecycle(client, db_session):
    # 1. Setup Users
    admin = User(
        email="admin.phase3@campusflow.edu",
        hashed_password=get_password_hash("AdminPass123!"),
        first_name="Admin",
        last_name="Three",
        status="active",
    )
    faculty = User(
        email="faculty.phase3@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Prof",
        last_name="Turing",
        status="active",
    )
    student1 = User(
        email="student1.phase3@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Alice",
        last_name="Student",
        status="active",
    )
    student2 = User(
        email="student2.phase3@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Bob",
        last_name="Student",
        status="active",
    )
    db_session.add_all([admin, faculty, student1, student2])
    await db_session.flush()

    await assign_role_to_user(db_session, admin.id, "super_admin")
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student1.id, "student")
    await assign_role_to_user(db_session, student2.id, "student")

    # Setup Academic hierarchy
    dept = Department(name="Computer Science Phase 3", code="CS3")
    db_session.add(dept)
    await db_session.flush()

    prog = Program(name="B.Tech CS P3", code="CS3-BTECH", department_id=dept.id, duration_years=4)
    db_session.add(prog)
    await db_session.flush()

    batch = Batch(start_year=2026, label="2026-2030 Batch A", program_id=prog.id)
    term = AcademicTerm(
        name="Fall 2026 P3",
        term_type="semester",
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=120)).date(),
        is_current=True,
    )
    course = Course(code="CS301-P3", title="Algorithms P3", department_id=dept.id, credits=4)
    db_session.add_all([batch, term, course])
    await db_session.flush()

    offering = CourseOffering(
        course_id=course.id,
        academic_term_id=term.id,
        batch_id=batch.id,
        section="A",
    )
    db_session.add(offering)
    await db_session.flush()

    # Faculty teaches this offering (the real access record used for scoping).
    db_session.add(
        FacultyAssignment(course_offering_id=offering.id, faculty_id=faculty.id, role="primary")
    )

    # Enroll student1 and student2
    enr1 = Enrollment(course_offering_id=offering.id, student_id=student1.id, status="enrolled")
    enr2 = Enrollment(course_offering_id=offering.id, student_id=student2.id, status="enrolled")
    db_session.add_all([enr1, enr2])
    await db_session.commit()

    faculty_token = create_access_token({"sub": str(faculty.id), "email": faculty.email})
    student1_token = create_access_token({"sub": str(student1.id), "email": student1.email})
    student2_token = create_access_token({"sub": str(student2.id), "email": student2.email})

    faculty_headers = {"Authorization": f"Bearer {faculty_token}"}
    student1_headers = {"Authorization": f"Bearer {student1_token}"}
    student2_headers = {"Authorization": f"Bearer {student2_token}"}

    # 2. Faculty creates Assignment 1 (Future due date, 100 marks, 15% weightage)
    due_future = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    assign1_res = await client.post(
        f"/api/v1/course-offerings/{offering.id}/assignments",
        json={
            "course_offering_id": str(offering.id),
            "title": "Assignment 1: Sorting Algorithms",
            "description": "Implement Quicksort and Mergesort.",
            "assignment_type": "file_upload",
            "due_date": due_future,
            "total_marks": 100.0,
            "weightage": 15.0,
            "allow_late": False,
            "rubric": [
                {"criterion": "Correctness", "max_points": 60.0, "description": "Passes test cases"},
                {"criterion": "Code Style", "max_points": 40.0, "description": "Clean modular code"},
            ],
            "is_published": True,
        },
        headers=faculty_headers,
    )
    assert assign1_res.status_code == 200, assign1_res.text
    assign1_id = assign1_res.json()["data"]["id"]

    # 3. Verify in-app notifications sent to enrolled student1 & student2
    notif1_res = await client.get("/api/v1/notifications", headers=student1_headers)
    assert notif1_res.status_code == 200
    notifs1 = notif1_res.json()["data"]["items"]
    assert len(notifs1) >= 1
    assert "Assignment 1: Sorting Algorithms" in notifs1[0]["title"]
    assert notif1_res.json()["data"]["unread_count"] >= 1

    # 4. Student 1 submits text and file
    sub1_res = await client.post(
        f"/api/v1/assignments/{assign1_id}/submit-file",
        data={"content_text": "Here is my Quicksort implementation in Python."},
        files={"file": ("algorithms.py", b"def quicksort(arr): return arr", "text/x-python")},
        headers=student1_headers,
    )
    assert sub1_res.status_code == 200, sub1_res.text
    sub1_data = sub1_res.json()["data"]
    assert sub1_data["status"] == "submitted"
    assert sub1_data["is_late"] is False
    assert sub1_data["file_name"] == "algorithms.py"
    sub1_id = sub1_data["id"]

    # 5. Student 1 checks own submission
    my_sub_res = await client.get(
        f"/api/v1/assignments/{assign1_id}/my-submission",
        headers=student1_headers,
    )
    assert my_sub_res.status_code == 200
    assert my_sub_res.json()["data"]["id"] == sub1_id

    # 6. Faculty views submissions list
    subs_list_res = await client.get(
        f"/api/v1/assignments/{assign1_id}/submissions",
        headers=faculty_headers,
    )
    assert subs_list_res.status_code == 200
    subs_list = subs_list_res.json()["data"]
    assert len(subs_list) == 1
    assert subs_list[0]["student_name"] == "Alice Student"

    # 7. Faculty downloads student file
    download_res = await client.get(
        f"/api/v1/submissions/{sub1_id}/download",
        headers=faculty_headers,
    )
    assert download_res.status_code == 200
    assert download_res.content == b"def quicksort(arr): return arr"

    # 8. Faculty grades Student 1 submission
    grade_res = await client.post(
        f"/api/v1/submissions/{sub1_id}/grade",
        json={
            "marks_obtained": 95.0,
            "feedback": "Excellent implementation with comprehensive base case checks.",
            "rubric_evaluation": {"Correctness": 58.0, "Code Style": 37.0},
        },
        headers=faculty_headers,
    )
    assert grade_res.status_code == 200, grade_res.text
    grade_data = grade_res.json()["data"]
    assert grade_data["marks_obtained"] == 95.0
    assert grade_data["final_marks"] == 95.0
    assert grade_data["penalty_deducted"] == 0.0

    # 9. Student 1 receives graded notification
    notif_after_grade = await client.get("/api/v1/notifications", headers=student1_headers)
    assert notif_after_grade.status_code == 200
    notif_items = notif_after_grade.json()["data"]["items"]
    assert any(n["notification_type"] == "submission_graded" for n in notif_items)

    # 10. Test late submission policy
    # Faculty creates Assignment 2 with due date in the past and late penalty
    due_past = (datetime.now(UTC) - timedelta(days=2)).isoformat()
    assign2_res = await client.post(
        f"/api/v1/course-offerings/{offering.id}/assignments",
        json={
            "course_offering_id": str(offering.id),
            "title": "Assignment 2: Graph Search",
            "due_date": due_past,
            "total_marks": 100.0,
            "weightage": 20.0,
            "allow_late": True,
            "late_penalty_percent_per_day": 10.0,  # 10% per day
            "max_late_days": 5,
            "is_published": True,
        },
        headers=faculty_headers,
    )
    assert assign2_res.status_code == 200
    assign2_id = assign2_res.json()["data"]["id"]

    # Student 2 submits Assignment 2 late
    sub2_res = await client.post(
        f"/api/v1/assignments/{assign2_id}/submit",
        json={"content_text": "BFS and DFS implementations."},
        headers=student2_headers,
    )
    assert sub2_res.status_code == 200
    sub2_data = sub2_res.json()["data"]
    assert sub2_data["is_late"] is True
    assert sub2_data["late_days"] >= 2
    sub2_id = sub2_data["id"]

    # Faculty grades Student 2 with 80 marks -> penalty deducted
    grade2_res = await client.post(
        f"/api/v1/submissions/{sub2_id}/grade",
        json={"marks_obtained": 80.0, "feedback": "Good job, but late penalty applied."},
        headers=faculty_headers,
    )
    assert grade2_res.status_code == 200
    grade2_data = grade2_res.json()["data"]
    # Late days is at least 2 -> 20% penalty on 80 marks = 16.0 penalty
    assert grade2_data["penalty_deducted"] > 0
    assert grade2_data["final_marks"] < 80.0

    # 11. Test Gradebook Aggregation
    gb_res = await client.get(
        f"/api/v1/course-offerings/{offering.id}/gradebook",
        headers=faculty_headers,
    )
    assert gb_res.status_code == 200
    gb_data = gb_res.json()["data"]
    assert len(gb_data["assignments"]) == 2
    assert len(gb_data["students"]) == 2

    alice_entry = next(s for s in gb_data["students"] if s["student_name"] == "Alice Student")
    assert alice_entry["assignment_scores"][assign1_id] == 95.0
    assert alice_entry["total_weighted_score"] > 0

    # 12. Test Gradebook CSV Export
    csv_res = await client.get(
        f"/api/v1/course-offerings/{offering.id}/gradebook/export",
        headers=faculty_headers,
    )
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "Student Name" in csv_res.text
    assert "Alice Student" in csv_res.text
    assert "Bob Student" in csv_res.text

    # 13. Test Mark Notification as Read
    first_notif_id = notifs1[0]["id"]
    read_res = await client.patch(
        f"/api/v1/notifications/{first_notif_id}/read",
        headers=student1_headers,
    )
    assert read_res.status_code == 200
    assert read_res.json()["data"]["is_read"] is True

    # Mark all read
    all_read_res = await client.post(
        "/api/v1/notifications/read-all",
        headers=student1_headers,
    )
    assert all_read_res.status_code == 200
    after_all_notifs = await client.get("/api/v1/notifications", headers=student1_headers)
    assert after_all_notifs.json()["data"]["unread_count"] == 0

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.courses.models import Course
from campusflow.domain.departments.models import Department
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_question_banks_and_questions_lifecycle(client, db_session):
    # 1. Setup Faculty and Admin users
    faculty = User(
        email="faculty.phase4@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Ada",
        last_name="Lovelace",
        status="active",
    )
    admin = User(
        email="admin.phase4@campusflow.edu",
        hashed_password=get_password_hash("AdminPass123!"),
        first_name="Admin",
        last_name="Four",
        status="active",
    )
    student = User(
        email="student.phase4@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Charlie",
        last_name="Student",
        status="active",
    )
    db_session.add_all([faculty, admin, student])
    await db_session.flush()

    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, admin.id, "super_admin")
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    faculty_token = create_access_token({"sub": str(faculty.id)})
    faculty_headers = {"Authorization": f"Bearer {faculty_token}"}

    student_token = create_access_token({"sub": str(student.id)})
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # 2. Setup Department and Course
    dept = Department(name="Computer Science & AI", code="CSAI-P4")
    db_session.add(dept)
    await db_session.flush()

    course = Course(
        department_id=dept.id,
        code="CS401-P4",
        title="Algorithms & Complexity",
        credits=4,
    )
    db_session.add(course)
    await db_session.commit()

    # 3. Create Question Bank (Faculty)
    create_bank_resp = await client.post(
        "/api/v1/question-banks",
        headers=faculty_headers,
        json={
            "department_id": str(dept.id),
            "course_id": str(course.id),
            "title": "Algorithms Midterm Question Bank",
            "description": "Comprehensive bank for algorithms and data structures",
        },
    )
    assert create_bank_resp.status_code == 200, create_bank_resp.text
    bank_data = create_bank_resp.json()["data"]
    bank_id = bank_data["id"]
    assert bank_data["title"] == "Algorithms Midterm Question Bank"
    assert bank_data["department_name"] == "Computer Science & AI"

    # Students cannot create question banks
    unauth_resp = await client.post(
        "/api/v1/question-banks",
        headers=student_headers,
        json={
            "department_id": str(dept.id),
            "title": "Unauthorized Bank",
        },
    )
    assert unauth_resp.status_code == 403

    # 4. Create Questions with different types
    # 4a. MCQ Question (Single choice, exactly 1 correct)
    mcq_resp = await client.post(
        f"/api/v1/question-banks/{bank_id}/questions",
        headers=faculty_headers,
        json={
            "question_type": "mcq",
            "difficulty": "medium",
            "marks": 2.0,
            "negative_marks": 0.5,
            "body": "What is the worst-case time complexity of QuickSort?",
            "explanation": "QuickSort can degenerate to O(N^2) if the pivot is consistently unbalanced.",
            "tags": ["algorithms", "sorting", "complexity"],
            "options": [
                {"label": "A", "body": "O(N log N)", "is_correct": False, "sort_order": 0},
                {"label": "B", "body": "O(N^2)", "is_correct": True, "sort_order": 1},
                {"label": "C", "body": "O(log N)", "is_correct": False, "sort_order": 2},
                {"label": "D", "body": "O(N)", "is_correct": False, "sort_order": 3},
            ],
        },
    )
    assert mcq_resp.status_code == 200, mcq_resp.text
    q_mcq = mcq_resp.json()["data"]
    assert q_mcq["question_type"] == "mcq"
    assert len(q_mcq["options"]) == 4
    assert q_mcq["status"] == "draft"

    # 4b. Invalid MCQ validation: 0 correct options
    bad_mcq_resp = await client.post(
        f"/api/v1/question-banks/{bank_id}/questions",
        headers=faculty_headers,
        json={
            "question_type": "mcq",
            "body": "Invalid MCQ with no correct answer",
            "options": [
                {"label": "A", "body": "Choice 1", "is_correct": False},
                {"label": "B", "body": "Choice 2", "is_correct": False},
            ],
        },
    )
    assert bad_mcq_resp.status_code == 400
    assert "exactly 1 correct option" in bad_mcq_resp.text

    # 4c. MSQ Question (Multiple select, >=1 correct)
    msq_resp = await client.post(
        f"/api/v1/question-banks/{bank_id}/questions",
        headers=faculty_headers,
        json={
            "question_type": "msq",
            "difficulty": "hard",
            "marks": 3.0,
            "body": "Which of the following sorting algorithms have worst-case O(N log N) time complexity?",
            "options": [
                {"label": "A", "body": "MergeSort", "is_correct": True, "sort_order": 0},
                {"label": "B", "body": "HeapSort", "is_correct": True, "sort_order": 1},
                {"label": "C", "body": "QuickSort", "is_correct": False, "sort_order": 2},
                {"label": "D", "body": "BubbleSort", "is_correct": False, "sort_order": 3},
            ],
        },
    )
    assert msq_resp.status_code == 200
    q_msq = msq_resp.json()["data"]
    assert q_msq["question_type"] == "msq"

    # 4d. True/False Question
    tf_resp = await client.post(
        f"/api/v1/question-banks/{bank_id}/questions",
        headers=faculty_headers,
        json={
            "question_type": "true_false",
            "marks": 1.0,
            "body": "Dijkstra's algorithm supports graphs with negative edge weights.",
            "options": [
                {"label": "A", "body": "True", "is_correct": False},
                {"label": "B", "body": "False", "is_correct": True},
            ],
        },
    )
    assert tf_resp.status_code == 200

    # 4e. Numerical Question
    num_resp = await client.post(
        f"/api/v1/question-banks/{bank_id}/questions",
        headers=faculty_headers,
        json={
            "question_type": "numerical",
            "marks": 2.0,
            "body": "What is the height of a balanced binary tree with 15 nodes?",
            "metadata_info": {"answer": 3.0, "tolerance": 0.0},
        },
    )
    assert num_resp.status_code == 200
    q_num = num_resp.json()["data"]
    assert q_num["metadata_info"]["answer"] == 3.0

    # 5. List and Filter Questions
    list_q_resp = await client.get(
        f"/api/v1/question-banks/{bank_id}/questions?question_type=mcq",
        headers=faculty_headers,
    )
    assert list_q_resp.status_code == 200
    assert len(list_q_resp.json()["data"]) == 1
    assert list_q_resp.json()["data"][0]["id"] == q_mcq["id"]

    # 6. Approve Question
    approve_resp = await client.post(
        f"/api/v1/questions/{q_mcq['id']}/approve",
        headers=faculty_headers,
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["data"]["status"] == "approved"

    # 7. Bulk CSV Import
    csv_payload = (
        "question_type,difficulty,marks,negative_marks,body,options,correct_options,explanation,tags,accepted_answers,numerical_answer,tolerance\n"
        "mcq,easy,1.0,0.0,What is 2+2?,3|4|5,4,Basic math,math,,,\n"
        "true_false,easy,1.0,0.0,Python is an interpreted language.,True|False,True,Python bytecode runs on VM,python,,,\n"
        "numerical,medium,2.0,0.0,Calculate 10 divided by 4.,,,Division,math,,2.5,0.0\n"
    )

    import_resp = await client.post(
        f"/api/v1/question-banks/{bank_id}/import-csv",
        headers=faculty_headers,
        files={"file": ("questions.csv", csv_payload.encode("utf-8"), "text/csv")},
    )
    assert import_resp.status_code == 200, import_resp.text
    import_data = import_resp.json()["data"]
    assert import_data["imported_count"] == 3
    assert import_data["failed_count"] == 0

    # 8. Export CSV
    export_resp = await client.get(
        f"/api/v1/question-banks/{bank_id}/export-csv",
        headers=faculty_headers,
    )
    assert export_resp.status_code == 200
    assert "What is the worst-case time complexity of QuickSort?" in export_resp.text
    assert "Calculate 10 divided by 4." in export_resp.text

    # 9. Get Question Bank Stats
    bank_check = await client.get(
        f"/api/v1/question-banks/{bank_id}",
        headers=faculty_headers,
    )
    assert bank_check.status_code == 200
    # 4 created individually + 3 imported = 7 questions
    assert bank_check.json()["data"]["questions_count"] == 7

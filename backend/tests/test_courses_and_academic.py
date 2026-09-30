import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_academic_and_course_lifecycle(client, db_session):
    # 1. Setup Admin user
    admin = User(
        email="courseadmin@campusflow.edu",
        hashed_password=get_password_hash("AdminPass123!"),
        first_name="Admin",
        last_name="Academic",
        status="active",
    )
    db_session.add(admin)
    await db_session.flush()
    await assign_role_to_user(db_session, admin.id, "super_admin")

    # Setup Faculty user
    faculty = User(
        email="prof.smith@campusflow.edu",
        hashed_password=get_password_hash("ProfPass123!"),
        first_name="Alan",
        last_name="Smith",
        status="active",
    )
    db_session.add(faculty)
    await db_session.flush()
    await assign_role_to_user(db_session, faculty.id, "faculty")

    # Setup Student user
    student = User(
        email="student.john@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="John",
        last_name="Student",
        status="active",
    )
    db_session.add(student)
    await db_session.flush()
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    admin_token = create_access_token({"sub": str(admin.id), "email": admin.email})
    faculty_token = create_access_token({"sub": str(faculty.id), "email": faculty.email})
    student_token = create_access_token({"sub": str(student.id), "email": student.email})

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    faculty_headers = {"Authorization": f"Bearer {faculty_token}"}
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # 2. Create Department
    dept_res = await client.post(
        "/api/v1/departments",
        json={"name": "Computer Science", "code": "CS", "description": "Dept of CS"},
        headers=admin_headers,
    )
    assert dept_res.status_code == 200
    dept_id = dept_res.json()["data"]["id"]

    # 3. Create Program
    prog_res = await client.post(
        "/api/v1/programs",
        json={
            "name": "B.Tech Computer Science",
            "code": "BTECH-CS",
            "department_id": dept_id,
            "degree_type": "Bachelor",
            "duration_years": 4,
        },
        headers=admin_headers,
    )
    assert prog_res.status_code == 200
    prog_id = prog_res.json()["data"]["id"]

    # 4. Create Batch
    batch_res = await client.post(
        "/api/v1/batches",
        json={"program_id": prog_id, "start_year": 2024, "label": "2024-2028 Batch A"},
        headers=admin_headers,
    )
    assert batch_res.status_code == 200
    batch_id = batch_res.json()["data"]["id"]

    # 5. Create Academic Term
    term_res = await client.post(
        "/api/v1/academic-terms",
        json={
            "name": "Fall 2026",
            "term_type": "semester",
            "start_date": "2026-09-01",
            "end_date": "2026-12-20",
            "is_current": True,
        },
        headers=admin_headers,
    )
    assert term_res.status_code == 200
    term_id = term_res.json()["data"]["id"]

    # 6. Create Course
    course_res = await client.post(
        "/api/v1/courses",
        json={
            "code": "CS301",
            "title": "Database Systems",
            "department_id": dept_id,
            "credits": 4,
            "description": "Relational algebra, SQL, indexing",
        },
        headers=admin_headers,
    )
    assert course_res.status_code == 200
    course_id = course_res.json()["data"]["id"]

    # 7. Create Course Offering and Assign Faculty
    offering_res = await client.post(
        "/api/v1/course-offerings",
        json={
            "course_id": course_id,
            "academic_term_id": term_id,
            "batch_id": batch_id,
            "section": "A",
            "status": "active",
            "faculty_ids": [str(faculty.id)],
        },
        headers=admin_headers,
    )
    assert offering_res.status_code == 200
    offering_id = offering_res.json()["data"]["id"]

    # 8. Enroll Student
    enroll_res = await client.post(
        f"/api/v1/course-offerings/{offering_id}/enrollments",
        json={"student_id": str(student.id)},
        headers=admin_headers,
    )
    assert enroll_res.status_code == 200

    # 9. Verify Roster List
    roster_res = await client.get(
        f"/api/v1/course-offerings/{offering_id}/enrollments",
        headers=faculty_headers,
    )
    assert roster_res.status_code == 200
    roster = roster_res.json()["data"]
    assert len(roster) == 1
    assert roster[0]["student_id"] == str(student.id)

    # 10. Student sees enrolled offering
    student_offerings_res = await client.get("/api/v1/course-offerings", headers=student_headers)
    assert student_offerings_res.status_code == 200
    student_offerings = student_offerings_res.json()["data"]
    assert len(student_offerings) == 1
    assert student_offerings[0]["id"] == offering_id

    # 11. Create Material Folder and Upload File Material
    folder_res = await client.post(
        f"/api/v1/course-offerings/{offering_id}/folders",
        json={"title": "Week 1 - Intro", "sort_order": 1},
        headers=faculty_headers,
    )
    assert folder_res.status_code == 200
    folder_id = folder_res.json()["data"]["id"]

    # Upload material file
    sample_pdf_bytes = b"%PDF-1.4 sample content for syllabus"
    files = {"file": ("syllabus.pdf", sample_pdf_bytes, "application/pdf")}
    upload_res = await client.post(
        f"/api/v1/course-offerings/{offering_id}/materials/upload",
        data={"title": "Course Syllabus", "folder_id": folder_id},
        files=files,
        headers=faculty_headers,
    )
    assert upload_res.status_code == 200
    material_id = upload_res.json()["data"]["id"]

    # Student downloads material file
    download_res = await client.get(
        f"/api/v1/materials/{material_id}/download",
        headers=student_headers,
    )
    assert download_res.status_code == 200
    assert download_res.content == sample_pdf_bytes

    # 12. Create and Read Announcement
    ann_res = await client.post(
        f"/api/v1/course-offerings/{offering_id}/announcements",
        json={
            "title": "Welcome to CS301",
            "body": "First lecture on Monday at 9 AM in Room 402.",
            "is_pinned": True,
        },
        headers=faculty_headers,
    )
    assert ann_res.status_code == 200

    student_ann_res = await client.get(
        f"/api/v1/course-offerings/{offering_id}/announcements",
        headers=student_headers,
    )
    assert student_ann_res.status_code == 200
    announcements = student_ann_res.json()["data"]
    assert len(announcements) == 1
    assert announcements[0]["title"] == "Welcome to CS301"
    assert announcements[0]["is_pinned"] is True

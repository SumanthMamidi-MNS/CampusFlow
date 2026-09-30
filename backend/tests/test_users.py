import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_admin_can_crud_users(client, db_session):
    # Setup admin user
    admin = User(
        email="superadmin@campusflow.edu",
        hashed_password=get_password_hash("AdminPass123!"),
        first_name="Admin",
        last_name="Super",
        status="active",
    )
    db_session.add(admin)
    await db_session.flush()
    await assign_role_to_user(db_session, admin.id, "super_admin")
    await db_session.commit()

    admin_token = create_access_token({"sub": str(admin.id), "email": admin.email})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a new user
    create_resp = await client.post(
        "/api/v1/users",
        json={
            "email": "newstudent@campusflow.edu",
            "first_name": "Alice",
            "last_name": "Wonder",
            "password": "Password2026!",
            "roles": ["student"],
            "status": "active",
        },
        headers=headers,
    )
    assert create_resp.status_code == 200
    created_user = create_resp.json()["data"]
    user_id = created_user["id"]
    assert created_user["email"] == "newstudent@campusflow.edu"
    assert "student" in created_user["roles"]

    # 2. Get user by ID
    get_resp = await client.get(f"/api/v1/users/{user_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["first_name"] == "Alice"

    # 3. Update user
    patch_resp = await client.patch(
        f"/api/v1/users/{user_id}",
        json={"first_name": "Alicia", "phone": "555-0199"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["first_name"] == "Alicia"
    assert patch_resp.json()["data"]["phone"] == "555-0199"

    # 4. List users
    list_resp = await client.get("/api/v1/users?search=Alicia", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()["data"]) == 1

    # 5. Delete user
    del_resp = await client.delete(f"/api/v1/users/{user_id}", headers=headers)
    assert del_resp.status_code == 200

    # 6. Verify user is soft-deleted
    get_after_del = await client.get(f"/api/v1/users/{user_id}", headers=headers)
    assert get_after_del.status_code == 404


@pytest.mark.asyncio
async def test_student_forbidden_from_user_crud(client, db_session):
    student = User(
        email="plainstudent@campusflow.edu",
        hashed_password=get_password_hash("Pass123!"),
        first_name="Regular",
        last_name="Student",
        status="active",
    )
    db_session.add(student)
    await db_session.flush()
    await assign_role_to_user(db_session, student.id, "student")
    await db_session.commit()

    student_token = create_access_token({"sub": str(student.id), "email": student.email})
    headers = {"Authorization": f"Bearer {student_token}"}

    # Student trying to list users
    resp = await client.get("/api/v1/users", headers=headers)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_bulk_import_csv(client, db_session):
    admin = User(
        email="csvadmin@campusflow.edu",
        hashed_password=get_password_hash("AdminPass123!"),
        first_name="Admin",
        last_name="CSV",
        status="active",
    )
    db_session.add(admin)
    await db_session.flush()
    await assign_role_to_user(db_session, admin.id, "super_admin")
    await db_session.commit()

    admin_token = create_access_token({"sub": str(admin.id), "email": admin.email})
    headers = {"Authorization": f"Bearer {admin_token}"}

    csv_data = (
        "email,first_name,last_name,phone,roles\n"
        "s1@campusflow.edu,Student,One,123456,student\n"
        "s2@campusflow.edu,Student,Two,234567,student\n"
        "f1@campusflow.edu,Faculty,One,345678,faculty\n"
    )

    files = {"file": ("students.csv", csv_data.encode("utf-8"), "text/csv")}
    resp = await client.post("/api/v1/users/bulk-import", files=files, headers=headers)
    assert resp.status_code == 200
    res_data = resp.json()["data"]
    assert res_data["created_count"] == 3
    assert res_data["skipped_count"] == 0

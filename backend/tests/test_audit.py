import pytest

from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.users.models import User


@pytest.mark.asyncio
async def test_audit_log_recording_and_querying(client, db_session):
    admin = User(
        email="auditadmin@campusflow.edu",
        hashed_password=get_password_hash("AdminPass123!"),
        first_name="Auditor",
        last_name="General",
        status="active",
    )
    db_session.add(admin)
    await db_session.flush()
    await assign_role_to_user(db_session, admin.id, "super_admin")
    await db_session.commit()

    # Record test event
    await record_audit_event(
        db_session,
        action="course.create",
        resource_type="course",
        resource_id="CS101",
        user_id=admin.id,
        user_email=admin.email,
        changes={"name": "Intro to CS"},
    )
    await db_session.commit()

    admin_token = create_access_token({"sub": str(admin.id), "email": admin.email})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Query audit logs
    resp = await client.get("/api/v1/admin/audit-logs", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["meta"]["pagination"]["total"] >= 1
    actions = [item["action"] for item in data["data"]]
    assert "course.create" in actions

"""The mandatory Campus Lead invariant.

An institution can never be left without an active Campus Lead (the ``admin``
role). These tests pin the three removal paths (role demotion, deactivation, soft
delete), the same-transaction escape (another active lead exists), the
super-admin recovery path, and — on PostgreSQL only — that two concurrent
removals cannot both succeed.
"""

import asyncio
import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.models import Role, UserRole
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.institution.leadership import count_active_campus_leads
from campusflow.domain.users.models import User

IS_POSTGRES = os.environ.get("TEST_DATABASE_URL", "").startswith("postgresql")


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


async def _active_admin_ids(db) -> list[uuid.UUID]:
    res = await db.execute(
        select(User.id)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.name == "admin", User.status == "active", User.deleted_at.is_(None))
    )
    return list(res.scalars().all())


@pytest_asyncio.fixture
async def lead_world(db_session):
    """Two fresh Campus Leads plus an ordinary faculty member.

    The invariant is institution-wide while the test engine and its data are
    shared for the whole session, so every other active Campus Lead is parked
    (deactivated) for the duration of the test and restored afterwards. That
    makes the count deterministic without weakening any assertion.
    """
    tag = uuid.uuid4().hex[:8]
    parked = await _active_admin_ids(db_session)
    if parked:
        for user_id in parked:
            user = await db_session.get(User, user_id)
            if user is not None:
                user.status = "inactive"
        await db_session.commit()

    lead_a = User(
        email=f"lead.a.{tag}@campusflow.edu",
        hashed_password=get_password_hash("LeadPass123!"),
        first_name="Lea",
        last_name="Adair",
        status="active",
    )
    lead_b = User(
        email=f"lead.b.{tag}@campusflow.edu",
        hashed_password=get_password_hash("LeadPass123!"),
        first_name="Ben",
        last_name="Campus",
        status="active",
    )
    faculty = User(
        email=f"faculty.cl.{tag}@campusflow.edu",
        hashed_password=get_password_hash("FacPass123!"),
        first_name="Fay",
        last_name="Lee",
        status="active",
    )
    platform = User(
        email=f"platform.cl.{tag}@campusflow.edu",
        hashed_password=get_password_hash("RootPass123!"),
        first_name="Root",
        last_name="Platform",
        status="active",
    )
    db_session.add_all([lead_a, lead_b, faculty, platform])
    await db_session.flush()

    await assign_role_to_user(db_session, lead_a.id, "admin")
    await assign_role_to_user(db_session, lead_b.id, "admin")
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, platform.id, "super_admin")
    await db_session.commit()

    world = {
        "leads": [lead_a, lead_b],
        "headers": {
            "lead_a": auth_headers(lead_a),
            "lead_b": auth_headers(lead_b),
            "faculty": auth_headers(faculty),
            "platform": auth_headers(platform),
        },
        "ids": {"lead_a": lead_a.id, "lead_b": lead_b.id, "faculty": faculty.id},
        "db": db_session,
    }
    yield world

    # Restore the parked leads so later tests in the session are unaffected.
    for user_id in parked:
        user = await db_session.get(User, user_id)
        if user is not None:
            user.status = "active"
    # Keep the two fixtures' leads out of the way for the next test instead of
    # relying on the parking step to see them.
    await db_session.commit()


@pytest.mark.asyncio
async def test_last_lead_cannot_be_deactivated(client, lead_world):
    """Deactivating the only remaining Campus Lead is refused with 409."""
    db = lead_world["db"]
    # Reduce to a single active lead first.
    res = await client.patch(
        f"/api/v1/users/{lead_world['ids']['lead_b']}",
        headers=lead_world["headers"]["lead_a"],
        json={"status": "inactive"},
    )
    assert res.status_code == 200, res.text
    assert await count_active_campus_leads(db) == 1

    res = await client.patch(
        f"/api/v1/users/{lead_world['ids']['lead_a']}",
        headers=lead_world["headers"]["lead_a"],
        json={"status": "inactive"},
    )
    assert res.status_code == 409, res.text
    assert "Campus Lead" in res.text
    assert await count_active_campus_leads(db) == 1, "the institution must keep a lead"


@pytest.mark.asyncio
async def test_last_lead_cannot_be_demoted(client, lead_world):
    """Replacing the last lead's roles with something else is refused."""
    db = lead_world["db"]
    await client.patch(
        f"/api/v1/users/{lead_world['ids']['lead_b']}",
        headers=lead_world["headers"]["lead_a"],
        json={"status": "inactive"},
    )
    res = await client.patch(
        f"/api/v1/users/{lead_world['ids']['lead_a']}",
        headers=lead_world["headers"]["lead_a"],
        json={"roles": ["faculty"]},
    )
    assert res.status_code == 409, res.text
    assert await count_active_campus_leads(db) == 1


@pytest.mark.asyncio
async def test_last_lead_cannot_be_deleted(client, lead_world):
    db = lead_world["db"]
    await client.patch(
        f"/api/v1/users/{lead_world['ids']['lead_b']}",
        headers=lead_world["headers"]["lead_a"],
        json={"status": "inactive"},
    )
    res = await client.delete(
        f"/api/v1/users/{lead_world['ids']['lead_a']}",
        headers=lead_world["headers"]["lead_a"],
    )
    assert res.status_code == 409, res.text
    assert await count_active_campus_leads(db) == 1


@pytest.mark.asyncio
async def test_removal_allowed_when_another_lead_exists(client, lead_world):
    """The same-transaction escape: a second active lead makes removal legal."""
    db = lead_world["db"]
    assert await count_active_campus_leads(db) == 2

    res = await client.patch(
        f"/api/v1/users/{lead_world['ids']['lead_b']}",
        headers=lead_world["headers"]["lead_a"],
        json={"roles": ["faculty"]},
    )
    assert res.status_code == 200, res.text
    assert await count_active_campus_leads(db) == 1

    # …and now the survivor is protected again.
    res = await client.patch(
        f"/api/v1/users/{lead_world['ids']['lead_a']}",
        headers=lead_world["headers"]["lead_a"],
        json={"status": "inactive"},
    )
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_recovery_is_super_admin_only_and_audited(client, lead_world):
    db = lead_world["db"]
    lead_a = lead_world["ids"]["lead_a"]

    # A Campus Lead cannot recover (only the platform role may), and neither can faculty.
    for actor in ("lead_a", "faculty"):
        res = await client.post(
            "/api/v1/admin/institution/campus-lead/recover",
            headers=lead_world["headers"][actor],
            json={"target_user_id": str(lead_a)},
        )
        assert res.status_code == 403, f"{actor} -> {res.status_code}: {res.text}"

    # With a lead present, recovery is refused even for the platform admin: it is
    # not a quiet role override.
    res = await client.post(
        "/api/v1/admin/institution/campus-lead/recover",
        headers=lead_world["headers"]["platform"],
        json={"target_user_id": str(lead_a)},
    )
    assert res.status_code == 409, res.text

    # Simulate the lock-out directly (there is no API that can produce it).
    for user_id in await _active_admin_ids(db):
        user = await db.get(User, user_id)
        user.status = "inactive"
    await db.commit()
    assert await count_active_campus_leads(db) == 0

    res = await client.post(
        "/api/v1/admin/institution/campus-lead/recover",
        headers=lead_world["headers"]["platform"],
        json={"target_user_id": str(lead_a)},
    )
    assert res.status_code == 200, res.text
    assert await count_active_campus_leads(db) == 1

    logs = await client.get(
        "/api/v1/admin/audit-logs?action=institution.campus_lead_recover",
        headers=lead_world["headers"]["platform"],
    )
    assert logs.status_code == 200, logs.text
    assert any(
        entry["resource_id"] == str(lead_a) for entry in logs.json()["data"]
    ), "recovery must be audited"


@pytest.mark.asyncio
async def test_campus_lead_listing_requires_leadership(client, lead_world):
    listed = await client.get(
        "/api/v1/admin/institution/campus-leads", headers=lead_world["headers"]["lead_a"]
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["data"]["active_count"] >= 2

    denied = await client.get(
        "/api/v1/admin/institution/campus-leads", headers=lead_world["headers"]["faculty"]
    )
    assert denied.status_code == 403, denied.text


@pytest.mark.asyncio
@pytest.mark.skipif(
    not IS_POSTGRES,
    reason="Advisory-lock concurrency is PostgreSQL-only; SQLite cannot evidence it.",
)
async def test_concurrent_removal_cannot_reach_zero_leads(client, lead_world):
    """Two simultaneous removals of *different* leads must not both win."""
    db = lead_world["db"]
    assert await count_active_campus_leads(db) == 2
    h = lead_world["headers"]
    a, b = lead_world["ids"]["lead_a"], lead_world["ids"]["lead_b"]

    results = await asyncio.gather(
        client.patch(f"/api/v1/users/{a}", headers=h["lead_a"], json={"status": "inactive"}),
        client.patch(f"/api/v1/users/{b}", headers=h["lead_b"], json={"status": "inactive"}),
    )
    statuses = sorted(r.status_code for r in results)
    assert statuses == [200, 409], [r.text for r in results]
    assert await count_active_campus_leads(db) >= 1

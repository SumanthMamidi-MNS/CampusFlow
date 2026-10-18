"""The mandatory Campus Lead invariant.

Every institution must have at least one **active** Campus Lead — the ``admin``
role, which is the institution-wide leadership role (Campus Lead / College
Admin). Losing the last one would lock the institution out of its own
administration, so removal is refused unless another active Campus Lead already
exists.

Why a service and not a check in the router: the invariant is about *institution
state*, not about the request. It must hold for the user API, for a future bulk
operation, and for the seed script, and it must hold under concurrency. Two
invigilators demoting *different* leads at the same moment must not both succeed
and leave zero. On PostgreSQL that is guaranteed by a transaction-level advisory
lock (`pg_advisory_xact_lock`); SQLite serialises writers already, so the lock is
a no-op there.

Recovery (an institution that somehow has zero leads) is deliberately awkward:
it requires the platform ``super_admin`` role, is audited, and refuses when a
lead already exists, so it can never be used as a silent role-override.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import ConflictError, ValidationError
from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.rbac.models import Role, UserRole
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.users.models import User

#: The role that represents institutional leadership. Named ``admin`` in the
#: database (it predates the "Campus Lead" label) and surfaced as
#: "Campus Lead / College Admin" in the product.
CAMPUS_LEAD_ROLE = "admin"

#: Arbitrary but fixed advisory-lock key for the "who runs this institution"
#: critical section. Any 64-bit integer works as long as it is unique here.
_CAMPUS_LEAD_LOCK_KEY = 0x0CA5_1EAD


async def lock_campus_lead_scope(db: AsyncSession) -> None:
    """Serialise every mutation that can remove a Campus Lead.

    Held until the surrounding transaction ends. PostgreSQL only: on SQLite the
    writer lock already serialises the two competing transactions.
    """
    bind = db.get_bind()
    dialect = bind.dialect.name if bind is not None else "sqlite"
    if dialect == "postgresql":
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": _CAMPUS_LEAD_LOCK_KEY}
        )


async def active_campus_lead_ids(db: AsyncSession) -> set[uuid.UUID]:
    """Ids of users who currently hold Campus Lead standing.

    A Campus Lead is only counted while their account is *active* and not
    soft-deleted: a deactivated lead cannot rescue the institution.
    """
    stmt = (
        select(UserRole.user_id)
        .join(Role, Role.id == UserRole.role_id)
        .join(User, User.id == UserRole.user_id)
        .where(
            Role.name == CAMPUS_LEAD_ROLE,
            User.status == "active",
            User.deleted_at.is_(None),
        )
    )
    res = await db.execute(stmt)
    return set(res.scalars().all())


async def count_active_campus_leads(db: AsyncSession) -> int:
    """How many active Campus Leads the institution currently has."""
    stmt = (
        select(func.count(func.distinct(UserRole.user_id)))
        .join(Role, Role.id == UserRole.role_id)
        .join(User, User.id == UserRole.user_id)
        .where(
            Role.name == CAMPUS_LEAD_ROLE,
            User.status == "active",
            User.deleted_at.is_(None),
        )
    )
    res = await db.execute(stmt)
    return int(res.scalar_one() or 0)


async def is_active_campus_lead(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """True when this specific user is currently an active Campus Lead."""
    return user_id in await active_campus_lead_ids(db)


async def guard_campus_lead_removal(
    db: AsyncSession,
    user: User,
    *,
    removing_role: bool,
    deactivating: bool,
    purpose: str,
) -> None:
    """Refuse a mutation that would leave the institution without a Campus Lead.

    Call this **before** mutating, inside the caller's transaction. It is a
    no-op unless this user is an active Campus Lead *and* the mutation would take
    that standing away.
    """
    if not (removing_role or deactivating):
        return
    if not await is_active_campus_lead(db, user.id):
        return

    # Take the critical section before counting: a competing removal must wait
    # until this transaction commits the removal, then observe the reduced count.
    await lock_campus_lead_scope(db)
    remaining = await count_active_campus_leads(db)
    if remaining <= 1:
        raise ConflictError(
            "This is the institution's last active Campus Lead (Campus Lead / College "
            "Admin). Assign another active Campus Lead first, then retry "
            f"({purpose})."
        )


async def recover_campus_lead(
    db: AsyncSession,
    *,
    target_user_id: uuid.UUID,
    actor: User,
) -> User:
    """Re-establish a Campus Lead after a locked-out institution.

    Explicitly exceptional: only the platform ``super_admin`` may call this
    (enforced at the route), it refuses when any active Campus Lead already
    exists, it refuses a soft-deleted target, and it is always audited.
    """
    await lock_campus_lead_scope(db)

    if await count_active_campus_leads(db) > 0:
        raise ConflictError(
            "The institution already has an active Campus Lead; recovery is not required."
        )

    res = await db.execute(select(User).where(User.id == target_user_id))
    target = res.scalar_one_or_none()
    if target is None:
        raise ValidationError("Target user for Campus Lead recovery was not found.")
    if target.deleted_at is not None:
        raise ValidationError("A soft-deleted user cannot be restored as Campus Lead.")
    if target.status != "active":
        # Recovery exists to unblock administration; a pending/inactive account
        # cannot administer anything, so activate it as part of the recovery.
        target.status = "active"
        await db.flush()

    await assign_role_to_user(db, target.id, CAMPUS_LEAD_ROLE)

    await record_audit_event(
        db=db,
        action="institution.campus_lead_recover",
        resource_type="user",
        resource_id=str(target.id),
        user_id=actor.id,
        user_email=actor.email,
        extra_data={
            "recovered_user_email": target.email,
            "reason": "institution had zero active Campus Leads",
        },
    )
    await db.commit()
    await db.refresh(target)
    return target

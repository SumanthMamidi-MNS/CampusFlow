"""Administrative surface for the mandatory Campus Lead role.

Two endpoints, deliberately narrow:

* list the institution's active Campus Leads (for the leadership workspace), and
* the **recovery** endpoint, which only the platform ``super_admin`` may call and
  only while the institution has zero active Campus Leads.

There is no endpoint that demotes or deletes the last Campus Lead; the guard in
``leadership.guard_campus_lead_removal`` (wired into the user service) is the
only thing standing between an institution and administrative lock-out.
"""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_any_role
from campusflow.bedrock.rbac.models import Role, UserRole
from campusflow.domain.institution.leadership import (
    CAMPUS_LEAD_ROLE,
    count_active_campus_leads,
    recover_campus_lead,
)
from campusflow.domain.users.models import User

router = APIRouter(prefix="/admin/institution", tags=["institution"])


class CampusLeadRecoverRequest(BaseModel):
    target_user_id: uuid.UUID


@router.get("/campus-leads")
async def list_campus_leads(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role("super_admin", "admin")),
):
    """Active Campus Leads, so leadership is never a mystery."""
    stmt = (
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(
            Role.name == CAMPUS_LEAD_ROLE,
            User.status == "active",
            User.deleted_at.is_(None),
        )
        .order_by(User.last_name, User.first_name)
    )
    users = (await db.execute(stmt)).scalars().unique().all()
    return success_response(
        {
            "active_count": await count_active_campus_leads(db),
            "campus_leads": [
                {
                    "id": str(u.id),
                    "email": u.email,
                    "full_name": f"{u.first_name} {u.last_name}".strip(),
                    "status": u.status,
                }
                for u in users
            ],
        }
    )


@router.post("/campus-lead/recover")
async def recover_campus_lead_endpoint(
    payload: CampusLeadRecoverRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_role("super_admin")),
):
    """Re-establish a Campus Lead for an institution that has none.

    Refuses (409) when an active Campus Lead already exists, so this can never
    behave as a quiet role override. Always audited.
    """
    user = await recover_campus_lead(
        db, target_user_id=payload.target_user_id, actor=current_user
    )
    return success_response(
        {
            "user_id": str(user.id),
            "email": user.email,
            "message": "Campus Lead recovered. The institution can be administered again.",
        }
    )

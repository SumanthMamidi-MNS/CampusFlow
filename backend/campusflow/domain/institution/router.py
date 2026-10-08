from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user, get_current_user
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.institution.schemas import InstitutionResponse, InstitutionUpdate
from campusflow.domain.institution.service import (
    get_or_create_default_institution,
    update_institution,
)
from campusflow.domain.users.models import User

router = APIRouter(prefix="/institution", tags=["institution"])


@router.get("")
async def get_institution_details(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Retrieve institution metadata, branding, and system policies."""
    institution = await get_or_create_default_institution(db)
    return success_response(data=InstitutionResponse.model_validate(institution).model_dump(mode="json"))


@router.put(
    "",
    dependencies=[Depends(require_permission("system:settings"))],
)
async def update_institution_details(
    payload: InstitutionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update institution metadata, branding, and system policies."""
    updated = await update_institution(db, payload, actor_id=current_user.id)
    return success_response(data=InstitutionResponse.model_validate(updated).model_dump(mode="json"))

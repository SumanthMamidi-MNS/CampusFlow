import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.announcements.schemas import (
    AnnouncementCreate,
    AnnouncementResponse,
)
from campusflow.domain.announcements.service import (
    create_announcement,
    delete_announcement,
    list_announcements,
)
from campusflow.domain.users.models import User

router = APIRouter(tags=["announcements"])


@router.get("/course-offerings/{offering_id}/announcements")
async def get_announcements_endpoint(
    offering_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    items = await list_announcements(db, offering_id)
    return success_response([i.model_dump(mode="json") for i in items])


@router.post("/course-offerings/{offering_id}/announcements")
async def create_announcement_endpoint(
    offering_id: uuid.UUID,
    payload: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("courses:update")),
):
    ann = await create_announcement(db, offering_id, current_user.id, payload)
    return success_response(AnnouncementResponse.model_validate(ann).model_dump(mode="json"))


@router.delete("/announcements/{announcement_id}")
async def delete_announcement_endpoint(
    announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("courses:update")),
):
    await delete_announcement(db, announcement_id)
    return success_response({"message": "Announcement deleted successfully."})

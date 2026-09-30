import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.db.session import get_db
from campusflow.domain.notifications.schemas import NotificationResponse
from campusflow.domain.notifications.service import (
    list_user_notifications,
    mark_all_notifications_as_read,
)
from campusflow.domain.notifications.service import (
    mark_notification_as_read as mark_as_read,
)
from campusflow.domain.users.models import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def get_notifications_endpoint(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    items, unread_count = await list_user_notifications(
        db=db,
        user_id=current_user.id,
        limit=limit,
        offset=offset,
        unread_only=unread_only,
    )
    serialized = [NotificationResponse.model_validate(n).model_dump(mode="json") for n in items]
    return success_response({"items": serialized, "unread_count": unread_count})


@router.patch("/{notification_id}/read")
async def mark_read_endpoint(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    notification = await mark_as_read(db, notification_id=notification_id, user_id=current_user.id)
    if not notification:
        return success_response(None)
    return success_response(
        NotificationResponse.model_validate(notification).model_dump(mode="json")
    )


@router.post("/read-all")
async def mark_all_read_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    count = await mark_all_notifications_as_read(db, user_id=current_user.id)
    return success_response({"marked_read_count": count})

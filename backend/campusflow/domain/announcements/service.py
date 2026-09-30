import uuid

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import NotFoundError
from campusflow.domain.announcements.models import Announcement
from campusflow.domain.announcements.schemas import (
    AnnouncementCreate,
    AnnouncementResponse,
)
from campusflow.domain.users.models import User


async def create_announcement(
    db: AsyncSession,
    offering_id: uuid.UUID,
    author_id: uuid.UUID,
    payload: AnnouncementCreate,
) -> Announcement:
    announcement = Announcement(
        course_offering_id=offering_id,
        author_id=author_id,
        title=payload.title,
        body=payload.body,
        is_pinned=payload.is_pinned,
    )
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)
    return announcement


async def list_announcements(
    db: AsyncSession, offering_id: uuid.UUID
) -> list[AnnouncementResponse]:
    stmt = (
        select(Announcement, User)
        .join(User, User.id == Announcement.author_id)
        .where(Announcement.course_offering_id == offering_id)
        .order_by(desc(Announcement.is_pinned), desc(Announcement.published_at))
    )
    res = await db.execute(stmt)
    rows = res.all()

    return [
        AnnouncementResponse(
            id=ann.id,
            course_offering_id=ann.course_offering_id,
            author_id=ann.author_id,
            author_name=f"{u.first_name} {u.last_name}",
            title=ann.title,
            body=ann.body,
            is_pinned=ann.is_pinned,
            published_at=ann.published_at,
            created_at=ann.created_at,
        )
        for ann, u in rows
    ]


async def delete_announcement(db: AsyncSession, announcement_id: uuid.UUID) -> None:
    res = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = res.scalar_one_or_none()
    if not ann:
        raise NotFoundError("Announcement not found.")
    await db.delete(ann)
    await db.commit()

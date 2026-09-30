import uuid

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.domain.notifications.models import Notification


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    title: str,
    message: str,
    notification_type: str = "general",
    link: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        link=link,
        is_read=False,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


async def create_notifications_bulk(
    db: AsyncSession,
    user_ids: list[uuid.UUID],
    title: str,
    message: str,
    notification_type: str = "general",
    link: str | None = None,
) -> None:
    if not user_ids:
        return
    notifications = [
        Notification(
            user_id=uid,
            title=title,
            message=message,
            notification_type=notification_type,
            link=link,
            is_read=False,
        )
        for uid in user_ids
    ]
    db.add_all(notifications)
    await db.commit()


async def list_user_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False,
) -> tuple[list[Notification], int]:
    query = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        query = query.where(Notification.is_read.is_(False))
    query = query.order_by(desc(Notification.created_at)).offset(offset).limit(limit)

    results = await db.execute(query)
    items = list(results.scalars().all())

    # Count total unread
    count_query = (
        select(func.count(Notification.id))
        .where(Notification.user_id == user_id)
        .where(Notification.is_read.is_(False))
    )
    count_res = await db.execute(count_query)
    unread_count = count_res.scalar_one_or_none() or 0

    return items, unread_count


async def mark_notification_as_read(
    db: AsyncSession, notification_id: uuid.UUID, user_id: uuid.UUID
) -> Notification | None:
    query = select(Notification).where(
        Notification.id == notification_id, Notification.user_id == user_id
    )
    res = await db.execute(query)
    notification = res.scalar_one_or_none()
    if not notification:
        return None
    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification


async def mark_all_notifications_as_read(db: AsyncSession, user_id: uuid.UUID) -> int:
    query = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    res = await db.execute(query)
    await db.commit()
    return res.rowcount

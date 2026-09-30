import uuid

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.mail.service import get_mailer
from campusflow.domain.notifications.models import Notification, NotificationPreference
from campusflow.domain.notifications.schemas import NotificationPreferenceUpdate
from campusflow.domain.users.models import User


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


async def get_or_create_user_preferences(
    db: AsyncSession, user_id: uuid.UUID
) -> NotificationPreference:
    query = select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    res = await db.execute(query)
    pref = res.scalar_one_or_none()
    if not pref:
        pref = NotificationPreference(
            user_id=user_id,
            email_assignments=True,
            email_grades=True,
            email_exams=True,
            email_announcements=True,
            in_app_assignments=True,
            in_app_grades=True,
            in_app_exams=True,
            in_app_announcements=True,
        )
        db.add(pref)
        await db.commit()
        await db.refresh(pref)
    return pref


async def update_user_preferences(
    db: AsyncSession, user_id: uuid.UUID, payload: NotificationPreferenceUpdate
) -> NotificationPreference:
    pref = await get_or_create_user_preferences(db, user_id)
    data = payload.model_dump(exclude_unset=True)
    for field, val in data.items():
        if val is not None:
            setattr(pref, field, val)
    await db.commit()
    await db.refresh(pref)
    return pref


async def send_notification_email_if_enabled(
    db: AsyncSession,
    user_id: uuid.UUID,
    category: str,  # 'assignments', 'grades', 'exams', 'announcements'
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> bool:
    pref = await get_or_create_user_preferences(db, user_id)
    attr_name = f"email_{category}"
    if not getattr(pref, attr_name, True):
        return False

    user_query = select(User).where(User.id == user_id)
    res = await db.execute(user_query)
    user = res.scalar_one_or_none()
    if not user or not user.email:
        return False

    mailer = get_mailer()
    try:
        return await mailer.send_email(
            to_email=user.email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )
    except Exception:
        return False


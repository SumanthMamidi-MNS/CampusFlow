import uuid
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.audit.models import AuditLog


async def record_audit_event(
    db: AsyncSession,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    user_id: uuid.UUID | None = None,
    user_email: str | None = None,
    ip_address: str | None = None,
    request_id: str | None = None,
    changes: dict[str, Any] | None = None,
    extra_data: dict[str, Any] | None = None,
) -> AuditLog:
    """Record an append-only audit trail event."""
    log_entry = AuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user_id,
        user_email=user_email,
        ip_address=ip_address,
        request_id=request_id,
        changes=changes,
        extra_data=extra_data,
    )
    db.add(log_entry)
    await db.flush()
    return log_entry


async def list_audit_logs(
    db: AsyncSession,
    action: str | None = None,
    resource_type: str | None = None,
    user_email: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[AuditLog], int]:
    """Query audit logs with filtering and pagination."""
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
        count_query = count_query.where(AuditLog.resource_type == resource_type)
    if user_email:
        query = query.where(AuditLog.user_email.ilike(f"%{user_email}%"))
        count_query = count_query.where(AuditLog.user_email.ilike(f"%{user_email}%"))

    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    query = query.order_by(desc(AuditLog.timestamp)).offset((page - 1) * page_size).limit(page_size)
    items_res = await db.execute(query)
    items = list(items_res.scalars().all())

    return items, total

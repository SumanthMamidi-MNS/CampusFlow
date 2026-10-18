import uuid
from datetime import date, datetime, time
from enum import Enum
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.audit.models import AuditLog


def json_safe(value: Any) -> Any:
    """Coerce a value into something a JSON column can actually store.

    Callers hand the audit trail whatever changed — often ORM values such as
    ``datetime`` windows, UUID identifiers, or enums. JSON has no encoding for
    those, and a serialisation failure aborts the *whole* request, so the trail
    (the thing that must never break) is normalised here, once, rather than
    being left to every call site to remember.
    """
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Enum):
        return json_safe(value.value)
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [json_safe(item) for item in value]
    return str(value)


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
    """Record an append-only audit trail event.

    ``changes`` and ``extra_data`` are normalised to JSON-safe primitives, so a
    caller that forgets to convert a ``datetime`` or a ``UUID`` degrades the
    detail of one audit row instead of failing the request it was describing.
    """
    log_entry = AuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user_id,
        user_email=user_email,
        ip_address=ip_address,
        request_id=request_id,
        changes=json_safe(changes) if changes is not None else None,
        extra_data=json_safe(extra_data) if extra_data is not None else None,
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

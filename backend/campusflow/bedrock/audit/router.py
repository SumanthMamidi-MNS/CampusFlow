from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import paginated_response
from campusflow.bedrock.audit.service import list_audit_logs
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.users.models import User

router = APIRouter(prefix="/admin/audit-logs", tags=["audit"])


@router.get("")
async def get_audit_logs_list(
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    user_email: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(require_permission("audit:read")),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_audit_logs(
        db,
        action=action,
        resource_type=resource_type,
        user_email=user_email,
        page=page,
        page_size=page_size,
    )
    data = [
        {
            "id": str(log.id),
            "timestamp": log.timestamp.isoformat(),
            "user_id": str(log.user_id) if log.user_id else None,
            "user_email": log.user_email,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "ip_address": log.ip_address,
            "request_id": log.request_id,
            "changes": log.changes,
            "extra_data": log.extra_data,
        }
        for log in items
    ]
    return paginated_response(data=data, total=total, page=page, page_size=page_size)

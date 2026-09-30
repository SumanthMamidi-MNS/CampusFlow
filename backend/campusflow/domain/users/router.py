import uuid

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import paginated_response, success_response
from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.users.models import User
from campusflow.domain.users.schemas import UserCreate, UserResponse, UserUpdate
from campusflow.domain.users.service import (
    bulk_import_users,
    create_user,
    delete_user,
    get_user_by_id,
    list_users,
    update_user,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def get_users_list(
    search: str | None = Query(None),
    status: str | None = Query(None),
    role: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_permission("users:read")),
    db: AsyncSession = Depends(get_db),
):
    users, total = await list_users(
        db, search=search, status=status, role=role, page=page, page_size=page_size
    )
    return paginated_response(
        data=[u.model_dump(mode="json") for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("")
async def create_new_user(
    payload: UserCreate,
    request: Request,
    current_user: User = Depends(require_permission("users:create")),
    db: AsyncSession = Depends(get_db),
):
    user = await create_user(db, payload)
    from campusflow.bedrock.rbac.service import get_user_roles

    roles = await get_user_roles(db, user.id)
    user_res = UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        status=user.status,
        roles=roles,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )

    await record_audit_event(
        db,
        action="user.create",
        resource_type="user",
        resource_id=str(user.id),
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
        changes={"email": user.email, "roles": roles},
    )

    return success_response(user_res.model_dump(mode="json"))


@router.get("/{user_id}")
async def get_user_detail(
    user_id: uuid.UUID,
    current_user: User = Depends(require_permission("users:read")),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_id(db, user_id)
    from campusflow.bedrock.rbac.service import get_user_roles

    roles = await get_user_roles(db, user.id)
    user_res = UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        status=user.status,
        roles=roles,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )
    return success_response(user_res.model_dump(mode="json"))


@router.patch("/{user_id}")
async def update_user_detail(
    user_id: uuid.UUID,
    payload: UserUpdate,
    request: Request,
    current_user: User = Depends(require_permission("users:update")),
    db: AsyncSession = Depends(get_db),
):
    user = await update_user(db, user_id, payload)
    from campusflow.bedrock.rbac.service import get_user_roles

    roles = await get_user_roles(db, user.id)
    user_res = UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        status=user.status,
        roles=roles,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )

    await record_audit_event(
        db,
        action="user.update",
        resource_type="user",
        resource_id=str(user.id),
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
        changes=payload.model_dump(exclude_unset=True, exclude={"password"}),
    )

    return success_response(user_res.model_dump(mode="json"))


@router.delete("/{user_id}")
async def delete_existing_user(
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("users:delete")),
    db: AsyncSession = Depends(get_db),
):
    await delete_user(db, user_id)
    await record_audit_event(
        db,
        action="user.delete",
        resource_type="user",
        resource_id=str(user_id),
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )
    return success_response({"message": "User deactivated successfully."})


@router.post("/bulk-import")
async def bulk_import_users_endpoint(
    file: UploadFile = File(...),
    request: Request = None,
    current_user: User = Depends(require_permission("users:bulk_import")),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    csv_text = content.decode("utf-8-sig", errors="ignore")
    result = await bulk_import_users(db, csv_text)

    await record_audit_event(
        db,
        action="user.bulk_import",
        resource_type="user",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=request.client.host if request and request.client else None,
        request_id=getattr(request.state, "request_id", None) if request else None,
        changes={"imported": result["created_count"], "skipped": result["skipped_count"]},
    )

    return success_response(result)

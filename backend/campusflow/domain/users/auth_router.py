from fastapi import APIRouter, Cookie, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import AuthenticationError
from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.auth.jwt import create_access_token, decode_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.auth.service import (
    authenticate_user,
    create_refresh_token_record,
    request_password_reset,
    revoke_refresh_token,
    rotate_refresh_token,
)
from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.service import get_user_permissions, get_user_roles
from campusflow.domain.users.models import User
from campusflow.domain.users.schemas import (
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    user = await authenticate_user(db, payload.email, payload.password)

    # Generate tokens
    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    refresh_token = await create_refresh_token_record(db, user_id=user.id)

    # Set httpOnly cookie for refresh token
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
    )

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
        action="auth.login",
        resource_type="user",
        resource_id=str(user.id),
        user_id=user.id,
        user_email=user.email,
        ip_address=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )

    return success_response(
        {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.access_token_expire_minutes * 60,
            "user": user_res.model_dump(mode="json"),
        }
    )


@router.post("/refresh")
async def refresh_tokens(
    response: Response,
    refresh_token: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if not refresh_token:
        raise AuthenticationError("Refresh token missing from request.")

    access_token, new_refresh_token, user = await rotate_refresh_token(db, refresh_token)
    settings = get_settings()

    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
    )

    return success_response(
        {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.access_token_expire_minutes * 60,
        }
    )


@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if refresh_token:
        await revoke_refresh_token(db, refresh_token)

    response.delete_cookie(key="refresh_token")
    return success_response({"message": "Successfully logged out."})


@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    roles = await get_user_roles(db, current_user.id)
    permissions = await get_user_permissions(db, current_user.id)

    user_res = UserResponse(
        id=current_user.id,
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        phone=current_user.phone,
        status=current_user.status,
        roles=roles,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
    )

    data = user_res.model_dump(mode="json")
    data["permissions"] = list(permissions)
    return success_response(data)


@router.post("/password/reset-request")
async def password_reset_request(
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    await request_password_reset(db, payload.email)
    return success_response(
        {"message": "If an account exists with this email, a reset link has been dispatched."}
    )


@router.post("/password/reset")
async def password_reset_confirm(
    payload: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    token_payload = decode_access_token(payload.token)
    if token_payload.get("scope") != "password_reset":
        raise AuthenticationError("Invalid reset token scope.")

    import uuid

    from campusflow.domain.users.service import get_user_by_id

    user_id = uuid.UUID(token_payload["sub"])
    user = await get_user_by_id(db, user_id)
    user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()

    return success_response({"message": "Password successfully updated. You may now log in."})

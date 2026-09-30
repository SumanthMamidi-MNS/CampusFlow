import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import AuthenticationError, AuthorizationError
from campusflow.bedrock.auth.jwt import decode_access_token
from campusflow.bedrock.db.session import get_db

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve and validate the authenticated user from the Bearer token."""
    if not credentials:
        raise AuthenticationError("Authentication required: missing Bearer token.")

    token = credentials.credentials
    payload = decode_access_token(token)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise AuthenticationError("Invalid token payload: missing subject identifier.")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError as exc:
        raise AuthenticationError("Invalid token subject format.") from exc

    # Query user
    from campusflow.domain.users.models import User

    stmt = select(User).where(User.id == user_id, User.deleted_at.is_(None))
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise AuthenticationError("Authenticated user not found or has been removed.")

    return user


async def get_current_active_user(
    current_user=Depends(get_current_user),
):
    """Ensure the authenticated user account is active."""
    if current_user.status != "active":
        raise AuthorizationError(
            f"Account is {current_user.status}. Contact college administration."
        )
    return current_user

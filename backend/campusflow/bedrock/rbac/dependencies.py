from collections.abc import Callable

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import AuthorizationError
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.service import check_user_has_permission, get_user_roles


# Note: We import get_current_active_user lazily or pass it in as dependency
def get_current_user_dependency():
    from campusflow.bedrock.auth.dependencies import get_current_active_user

    return get_current_active_user


def require_role(role_name: str) -> Callable:
    """Dependency factory that requires the authenticated user to possess a specific role."""
    from campusflow.bedrock.auth.dependencies import get_current_active_user

    async def role_checker(
        current_user=Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db),
    ):
        roles = await get_user_roles(db, current_user.id)
        if "super_admin" in roles:
            return current_user  # Super admin bypasses specific role check
        if role_name not in roles:
            raise AuthorizationError(f"Access forbidden: requires '{role_name}' role.")
        return current_user

    return role_checker


def require_permission(permission_code: str) -> Callable:
    """Dependency factory that requires the authenticated user to possess a specific permission."""
    from campusflow.bedrock.auth.dependencies import get_current_active_user

    async def permission_checker(
        current_user=Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db),
    ):
        roles = await get_user_roles(db, current_user.id)
        if "super_admin" in roles:
            return current_user  # Super admin bypasses all permission checks

        has_perm = await check_user_has_permission(db, current_user.id, permission_code)
        if not has_perm:
            raise AuthorizationError(
                f"Access forbidden: missing required permission '{permission_code}'."
            )
        return current_user

    return permission_checker

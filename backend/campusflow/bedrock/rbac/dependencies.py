from collections.abc import Callable

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import AuthorizationError
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.service import (
    check_user_has_permission,
    get_user_permissions,
    get_user_roles,
)


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


def require_any_role(*role_names: str) -> Callable:
    """Dependency factory requiring the user to hold at least one named role.

    Used for leadership-only surfaces (institutional reporting) that should not
    be reachable by every holder of a broad permission such as ``analytics:view``.
    """
    from campusflow.bedrock.auth.dependencies import get_current_active_user

    allowed = frozenset(role_names)

    async def any_role_checker(
        current_user=Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db),
    ):
        roles = await get_user_roles(db, current_user.id)
        if "super_admin" in roles:
            return current_user  # Super admin bypasses specific role checks
        if allowed & set(roles):
            return current_user
        readable = ", ".join(f"'{name}'" for name in role_names)
        raise AuthorizationError(f"Access forbidden: requires one of {readable} roles.")

    return any_role_checker


def require_any_permission(*permission_codes: str) -> Callable:
    """Dependency factory requiring the user to hold at least one of the codes.

    Useful for staff-only resources reachable through more than one capability
    (for example an exam definition readable by authors, graders or proctors)
    where no single permission describes the whole audience.
    """
    from campusflow.bedrock.auth.dependencies import get_current_active_user

    codes = tuple(permission_codes)

    async def any_permission_checker(
        current_user=Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db),
    ):
        roles = await get_user_roles(db, current_user.id)
        if "super_admin" in roles:
            return current_user  # Super admin bypasses all permission checks

        perms = await get_user_permissions(db, current_user.id)
        if not (perms & set(codes)):
            readable = ", ".join(f"'{code}'" for code in codes)
            raise AuthorizationError(
                f"Access forbidden: requires one of {readable}."
            )
        return current_user

    return any_permission_checker


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

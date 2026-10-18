import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from campusflow.bedrock.rbac.models import Permission, Role, UserRole, role_permissions

DEFAULT_PERMISSIONS = [
    # User management
    {"code": "users:create", "description": "Create users", "module": "users"},
    {"code": "users:read", "description": "View user profiles", "module": "users"},
    {"code": "users:update", "description": "Update user profiles", "module": "users"},
    {"code": "users:delete", "description": "Deactivate users", "module": "users"},
    {"code": "users:bulk_import", "description": "Bulk import users via CSV", "module": "users"},
    # Academic & Courses
    {
        "code": "departments:manage",
        "description": "Manage departments and programs",
        "module": "departments",
    },
    {"code": "courses:create", "description": "Create courses and offerings", "module": "courses"},
    {"code": "courses:read", "description": "View courses", "module": "courses"},
    {"code": "courses:update", "description": "Update course content", "module": "courses"},
    {
        "code": "enrollments:manage",
        "description": "Manage student course enrollments",
        "module": "enrollments",
    },
    {
        "code": "roster:import",
        "description": "Import section rosters from a spreadsheet",
        "module": "enrollments",
    },
    # Materials & Assignments
    {
        "code": "materials:manage",
        "description": "Upload and manage course materials",
        "module": "materials",
    },
    {
        "code": "materials:read",
        "description": "View and download learning materials",
        "module": "materials",
    },
    {
        "code": "assignments:create",
        "description": "Create course assignments",
        "module": "assignments",
    },
    {"code": "assignments:submit", "description": "Submit assignments", "module": "assignments"},
    {
        "code": "assignments:grade",
        "description": "Grade student submissions",
        "module": "assignments",
    },
    # Programming environment
    {
        "code": "programming:manage",
        "description": "Author programming problems, test cases, and review submissions",
        "module": "programming",
    },
    {
        "code": "programming:submit",
        "description": "Run and submit code for programming problems",
        "module": "programming",
    },
    # Question Banks & Exams
    {
        "code": "questions:manage",
        "description": "Manage question banks and questions",
        "module": "question_banks",
    },
    {"code": "exams:create", "description": "Create and schedule examinations", "module": "exams"},
    {"code": "exams:take", "description": "Take scheduled examinations", "module": "exams"},
    {
        "code": "exams:grade",
        "description": "Grade examinations and publish results",
        "module": "exams",
    },
    {
        "code": "exams:proctor_view",
        "description": "Inspect proctoring violation logs",
        "module": "exams",
    },
    # System & Audit
    {
        "code": "system:settings",
        "description": "Manage system branding and policies",
        "module": "system",
    },
    {"code": "audit:read", "description": "Read audit logs", "module": "audit"},
    {"code": "analytics:view", "description": "View analytical reports", "module": "analytics"},
]

ROLE_PERMISSION_MAPPINGS = {
    "super_admin": [p["code"] for p in DEFAULT_PERMISSIONS],
    "admin": [
        "users:create",
        "users:read",
        "users:update",
        "users:delete",
        "users:bulk_import",
        "departments:manage",
        "courses:create",
        "courses:read",
        "courses:update",
        "enrollments:manage",
        "roster:import",
        "materials:manage",
        "materials:read",
        "assignments:create",
        "assignments:grade",
        "programming:manage",
        "programming:submit",
        "questions:manage",
        "exams:create",
        "exams:grade",
        "exams:proctor_view",
        "system:settings",
        "audit:read",
        "analytics:view",
    ],
    "department_head": [
        "users:read",
        "departments:manage",
        "courses:create",
        "courses:read",
        "courses:update",
        "enrollments:manage",
        "roster:import",
        "materials:manage",
        "materials:read",
        "programming:manage",
        "programming:submit",
        "questions:manage",
        "exams:create",
        "exams:grade",
        "exams:proctor_view",
        "analytics:view",
    ],
    "exam_controller": [
        "users:read",
        "courses:read",
        "questions:manage",
        "exams:create",
        "exams:grade",
        "exams:proctor_view",
        "analytics:view",
    ],
    "faculty": [
        "users:read",
        "courses:read",
        "courses:update",
        "roster:import",
        "materials:manage",
        "materials:read",
        "assignments:create",
        "assignments:grade",
        "programming:manage",
        "programming:submit",
        "questions:manage",
        "exams:create",
        "exams:grade",
        "exams:proctor_view",
        "analytics:view",
    ],
    "student": [
        "courses:read",
        "materials:read",
        "assignments:submit",
        "exams:take",
        "programming:submit",
    ],
}


async def seed_roles_and_permissions(db: AsyncSession) -> None:
    """Ensure all default permissions and roles exist in the database."""
    # 1. Seed Permissions
    existing_perms_res = await db.execute(select(Permission))
    existing_perms = {p.code: p for p in existing_perms_res.scalars().all()}

    for perm_data in DEFAULT_PERMISSIONS:
        if perm_data["code"] not in existing_perms:
            new_perm = Permission(
                code=perm_data["code"],
                description=perm_data["description"],
                module=perm_data["module"],
            )
            db.add(new_perm)
            existing_perms[perm_data["code"]] = new_perm

    await db.flush()

    # 2. Seed Roles and map permissions
    for role_name, perm_codes in ROLE_PERMISSION_MAPPINGS.items():
        role_res = await db.execute(
            select(Role).options(selectinload(Role.permissions)).where(Role.name == role_name)
        )
        role = role_res.scalar_one_or_none()
        target_perms = [existing_perms[code] for code in perm_codes if code in existing_perms]
        if not role:
            role = Role(
                name=role_name,
                description=f"Standard {role_name.replace('_', ' ').title()} role",
                is_system=True,
            )
            role.permissions = target_perms
            db.add(role)
        else:
            role.permissions = target_perms

    await db.commit()


async def get_user_roles(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """Return all role names assigned to a user."""
    stmt = (
        select(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def get_user_permissions(db: AsyncSession, user_id: uuid.UUID) -> set[str]:
    """Return all permission codes granted to a user across all assigned roles."""
    stmt = (
        select(Permission.code)
        .join(role_permissions, role_permissions.c.permission_id == Permission.id)
        .join(Role, Role.id == role_permissions.c.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    res = await db.execute(stmt)
    return set(res.scalars().all())


async def check_user_has_permission(
    db: AsyncSession,
    user_id: uuid.UUID,
    permission_code: str,
) -> bool:
    """Check if the user holds a specific permission code."""
    perms = await get_user_permissions(db, user_id)
    return permission_code in perms


async def assign_role_to_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    role_name: str,
    scope_type: str = "institution",
    scope_id: uuid.UUID | None = None,
) -> UserRole:
    """Assign a named role to a user."""
    role_res = await db.execute(select(Role).where(Role.name == role_name))
    role = role_res.scalar_one_or_none()
    if not role:
        raise ValueError(f"Role '{role_name}' does not exist.")

    # Check if already assigned
    existing_res = await db.execute(
        select(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.role_id == role.id,
            UserRole.scope_type == scope_type,
            UserRole.scope_id == scope_id,
        )
    )
    existing = existing_res.scalar_one_or_none()
    if existing:
        return existing

    user_role = UserRole(
        user_id=user_id,
        role_id=role.id,
        scope_type=scope_type,
        scope_id=scope_id,
    )
    db.add(user_role)
    await db.commit()
    return user_role

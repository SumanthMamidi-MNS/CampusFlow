import csv
import io
import uuid
from datetime import UTC

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import ConflictError, NotFoundError
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.models import Role, UserRole
from campusflow.bedrock.rbac.service import assign_role_to_user, get_user_roles
from campusflow.domain.institution.leadership import (
    CAMPUS_LEAD_ROLE,
    guard_campus_lead_removal,
)
from campusflow.domain.users.models import User
from campusflow.domain.users.schemas import UserCreate, UserResponse, UserUpdate


def normalize_registration_number(value: str | None) -> str | None:
    """Canonical student identifier: trimmed, internal whitespace collapsed, uppercased.

    The registration number is a business key, so it must be compared and stored
    in exactly one shape (``cse/2026/0142`` and `` CSE 2026 0142 `` are the same
    student). Empty strings become ``None`` so "no number" is never a value that
    collides with a real one.
    """
    if value is None:
        return None
    normalized = " ".join(value.split()).upper()
    return normalized or None


async def create_user(db: AsyncSession, payload: UserCreate) -> User:
    """Create a new user with hashed credentials and assigned roles."""
    # Check duplicate email
    existing_res = await db.execute(
        select(User).where(User.email == payload.email.lower(), User.deleted_at.is_(None))
    )
    if existing_res.scalar_one_or_none():
        raise ConflictError(f"A user with email '{payload.email}' already exists.")

    registration_number = normalize_registration_number(payload.registration_number)
    if registration_number is not None:
        clash_res = await db.execute(
            select(User).where(
                User.registration_number == registration_number,
                User.deleted_at.is_(None),
            )
        )
        if clash_res.scalar_one_or_none():
            raise ConflictError(
                f"A user with registration number '{registration_number}' already exists."
            )

    user = User(
        email=payload.email.lower(),
        hashed_password=get_password_hash(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        status=payload.status,
        registration_number=registration_number,
        admission_year=payload.admission_year,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        # Two concurrent requests can both pass the pre-check above; the unique
        # constraint on email/registration_number is the real authority, and its
        # refusal is a 409, not an unhandled 500.
        await db.rollback()
        raise ConflictError(
            "A user with this email or registration number already exists."
        ) from exc

    # Assign roles
    for role_name in payload.roles:
        await assign_role_to_user(db, user.id, role_name)

    await db.commit()
    await db.refresh(user)
    return user


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User:
    """Retrieve user by UUID."""
    res = await db.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))
    user = res.scalar_one_or_none()
    if not user:
        raise NotFoundError("User not found.")
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Retrieve user by email."""
    res = await db.execute(
        select(User).where(User.email == email.lower(), User.deleted_at.is_(None))
    )
    return res.scalar_one_or_none()


async def list_users(
    db: AsyncSession,
    search: str | None = None,
    status: str | None = None,
    role: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[UserResponse], int]:
    """List users with filtering, searching, and pagination."""
    query = select(User).where(User.deleted_at.is_(None))
    count_query = select(func.count(User.id)).where(User.deleted_at.is_(None))

    if search:
        search_term = f"%{search}%"
        query = query.where(
            (User.first_name.ilike(search_term))
            | (User.last_name.ilike(search_term))
            | (User.email.ilike(search_term))
        )
        count_query = count_query.where(
            (User.first_name.ilike(search_term))
            | (User.last_name.ilike(search_term))
            | (User.email.ilike(search_term))
        )

    if status:
        query = query.where(User.status == status)
        count_query = count_query.where(User.status == status)

    if role:
        query = (
            query.join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.name == role)
        )
        count_query = (
            count_query.join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.name == role)
        )

    total_res = await db.execute(count_query)
    total = total_res.scalar_one()

    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    users_res = await db.execute(query)
    users = users_res.scalars().all()

    # Build response schemas with resolved roles
    results: list[UserResponse] = []
    for u in users:
        roles = await get_user_roles(db, u.id)
        results.append(
            UserResponse(
                id=u.id,
                email=u.email,
                first_name=u.first_name,
                last_name=u.last_name,
                phone=u.phone,
                status=u.status,
                registration_number=u.registration_number,
                admission_year=u.admission_year,
                roles=roles,
                created_at=u.created_at,
                updated_at=u.updated_at,
            )
        )

    return results, total


async def update_user(db: AsyncSession, user_id: uuid.UUID, payload: UserUpdate) -> User:
    """Update user attributes, password, or roles."""
    user = await get_user_by_id(db, user_id)

    # The Campus Lead guard runs BEFORE any field is mutated. It asks "is this
    # user an active Campus Lead right now?", and a status/role change applied
    # first would both answer that question wrongly and be flushed by the
    # guard's own query. Order matters here, not just logic.
    current_roles = set(await get_user_roles(db, user.id))
    was_campus_lead = CAMPUS_LEAD_ROLE in current_roles
    removing_role = (
        was_campus_lead
        and payload.roles is not None
        and CAMPUS_LEAD_ROLE not in payload.roles
    )
    deactivating = (
        was_campus_lead and payload.status is not None and payload.status != "active"
    )
    await guard_campus_lead_removal(
        db,
        user,
        removing_role=removing_role,
        deactivating=deactivating,
        purpose="demote or deactivate the last Campus Lead",
    )

    if payload.first_name is not None:
        user.first_name = payload.first_name
    if payload.last_name is not None:
        user.last_name = payload.last_name
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.status is not None:
        user.status = payload.status
    if payload.password is not None:
        user.hashed_password = get_password_hash(payload.password)

    if payload.registration_number is not None:
        user.registration_number = normalize_registration_number(payload.registration_number)
    if payload.admission_year is not None:
        user.admission_year = payload.admission_year

    if payload.roles is not None:
        # Clear existing and re-assign
        # Remove old roles
        for ur in list(user.user_roles):
            await db.delete(ur)
        await db.flush()

        for role_name in payload.roles:
            await assign_role_to_user(db, user.id, role_name)

    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Soft-delete a user.

    Deleting the institution's last active Campus Lead is refused, exactly as
    demotion is: a soft delete deactivates the account and would leave nobody
    able to administer the institution.
    """
    user = await get_user_by_id(db, user_id)
    from datetime import datetime

    current_roles = set(await get_user_roles(db, user.id))
    await guard_campus_lead_removal(
        db,
        user,
        removing_role=CAMPUS_LEAD_ROLE in current_roles,
        deactivating=True,
        purpose="delete the last Campus Lead",
    )

    user.deleted_at = datetime.now(UTC)
    user.status = "inactive"
    await db.commit()


async def bulk_import_users(
    db: AsyncSession, csv_content: str, default_password: str = "CampusFlow@2026"
) -> dict:
    """Parse CSV text and create users in batch."""
    reader = csv.DictReader(io.StringIO(csv_content))
    created = 0
    skipped = 0
    errors = []

    for idx, row in enumerate(reader, start=1):
        email = row.get("email", "").strip().lower()
        first_name = row.get("first_name", "").strip()
        last_name = row.get("last_name", "").strip()
        phone = row.get("phone", "").strip() or None
        roles_str = row.get("roles", "student").strip()
        roles = [r.strip() for r in roles_str.split(",") if r.strip()]

        if not email or not first_name or not last_name:
            errors.append({"row": idx, "email": email, "error": "Missing required fields"})
            skipped += 1
            continue

        # Check existing
        existing = await get_user_by_email(db, email)
        if existing:
            skipped += 1
            errors.append({"row": idx, "email": email, "error": "Email already exists"})
            continue

        try:
            pwd = row.get("password", "").strip() or default_password
            user_create = UserCreate(
                email=email,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                password=pwd,
                roles=roles,
                status="active",
            )
            await create_user(db, user_create)
            created += 1
        except Exception as e:
            errors.append({"row": idx, "email": email, "error": str(e)})
            skipped += 1

    return {
        "total_processed": created + skipped,
        "created_count": created,
        "skipped_count": skipped,
        "errors": errors,
    }

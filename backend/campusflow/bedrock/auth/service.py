import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import AuthenticationError
from campusflow.bedrock.auth.jwt import create_access_token, generate_secure_token, hash_token
from campusflow.bedrock.auth.models import RefreshToken
from campusflow.bedrock.auth.pwd import verify_password
from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.mail.service import get_mailer
from campusflow.domain.users.models import User


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    """Validate credentials and return active user, or raise AuthenticationError."""
    stmt = select(User).where(User.email == email.lower(), User.deleted_at.is_(None))
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise AuthenticationError("Invalid email or password.")

    if not verify_password(password, user.hashed_password):
        raise AuthenticationError("Invalid email or password.")

    if user.status != "active":
        raise AuthenticationError(f"Account is {user.status}. Please contact administration.")

    return user


async def create_refresh_token_record(
    db: AsyncSession,
    user_id: uuid.UUID,
    family_id: uuid.UUID | None = None,
) -> str:
    """Generate and store a new secure refresh token for the user."""
    settings = get_settings()
    raw_token = generate_secure_token(48)
    token_hashed = hash_token(raw_token)
    fam_id = family_id or uuid.uuid4()
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)

    record = RefreshToken(
        user_id=user_id,
        token_hash=token_hashed,
        family_id=fam_id,
        expires_at=expires_at,
        is_revoked=False,
    )
    db.add(record)
    await db.commit()
    return raw_token


async def rotate_refresh_token(
    db: AsyncSession,
    raw_refresh_token: str,
) -> tuple[str, str, User]:
    """Rotate a refresh token with family-based reuse detection."""
    token_hashed = hash_token(raw_refresh_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hashed)
    res = await db.execute(stmt)
    token_record = res.scalar_one_or_none()

    if not token_record:
        raise AuthenticationError("Invalid refresh token.")

    now = datetime.now(UTC)
    expires_at = token_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if token_record.is_revoked or expires_at < now:
        # Invalidate all tokens in this family
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token_record.family_id)
            .values(is_revoked=True, revoked_at=now)
        )
        await db.commit()
        raise AuthenticationError(
            "Refresh token was previously revoked or expired. Please log in again."
        )

    # Revoke current token
    token_record.is_revoked = True
    token_record.revoked_at = now
    await db.flush()

    # Get user
    user_res = await db.execute(
        select(User).where(User.id == token_record.user_id, User.deleted_at.is_(None))
    )
    user = user_res.scalar_one_or_none()
    if not user or user.status != "active":
        raise AuthenticationError("User is no longer active.")

    # Issue new refresh token within the same family
    new_raw_refresh = await create_refresh_token_record(
        db, user_id=user.id, family_id=token_record.family_id
    )

    # Issue new access token
    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    return access_token, new_raw_refresh, user


async def revoke_refresh_token(
    db: AsyncSession,
    raw_refresh_token: str,
) -> None:
    """Revoke a refresh token on user logout."""
    token_hashed = hash_token(raw_refresh_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hashed)
    res = await db.execute(stmt)
    token_record = res.scalar_one_or_none()
    if token_record and not token_record.is_revoked:
        token_record.is_revoked = True
        token_record.revoked_at = datetime.now(UTC)
        await db.commit()


async def request_password_reset(db: AsyncSession, email: str) -> None:
    """Send a password reset email if the user exists."""
    stmt = select(User).where(User.email == email.lower(), User.deleted_at.is_(None))
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        # Prevent email enumeration: return silently
        return

    # Create temporary single-use reset token
    reset_token = create_access_token(
        {"sub": str(user.id), "scope": "password_reset"},
        expires_delta=timedelta(hours=1),
    )

    mailer = get_mailer()
    reset_link = f"http://localhost:5173/auth/reset-password?token={reset_token}"
    body = (
        f"Hello {user.first_name},\n\n"
        f"You requested to reset your password for CampusFlow.\n"
        f"Click the link below to set a new password:\n{reset_link}\n\n"
        f"This link will expire in 1 hour.\n"
        f"If you did not make this request, please ignore this email."
    )
    await mailer.send_email(user.email, "CampusFlow Password Reset", body)

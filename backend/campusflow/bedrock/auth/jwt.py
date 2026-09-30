import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt

from campusflow.bedrock.api.errors import AuthenticationError
from campusflow.bedrock.config.settings import get_settings


def hash_token(raw_token: str) -> str:
    """Generate SHA-256 hash of a raw token string for secure database storage."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_secure_token(length: int = 64) -> str:
    """Generate cryptographically strong random token."""
    return secrets.token_urlsafe(length)


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """Create a signed JWT access token with user claims and expiration."""
    settings = get_settings()
    to_encode = data.copy()

    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"iat": now, "exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError as exc:
        raise AuthenticationError("Invalid or expired token.") from exc

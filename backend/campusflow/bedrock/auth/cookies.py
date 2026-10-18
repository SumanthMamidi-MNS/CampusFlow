"""Refresh-token cookie handling shared by every sign-in surface.

The refresh cookie is the long-lived half of a CampusFlow session, so its
attributes must be identical wherever it is issued: httpOnly (never readable by
scripts), ``secure`` outside debug, ``SameSite=strict`` and scoped to the whole
site with the configured lifetime.
"""

from fastapi import Response

from campusflow.bedrock.config.settings import get_settings

REFRESH_COOKIE_NAME = "refresh_token"


def set_refresh_cookie(response: Response, raw_token: str) -> None:
    """Attach the refresh token to a response as an httpOnly cookie."""
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=not settings.debug,
        samesite="strict",
        max_age=settings.refresh_token_expire_days * 86400,
    )


def clear_refresh_cookie(response: Response) -> None:
    """Remove the refresh cookie (sign-out).

    Attributes mirror :func:`set_refresh_cookie` so the deletion targets exactly
    the cookie that was written.
    """
    settings = get_settings()
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=not settings.debug,
        samesite="strict",
    )

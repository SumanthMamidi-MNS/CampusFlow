"""Demo surface: one-click preparation and one-click session.

Two deliberately-public endpoints back the "Try the demo" buttons:

- ``POST /exams/demo/prepare`` provisions the demo scenario idempotently and
  returns its exam id. It creates no session and issues no token, so it cannot
  be used to reach anyone's data; the ids it returns are of purpose-built demo
  objects only.
- ``POST /exams/demo/login`` provisions the scenario and mints a real session
  for the dedicated demo student account. That account owns nothing outside the
  demo offering, and there is exactly one such account, so a session minted
  here grants no access to institutional data.

Both are rate-limited by the existing authentication limiter's path set only if
we add them there explicitly; being cheap, idempotent reads/writes, they stay
outside the credential limiter but remain fully auditable.
"""

import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import ServiceUnavailableError
from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.auth.cookies import set_refresh_cookie
from campusflow.bedrock.db.session import get_db
from campusflow.domain.exams.demo import demo_login, ensure_demo_scenario

router = APIRouter(tags=["exams"])


@router.post("/exams/demo/prepare")
async def prepare_demo_exam_endpoint(db: AsyncSession = Depends(get_db)):
    """Idempotently provision the demo exam; return its id for deep-linking."""
    try:
        scenario = await ensure_demo_scenario(db)
        await db.commit()
    except Exception as exc:  # noqa: BLE001 - surfaced verbatim to the reviewer
        await db.rollback()
        raise ServiceUnavailableError(
            f"Could not prepare the demo examination: {exc}"
        ) from exc
    return success_response(scenario)


@router.post("/exams/demo/login")
async def demo_login_endpoint(response: Response, db: AsyncSession = Depends(get_db)):
    """One-click demo session: provisions the scenario and signs the caller in as the demo student."""
    try:
        session = await demo_login(db)
        await db.commit()
    except Exception as exc:  # noqa: BLE001 - surfaced verbatim to the reviewer
        await db.rollback()
        raise ServiceUnavailableError(
            f"Could not start the demo session: {exc}"
        ) from exc

    # The refresh token belongs in the httpOnly cookie only — never in the JSON
    # payload, where a script could read it.
    refresh_token = session.pop("refresh_token", None)
    if refresh_token:
        set_refresh_cookie(response, refresh_token)

    await record_audit_event(
        db,
        action="auth.demo_login",
        resource_type="user",
        resource_id=session["user"]["id"],
        user_id=uuid.UUID(session["user"]["id"]),
        user_email=session["user"]["email"],
        extra_data={"exam_id": session["exam_id"]},
    )
    await db.commit()
    return success_response(session)

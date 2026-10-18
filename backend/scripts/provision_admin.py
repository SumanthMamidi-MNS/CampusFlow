"""Create the first institution account on a fresh production database.

A CampusFlow deployment starts with an empty database and there is no public
sign-up — deliberately, because an institution's campus directory is not a
public website. That leaves one bootstrap question: who signs in first? This
script is the answer.

It creates (or repairs) a single account holding both:

* ``admin`` — the **Campus Lead / College Admin**, which the platform requires
  every institution to have at least one of (ADR-019), and
* ``super_admin`` — the platform-operator role, needed to recover the
  institution if the last Campus Lead is ever lost.

Running it again is safe: an existing account keeps its identity and is only
given any missing role. Nothing is overwritten unless ``--reset-password`` is
passed explicitly.

Usage (inside the backend container, after ``alembic upgrade head``):

    docker compose -f docker-compose.prod.yml exec backend \\
        python scripts/provision_admin.py \\
        --email registrar@example.edu --password '<long random>' \\
        --first-name Ada --last-name Lovelace

The password may also be supplied through ``CAMPUSFLOW_ADMIN_PASSWORD`` so it
never lands in shell history; the email/names have equivalent environment
fallbacks (``CAMPUSFLOW_ADMIN_EMAIL``, ``CAMPUSFLOW_ADMIN_FIRST_NAME``,
``CAMPUSFLOW_ADMIN_LAST_NAME``).

A bootstrap credential is the most valuable password in the deployment: use a
generated one (``python -c "import secrets; print(secrets.token_urlsafe(24))"``)
and rotate it after the first sign-in through the normal password reset flow.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Make `campusflow` importable when the script is launched from the repository
# root as well as from `backend/`.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import func, select  # noqa: E402

from campusflow.bedrock.audit.service import record_audit_event  # noqa: E402
from campusflow.bedrock.auth.pwd import get_password_hash  # noqa: E402
from campusflow.bedrock.db.session import async_session_factory, engine  # noqa: E402
from campusflow.bedrock.rbac.service import (  # noqa: E402
    assign_role_to_user,
    seed_roles_and_permissions,
)
from campusflow.domain.users.models import User  # noqa: E402

#: This account can grant every other account its roles, so a short password is
#: not a style problem — it is the whole institution's security.
MIN_PASSWORD_LENGTH = 12

#: Roles the bootstrap account receives. `admin` is the mandatory Campus Lead
#: (ADR-019); `super_admin` is the platform operator able to recover leadership.
DEFAULT_ROLES = ("admin", "super_admin")


async def provision(
    email: str,
    password: str | None,
    first_name: str,
    last_name: str,
    *,
    reset_password: bool,
) -> int:
    email = email.strip().lower()
    if password is not None and len(password) < MIN_PASSWORD_LENGTH:
        print(
            f"refusing: the password must be at least {MIN_PASSWORD_LENGTH} characters "
            "for an account this powerful",
            file=sys.stderr,
        )
        return 2

    created = False
    try:
        async with async_session_factory() as db:
            # Roles must exist before they can be assigned; seeding is idempotent.
            await seed_roles_and_permissions(db)

            existing = (
                await db.execute(
                    select(User).where(func.lower(User.email) == email, User.deleted_at.is_(None))
                )
            ).scalar_one_or_none()

            if existing is None:
                if not password:
                    print(
                        "refusing: a password is required to create a new account "
                        "(--password or CAMPUSFLOW_ADMIN_PASSWORD)",
                        file=sys.stderr,
                    )
                    return 2
                user = User(
                    email=email,
                    hashed_password=get_password_hash(password),
                    first_name=first_name.strip(),
                    last_name=last_name.strip(),
                    status="active",
                )
                db.add(user)
                await db.flush()
                created = True
            else:
                user = existing
                created = False
                if reset_password:
                    if not password:
                        print(
                            "refusing: --reset-password needs a password",
                            file=sys.stderr,
                        )
                        return 2
                    user.hashed_password = get_password_hash(password)
                if user.status != "active":
                    user.status = "active"

            for role in DEFAULT_ROLES:
                # Idempotent: an existing assignment is left alone.
                await assign_role_to_user(db, user.id, role)

            await record_audit_event(
                db=db,
                action="user.bootstrap_admin",
                resource_type="user",
                resource_id=str(user.id),
                user_email=email,
                extra_data={
                    "created": created,
                    "roles": list(DEFAULT_ROLES),
                    "password_reset": bool(reset_password),
                },
            )
            await db.commit()
    finally:
        await engine.dispose()

    verb = "created" if created else "already existed; roles assured for"
    print(f"{verb} {email} ({', '.join(DEFAULT_ROLES)})")
    print("rotate this password through the normal reset flow after the first sign-in.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create the first Campus Lead / super-admin account."
    )
    parser.add_argument("--email", default=os.environ.get("CAMPUSFLOW_ADMIN_EMAIL"))
    parser.add_argument("--password", default=os.environ.get("CAMPUSFLOW_ADMIN_PASSWORD"))
    parser.add_argument(
        "--first-name", default=os.environ.get("CAMPUSFLOW_ADMIN_FIRST_NAME", "Campus")
    )
    parser.add_argument("--last-name", default=os.environ.get("CAMPUSFLOW_ADMIN_LAST_NAME", "Lead"))
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="replace the password of an existing account",
    )
    args = parser.parse_args()

    if not args.email:
        parser.error("--email or CAMPUSFLOW_ADMIN_EMAIL is required")

    raise SystemExit(
        asyncio.run(
            provision(
                args.email,
                args.password,
                args.first_name,
                args.last_name,
                reset_password=args.reset_password,
            )
        )
    )


if __name__ == "__main__":
    main()

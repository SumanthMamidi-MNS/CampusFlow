"""CampusFlow bootstrap — idempotent environment, schema and demo data.

Makes a fresh checkout runnable in one command. Safe to run repeatedly:

1. Creates ``backend/.env`` from ``backend/.env.example`` when absent, with a
   freshly generated JWT secret (the shipped placeholder is only accepted in
   debug mode, so a copied template would otherwise refuse to start).
2. Selects a database. PostgreSQL is used when it answers; otherwise the script
   falls back to a local SQLite file so the application still starts on a
   machine without Docker. Use ``--no-fallback`` to fail instead.
3. Applies the schema — Alembic migrations for PostgreSQL, metadata ``create_all``
   plus an additive column/index reconciliation for SQLite (the migrations target
   PostgreSQL, and ``create_all`` never alters a table that already exists).
4. Runs the demo seeder, which is idempotent and only inserts what is missing.

Usage (from the repository root or from backend/)::

    python scripts/bootstrap.py
    python scripts/bootstrap.py --sqlite          # force the local file database
    python scripts/bootstrap.py --no-fallback     # require PostgreSQL
    python scripts/bootstrap.py --no-seed         # schema only
"""

from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
ENV_PATH = BACKEND_DIR / ".env"
ENV_EXAMPLE_PATH = BACKEND_DIR / ".env.example"

PLACEHOLDER_SECRET = "change-me-in-production-use-a-strong-random-secret"
DEFAULT_PG_URL = "postgresql+asyncpg://campusflow:campusflow@localhost:5432/campusflow"
# Absolute, anchored to the repository root. A relative URL is resolved against
# whatever directory the process happens to run in: ``start.bat`` bootstraps from
# the root while uvicorn runs with ``backend/`` as its working directory, so a
# relative path silently seeds one file and serves another.
SQLITE_PATH = (REPO_ROOT / "campusflow.db").resolve()
SQLITE_URL = f"sqlite+aiosqlite:///{SQLITE_PATH.as_posix()}"
LEGACY_SQLITE_PATHS = ((BACKEND_DIR / "campusflow.db").resolve(),)


def log(message: str) -> None:
    print(f"[bootstrap] {message}", flush=True)


def read_env_value(path: Path, key: str) -> str | None:
    """Return the value of ``key`` from a dotenv-style file, if present."""
    if not path.exists():
        return None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip().upper() == key.upper():
            return value.strip()
    return None


def write_env_value(path: Path, key: str, value: str) -> None:
    """Set ``key`` in a dotenv-style file, appending it when absent."""
    lines = path.read_text(encoding="utf-8").splitlines()
    for index, raw in enumerate(lines):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, _ = stripped.split("=", 1)
        if name.strip().upper() == key.upper():
            lines[index] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def ensure_env_file() -> bool:
    """Create backend/.env from the template if missing. Returns True if created."""
    if ENV_PATH.exists():
        return False

    if not ENV_EXAMPLE_PATH.exists():
        raise SystemExit(
            f"[bootstrap] ERROR: neither {ENV_PATH.name} nor {ENV_EXAMPLE_PATH.name} exists."
        )

    content = ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
    content = content.replace(PLACEHOLDER_SECRET, secrets.token_urlsafe(48))
    ENV_PATH.write_text(content, encoding="utf-8")
    log(f"created {ENV_PATH.relative_to(REPO_ROOT)} with a generated JWT secret")
    return True


async def postgres_reachable(url: str, timeout: float = 3.0) -> bool:
    """True when a plain PostgreSQL connection succeeds within the timeout."""
    if not url.startswith("postgresql"):
        return False
    try:
        import asyncpg

        dsn = url.replace("postgresql+asyncpg://", "postgresql://", 1)
        conn = await asyncio.wait_for(asyncpg.connect(dsn), timeout=timeout)
    except Exception:
        return False
    await conn.close()
    return True


async def resolve_database_url(*, force_sqlite: bool, allow_fallback: bool) -> tuple[str, bool]:
    """Decide which database to use. Returns (url, is_sqlite)."""
    if force_sqlite:
        log("using SQLite (requested)")
        return SQLITE_URL, True

    configured = read_env_value(ENV_PATH, "DATABASE_URL") or DEFAULT_PG_URL

    if await postgres_reachable(configured):
        log("PostgreSQL is reachable")
        return configured, False

    if not allow_fallback:
        raise SystemExit(
            "[bootstrap] ERROR: PostgreSQL is not reachable and --no-fallback was given.\n"
            "[bootstrap]        Start the containers first: docker compose up -d postgres"
        )

    log("PostgreSQL is NOT reachable — falling back to SQLite so the app still runs")
    log("(code execution will report 'sandbox unavailable' until Piston is running)")
    return SQLITE_URL, True


def adopt_legacy_sqlite_file() -> None:
    """Move a database created by the old relative URL to the canonical path.

    Before the URL was anchored, a bootstrap run from ``backend/`` wrote
    ``backend/campusflow.db``. Adopting it keeps that demo data instead of
    silently starting from an empty file. Nothing is deleted.
    """
    if SQLITE_PATH.exists():
        return
    for legacy in LEGACY_SQLITE_PATHS:
        if legacy.exists() and legacy.stat().st_size > 0:
            import shutil

            shutil.copy2(legacy, SQLITE_PATH)
            log(f"adopted existing {legacy.name} at {legacy.parent.name}/ into {SQLITE_PATH.name}")
            return


def _sqlite_reconcile_plan(sync_conn: object) -> tuple[list[str], list[str], list[str]]:
    """Diff the SQLite file against the model metadata.

    Returns ``(statements, added_columns, unsafe)``: additive ``ALTER TABLE ...
    ADD COLUMN`` and ``CREATE INDEX`` statements that can be applied in place,
    the columns they add, and declarations that cannot be reconciled additively
    (so the caller fails loudly instead of serving a schema that lies).
    """
    import sqlalchemy as sa
    from campusflow.bedrock.db.base import Base

    inspector = sa.inspect(sync_conn)
    existing_tables = set(inspector.get_table_names())
    statements: list[str] = []
    added: list[str] = []
    unsafe: list[str] = []

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all already made it, column set included
        present = {column["name"] for column in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in present:
                continue
            type_sql = sync_conn.dialect.type_compiler.process(column.type, type_expression=column)
            parts = [f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {type_sql}']
            default_sql = None
            if column.server_default is not None:
                default_sql = str(column.server_default.arg)
                parts.append(f"DEFAULT {default_sql}")
            if not column.nullable:
                if default_sql is None:
                    unsafe.append(f"{table.name}.{column.name} is NOT NULL without a default")
                    continue
                parts.append("NOT NULL")
            statements.append(" ".join(parts))
            added.append(f"{table.name}.{column.name}")

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        known = {index["name"] for index in inspector.get_indexes(table.name)}
        for index in table.indexes:
            if index.name in known:
                continue
            columns = ", ".join(f'"{column.name}"' for column in index.columns)
            statements.append(
                f'CREATE INDEX IF NOT EXISTS "{index.name}" ON "{table.name}" ({columns})'
            )
    return statements, added, unsafe


def reconcile_sqlite_schema() -> None:
    """Add columns and indexes the metadata declares but the file lacks."""
    from campusflow.bedrock.db.session import engine

    async def run() -> tuple[list[str], list[str]]:
        async with engine.begin() as conn:
            statements, added, unsafe = await conn.run_sync(_sqlite_reconcile_plan)
            if unsafe:
                raise SystemExit(
                    "[bootstrap] ERROR: the SQLite file predates a change that cannot be "
                    "applied in place:\n  "
                    + "\n  ".join(unsafe)
                    + f"\n[bootstrap]        Delete {SQLITE_PATH} and rerun to rebuild it, "
                    "or point DATABASE_URL at PostgreSQL."
                )
            for statement in statements:
                await conn.exec_driver_sql(statement)
            return statements, added

    statements, added = asyncio.run(run())
    if added:
        log(f"schema reconciled in place, added: {', '.join(added)}")
    elif statements:
        log(f"schema reconciled in place ({len(statements)} indexes)")
    else:
        log("SQLite schema already matches the model metadata")


def apply_schema(is_sqlite: bool) -> None:
    """Create or migrate the schema."""
    if is_sqlite:
        from campusflow.bedrock.db.base import Base
        from campusflow.bedrock.db.session import engine
        import campusflow.domain.programming.models  # noqa: F401
        import campusflow.bedrock.audit.models  # noqa: F401
        import campusflow.bedrock.auth.models  # noqa: F401
        import campusflow.bedrock.rbac.models  # noqa: F401
        import campusflow.domain.users.models  # noqa: F401
        import campusflow.domain.institution.models  # noqa: F401
        import campusflow.domain.academic_terms.models  # noqa: F401
        import campusflow.domain.departments.models  # noqa: F401
        import campusflow.domain.courses.models  # noqa: F401
        import campusflow.domain.enrollments.models  # noqa: F401
        import campusflow.domain.materials.models  # noqa: F401
        import campusflow.domain.announcements.models  # noqa: F401
        import campusflow.domain.assignments.models  # noqa: F401
        import campusflow.domain.notifications.models  # noqa: F401
        import campusflow.domain.question_banks.models  # noqa: F401
        import campusflow.domain.exams.models  # noqa: F401

        async def create_all() -> None:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

        asyncio.run(create_all())
        log("schema created from model metadata (SQLite)")
        reconcile_sqlite_schema()
        return

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        raise SystemExit("[bootstrap] ERROR: alembic upgrade head failed.")
    tail = [line for line in (result.stdout or "").splitlines() if line.strip()][-1:]
    log(f"schema migrated to head ({tail[0] if tail else 'ok'})")


def run_seed() -> None:
    """Run the idempotent demo seeder."""
    scripts_dir = REPO_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    import seed  # type: ignore[import-not-found]

    asyncio.run(seed.seed())
    log("demo data seeded (idempotent — only missing records were inserted)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap CampusFlow idempotently.")
    parser.add_argument("--sqlite", action="store_true", help="force the local SQLite file database")
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        help="fail instead of falling back to SQLite when PostgreSQL is unreachable",
    )
    parser.add_argument("--no-seed", action="store_true", help="apply the schema only")
    args = parser.parse_args()

    log(f"repository root: {REPO_ROOT}")
    ensure_env_file()

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    database_url, is_sqlite = asyncio.run(
        resolve_database_url(force_sqlite=args.sqlite, allow_fallback=not args.no_fallback)
    )

    if is_sqlite:
        adopt_legacy_sqlite_file()
        log(f"SQLite database: {SQLITE_PATH}")

    # Environment variables outrank the .env file in pydantic-settings, so this
    # pins the resolved database for every module imported from here on.
    os.environ["DATABASE_URL"] = database_url
    if is_sqlite:
        # Persist the fallback so `uvicorn` started later uses the same file.
        write_env_value(ENV_PATH, "DATABASE_URL", database_url)

    apply_schema(is_sqlite)

    if args.no_seed:
        log("skipping seed (--no-seed)")
    else:
        run_seed()

    log("done — the application is ready to start.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

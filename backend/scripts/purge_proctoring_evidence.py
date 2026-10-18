"""Erase expired camera evidence frames from the integrity trail (D-2).

Assessment-integrity mode stores a downscaled still each time the candidate's
camera is required for evidence. Those stills are personal data, so they are
kept only for the institution's configured window
(``PROCTORING_EVIDENCE_RETENTION_DAYS``, default 90 days) and then erased.

Only the image is erased. The event row keeps its type, timestamp and severity,
so the reviewer's timeline still shows that a frame existed and records when it
was erased. A retention of ``0`` keeps frames indefinitely and is a no-op — it is
never read as "delete everything".

Usage (from the backend directory):

    python scripts/purge_proctoring_evidence.py                 # settings value
    python scripts/purge_proctoring_evidence.py --retention-days 30

The production stack runs this once a day through the ``evidence-retention``
service in ``docker-compose.prod.yml``; a single run is safe to schedule from
cron elsewhere. Every run that erases anything writes an
``proctoring.evidence_purge`` audit record.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Make `campusflow` importable when the script is launched from the repository
# root as well as from `backend/`.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from campusflow.bedrock.config.settings import get_settings  # noqa: E402
from campusflow.bedrock.db.session import async_session_factory, engine  # noqa: E402
from campusflow.domain.exams.service import purge_proctoring_evidence  # noqa: E402


async def run(retention_days: int | None) -> int:
    settings = get_settings()
    days = settings.proctoring_evidence_retention_days if retention_days is None else retention_days
    if days <= 0:
        print("evidence retention is disabled (retention_days=0); nothing to erase")
        return 0

    try:
        async with async_session_factory() as session:
            result = await purge_proctoring_evidence(session, days)
    finally:
        await engine.dispose()

    print(
        f"evidence retention: window={days}d "
        f"examined={result['events_examined']} erased={result['frames_erased']}"
    )
    return result["frames_erased"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Erase camera evidence frames older than the retention window."
    )
    parser.add_argument(
        "--retention-days",
        type=int,
        default=None,
        help="override PROCTORING_EVIDENCE_RETENTION_DAYS for this run",
    )
    args = parser.parse_args()
    asyncio.run(run(args.retention_days))


if __name__ == "__main__":
    main()

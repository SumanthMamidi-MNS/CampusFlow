"""track the candidate's acknowledgement of a counted warning

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-11-02 09:00:00.000000

The warning ladder now waits for the candidate to acknowledge the warning on
screen before it can count another one, and only then starts the disclosed
ten-second gap. The acknowledgement lives on the attempt beside
``last_warning_at`` so a read cannot be mistaken for an acknowledgement and a
suppressed observation can never close the gate.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exam_attempts",
        sa.Column("warning_acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Attempts that already carry a counted warning predate the acknowledgement
    # concept. Treat those warnings as acknowledged at the moment they were
    # counted: the old build measured the gap from that moment, so an open
    # sitting is not stranded behind a modal it was never shown.
    op.execute(
        "UPDATE exam_attempts "
        "SET warning_acknowledged_at = last_warning_at "
        "WHERE last_warning_at IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("exam_attempts", "warning_acknowledged_at")

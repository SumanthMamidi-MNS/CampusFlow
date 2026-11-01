"""track the last counted warning on an attempt

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-11-01 15:00:00.000000

The event endpoint now enforces a cooldown between counted warnings. The
timestamp lives on the attempt so the gate is a property of the sitting, not of
the append-only event trail (where suppressed observations also live).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exam_attempts",
        sa.Column("last_warning_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("exam_attempts", "last_warning_at")

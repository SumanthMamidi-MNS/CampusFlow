"""persist randomized exam delivery per attempt

Revision ID: a6b7c8d9e0f1
Revises: d4e5f6a7b8c9
Create Date: 2026-10-29 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a6b7c8d9e0f1"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exam_attempts", sa.Column("delivery_variant", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("exam_attempts", "delivery_variant")

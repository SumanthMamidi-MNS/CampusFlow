"""create roster import batches and the must-change-password flag

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-10 13:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'must_change_password',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    op.create_table(
        'roster_import_batches',
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('source_filename', sa.String(length=255), nullable=True),
        sa.Column('course_offering_id', sa.Uuid(), nullable=True),
        sa.Column('column_mapping', sa.JSON(), nullable=False),
        sa.Column('summary', sa.JSON(), nullable=False),
        sa.Column('staged_rows', sa.JSON(), nullable=False),
        sa.Column('idempotency_key', sa.String(length=128), nullable=False),
        sa.Column('created_by_id', sa.Uuid(), nullable=True),
        sa.Column('committed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['course_offering_id'], ['course_offerings.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_roster_import_batches_id'), 'roster_import_batches', ['id'], unique=False)
    op.create_index(
        op.f('ix_roster_import_batches_course_offering_id'),
        'roster_import_batches',
        ['course_offering_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_roster_import_batches_idempotency_key'),
        'roster_import_batches',
        ['idempotency_key'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f('ix_roster_import_batches_idempotency_key'), table_name='roster_import_batches'
    )
    op.drop_index(
        op.f('ix_roster_import_batches_course_offering_id'), table_name='roster_import_batches'
    )
    op.drop_index(op.f('ix_roster_import_batches_id'), table_name='roster_import_batches')
    op.drop_table('roster_import_batches')
    op.drop_column('users', 'must_change_password')

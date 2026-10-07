"""create programming environment tables

Revision ID: b1f2a3c4d5e6
Revises: 9efc83260dbd
Create Date: 2026-10-06 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b1f2a3c4d5e6'
down_revision: Union[str, None] = '9efc83260dbd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'coding_problems',
        sa.Column('course_offering_id', sa.Uuid(), nullable=False),
        sa.Column('created_by_id', sa.Uuid(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('language', sa.String(length=32), nullable=False),
        sa.Column('starter_code', sa.Text(), nullable=True),
        sa.Column('total_marks', sa.Float(), nullable=False),
        sa.Column('time_limit_ms', sa.Integer(), nullable=False),
        sa.Column('memory_limit_kb', sa.Integer(), nullable=False),
        sa.Column('is_published', sa.Boolean(), nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['course_offering_id'], ['course_offerings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_coding_problems_id'), 'coding_problems', ['id'], unique=False)
    op.create_index(
        op.f('ix_coding_problems_course_offering_id'), 'coding_problems', ['course_offering_id'], unique=False
    )

    op.create_table(
        'coding_test_cases',
        sa.Column('problem_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('stdin', sa.Text(), nullable=False),
        sa.Column('expected_output', sa.Text(), nullable=False),
        sa.Column('is_hidden', sa.Boolean(), nullable=False),
        sa.Column('comparison', sa.String(length=16), nullable=False),
        sa.Column('marks', sa.Float(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['problem_id'], ['coding_problems.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_coding_test_cases_id'), 'coding_test_cases', ['id'], unique=False)
    op.create_index(op.f('ix_coding_test_cases_problem_id'), 'coding_test_cases', ['problem_id'], unique=False)

    op.create_table(
        'coding_submissions',
        sa.Column('problem_id', sa.Uuid(), nullable=False),
        sa.Column('student_id', sa.Uuid(), nullable=False),
        sa.Column('language', sa.String(length=32), nullable=False),
        sa.Column('source_code', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('max_score', sa.Float(), nullable=False),
        sa.Column('passed_tests', sa.Integer(), nullable=False),
        sa.Column('total_tests', sa.Integer(), nullable=False),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('diagnostics', sa.Text(), nullable=True),
        sa.Column('result_summary', sa.JSON(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['problem_id'], ['coding_problems.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_coding_submissions_id'), 'coding_submissions', ['id'], unique=False)
    op.create_index(op.f('ix_coding_submissions_problem_id'), 'coding_submissions', ['problem_id'], unique=False)
    op.create_index(op.f('ix_coding_submissions_student_id'), 'coding_submissions', ['student_id'], unique=False)

    op.create_table(
        'coding_test_results',
        sa.Column('submission_id', sa.Uuid(), nullable=False),
        sa.Column('test_case_id', sa.Uuid(), nullable=True),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('passed', sa.Boolean(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('expected_output', sa.Text(), nullable=True),
        sa.Column('actual_output', sa.Text(), nullable=True),
        sa.Column('stderr', sa.Text(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('is_hidden', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['submission_id'], ['coding_submissions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['test_case_id'], ['coding_test_cases.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_coding_test_results_id'), 'coding_test_results', ['id'], unique=False)
    op.create_index(
        op.f('ix_coding_test_results_submission_id'), 'coding_test_results', ['submission_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_coding_test_results_submission_id'), table_name='coding_test_results')
    op.drop_index(op.f('ix_coding_test_results_id'), table_name='coding_test_results')
    op.drop_table('coding_test_results')

    op.drop_index(op.f('ix_coding_submissions_student_id'), table_name='coding_submissions')
    op.drop_index(op.f('ix_coding_submissions_problem_id'), table_name='coding_submissions')
    op.drop_index(op.f('ix_coding_submissions_id'), table_name='coding_submissions')
    op.drop_table('coding_submissions')

    op.drop_index(op.f('ix_coding_test_cases_problem_id'), table_name='coding_test_cases')
    op.drop_index(op.f('ix_coding_test_cases_id'), table_name='coding_test_cases')
    op.drop_table('coding_test_cases')

    op.drop_index(op.f('ix_coding_problems_course_offering_id'), table_name='coding_problems')
    op.drop_index(op.f('ix_coding_problems_id'), table_name='coding_problems')
    op.drop_table('coding_problems')

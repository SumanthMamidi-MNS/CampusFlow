"""add student identity, section/assessment series, and duplicate-prevention constraints

Revision ID: c3d4e5f6a7b8
Revises: b1f2a3c4d5e6
Create Date: 2026-10-10 12:00:00.000000

Adds the Wave 3 identity and duplicate-prevention structure:

* ``users.registration_number`` (unique when present) and ``users.admission_year``
* ``exams.series_id`` — one assessment can be sat by several sections
* ``uq_faculty_assignment_offering_faculty`` — a lecturer is assigned to a
  section once
* ``uq_exam_attempt_student_number`` — a candidate has one row per attempt number

Before the attempt constraint can be created, duplicate
``(exam_id, student_id, attempt_number)`` rows are reconciled by **renumbering**
them in ``started_at`` order (no row is deleted — every attempt is preserved, and
the count a candidate has used is unchanged). Faculty-assignment duplicates have
no meaningful resolution, so the migration refuses to guess: if any exist it
raises with instructions to run the duplicate audit first.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b1f2a3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Student identity ────────────────────────────────────────────────────
    op.add_column('users', sa.Column('registration_number', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('admission_year', sa.Integer(), nullable=True))
    op.create_index(
        op.f('ix_users_registration_number'),
        'users',
        ['registration_number'],
        unique=True,
    )

    # ── Multi-section assessment ────────────────────────────────────────────
    op.add_column('exams', sa.Column('series_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_exams_series_id'), 'exams', ['series_id'], unique=False)

    # ── Duplicate prevention ────────────────────────────────────────────────
    conn = op.get_bind()

    dup_assignments = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM ("
            "  SELECT course_offering_id, faculty_id FROM faculty_assignments"
            "  GROUP BY course_offering_id, faculty_id HAVING COUNT(*) > 1"
            ") dupes"
        )
    ).scalar_one()
    if dup_assignments:
        raise RuntimeError(
            f"{dup_assignments} duplicate (course_offering_id, faculty_id) faculty "
            "assignment group(s) exist. Run the duplicate audit and resolve them "
            "explicitly before applying uq_faculty_assignment_offering_faculty; this "
            "migration intentionally refuses to merge teaching assignments by itself."
        )
    op.create_unique_constraint(
        'uq_faculty_assignment_offering_faculty',
        'faculty_assignments',
        ['course_offering_id', 'faculty_id'],
    )

    # Renumber (never delete) duplicate attempt numbers, oldest first, so the
    # newest attempt keeps the highest number.
    if conn.dialect.name == 'postgresql':
        conn.execute(
            sa.text(
                "WITH ranked AS ("
                "  SELECT id, ROW_NUMBER() OVER ("
                "    PARTITION BY exam_id, student_id ORDER BY started_at, id"
                "  ) AS rn FROM exam_attempts"
                ") "
                "UPDATE exam_attempts a SET attempt_number = r.rn "
                "FROM ranked r WHERE a.id = r.id AND a.attempt_number <> r.rn"
            )
        )
    op.create_unique_constraint(
        'uq_exam_attempt_student_number',
        'exam_attempts',
        ['exam_id', 'student_id', 'attempt_number'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_exam_attempt_student_number', 'exam_attempts', type_='unique')
    op.drop_constraint(
        'uq_faculty_assignment_offering_faculty', 'faculty_assignments', type_='unique'
    )

    op.drop_index(op.f('ix_exams_series_id'), table_name='exams')
    op.drop_column('exams', 'series_id')

    op.drop_index(op.f('ix_users_registration_number'), table_name='users')
    op.drop_column('users', 'admission_year')
    op.drop_column('users', 'registration_number')

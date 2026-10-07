import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from campusflow.bedrock.db.base import BaseModel


class CodingProblem(BaseModel):
    """An auto-graded programming exercise delivered inside a course offering."""

    __tablename__ = "coding_problems"

    course_offering_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(String(32), default="python", nullable=False)
    starter_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_marks: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    time_limit_ms: Mapped[int] = mapped_column(Integer, default=5000, nullable=False)
    memory_limit_kb: Mapped[int] = mapped_column(Integer, default=131_072, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    test_cases: Mapped[list["CodingTestCase"]] = relationship(
        "CodingTestCase",
        back_populates="problem",
        cascade="all, delete-orphan",
        order_by="CodingTestCase.sort_order",
    )
    submissions: Mapped[list["CodingSubmission"]] = relationship(
        "CodingSubmission",
        back_populates="problem",
        cascade="all, delete-orphan",
    )


class CodingTestCase(BaseModel):
    """A single input/expected-output pair used for automated grading."""

    __tablename__ = "coding_test_cases"

    problem_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("coding_problems.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    stdin: Mapped[str] = mapped_column(Text, default="", nullable=False)
    expected_output: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Hidden cases are never returned to students.
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # "trimmed" collapses whitespace; "exact" compares line-by-line.
    comparison: Mapped[str] = mapped_column(String(16), default="trimmed", nullable=False)
    marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    problem: Mapped["CodingProblem"] = relationship("CodingProblem", back_populates="test_cases")


class CodingSubmission(BaseModel):
    """A student's submitted solution and its automated evaluation."""

    __tablename__ = "coding_submissions"

    problem_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("coding_problems.id", ondelete="CASCADE"), index=True, nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    language: Mapped[str] = mapped_column(String(32), default="python", nullable=False)
    source_code: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="failed", nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    passed_tests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    diagnostics: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    problem: Mapped["CodingProblem"] = relationship("CodingProblem", back_populates="submissions")
    results: Mapped[list["CodingTestResult"]] = relationship(
        "CodingTestResult",
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="CodingTestResult.created_at",
    )


class CodingTestResult(BaseModel):
    """Outcome of one test case for one submission."""

    __tablename__ = "coding_test_results"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("coding_submissions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    test_case_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("coding_test_cases.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="failed", nullable=False)
    expected_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    stderr: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    submission: Mapped["CodingSubmission"] = relationship(
        "CodingSubmission", back_populates="results"
    )

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
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from campusflow.bedrock.db.base import BaseModel


class Assignment(BaseModel):
    __tablename__ = "assignments"

    course_offering_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignment_type: Mapped[str] = mapped_column(String(64), default="file_upload", nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_marks: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    pass_marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    weightage: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    allow_late: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    late_penalty_percent_per_day: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    max_late_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rubric: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    course_offering: Mapped["CourseOffering"] = relationship(  # noqa: F821
        "CourseOffering", foreign_keys=[course_offering_id]
    )
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_id])  # noqa: F821
    submissions: Mapped[list["AssignmentSubmission"]] = relationship(
        "AssignmentSubmission", back_populates="assignment", cascade="all, delete-orphan"
    )


class AssignmentSubmission(BaseModel):
    __tablename__ = "assignment_submissions"

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), default="submitted", nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_late: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    late_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_assignment_submission_student"),
    )

    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="submissions")
    student: Mapped["User"] = relationship("User", foreign_keys=[student_id], lazy="joined")  # noqa: F821
    grade: Mapped["SubmissionGrade | None"] = relationship(
        "SubmissionGrade",
        back_populates="submission",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class SubmissionGrade(BaseModel):
    __tablename__ = "submission_grades"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignment_submissions.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    graded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    marks_obtained: Mapped[float] = mapped_column(Float, nullable=False)
    penalty_deducted: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    final_marks: Mapped[float] = mapped_column(Float, nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    rubric_evaluation: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    graded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    submission: Mapped["AssignmentSubmission"] = relationship(
        "AssignmentSubmission", back_populates="grade"
    )
    graded_by: Mapped["User | None"] = relationship("User", foreign_keys=[graded_by_id], lazy="joined")  # noqa: F821


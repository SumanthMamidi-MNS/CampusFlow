import uuid
from datetime import datetime
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


class Exam(BaseModel):
    __tablename__ = "exams"

    course_offering_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    exam_type: Mapped[str] = mapped_column(String(32), default="quiz", nullable=False)  # quiz, midterm, final, practice
    total_marks: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    passing_marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    start_window: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_window: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)  # draft, scheduled, live, completed, graded, published
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # One assessment may be sat by several authorised sections. Each section
    # keeps its own Exam row (so every existing offering-scope check keeps
    # working unchanged) and the rows that belong to one assessment share a
    # ``series_id``. A single-section assessment leaves this NULL.
    series_id: Mapped[uuid.UUID | None] = mapped_column(index=True, nullable=True)

    course_offering: Mapped["CourseOffering"] = relationship("CourseOffering", lazy="joined")  # noqa: F821
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_id], lazy="joined")  # noqa: F821
    sections: Mapped[list["ExamSection"]] = relationship(
        "ExamSection", back_populates="exam", cascade="all, delete-orphan", lazy="selectin", order_by="ExamSection.sort_order"
    )
    questions: Mapped[list["ExamQuestion"]] = relationship(
        "ExamQuestion", back_populates="exam", cascade="all, delete-orphan", lazy="selectin", order_by="ExamQuestion.sort_order"
    )
    attempts: Mapped[list["ExamAttempt"]] = relationship(
        "ExamAttempt", back_populates="exam", cascade="all, delete-orphan", lazy="selectin"
    )


class ExamSection(BaseModel):
    __tablename__ = "exam_sections"

    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    exam: Mapped["Exam"] = relationship("Exam", back_populates="sections")
    questions: Mapped[list["ExamQuestion"]] = relationship(
        "ExamQuestion", back_populates="section", cascade="all, delete-orphan", lazy="selectin", order_by="ExamQuestion.sort_order"
    )


class ExamQuestion(BaseModel):
    __tablename__ = "exam_questions"

    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), index=True, nullable=False
    )
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("exam_sections.id", ondelete="SET NULL"), index=True, nullable=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    marks_override: Mapped[float | None] = mapped_column(Float, nullable=True)
    negative_marks_override: Mapped[float | None] = mapped_column(Float, nullable=True)

    exam: Mapped["Exam"] = relationship("Exam", back_populates="questions")
    section: Mapped["ExamSection | None"] = relationship("ExamSection", back_populates="questions")
    question: Mapped["Question"] = relationship("Question", lazy="joined")  # noqa: F821
    responses: Mapped[list["ExamResponse"]] = relationship(
        "ExamResponse", back_populates="exam_question", cascade="all, delete-orphan"
    )


class ExamAttempt(BaseModel):
    __tablename__ = "exam_attempts"

    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), index=True, nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="in_progress", nullable=False)  # in_progress, submitted, auto_submitted, graded
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    browser_fingerprint: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Attempt-specific question and option ordering. Option labels remain the
    # canonical answer-key identifiers; the JSON stores only their display order.
    delivery_variant: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    proctor_flags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    proctor_violations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # When the candidate's most recent warning was counted. The event endpoint
    # refuses to count another warning until the disclosed cooldown has elapsed;
    # a null value means the next counted signal starts a fresh ladder. Stored
    # on the attempt rather than derived from the event trail so a suppressed
    # event cannot be mistaken for the last warning.
    last_warning_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # When the candidate acknowledged the warning above. The next warning can
    # only be counted after this moment, and only once the disclosed gap has
    # elapsed from it. A null value beside a non-null ``last_warning_at`` means
    # the warning is still on screen and the ladder is deliberately paused.
    warning_acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # A candidate has at most one row per attempt number. Duplicate rows were
    # possible before this constraint (Wave 2 reported `attempt_number = 1`
    # twice for one candidate); the migration reconciles existing duplicates by
    # renumbering them in `started_at` order, and the database now refuses a new
    # duplicate even if two start requests race.
    __table_args__ = (
        UniqueConstraint(
            "exam_id",
            "student_id",
            "attempt_number",
            name="uq_exam_attempt_student_number",
        ),
    )

    exam: Mapped["Exam"] = relationship("Exam", back_populates="attempts")
    student: Mapped["User"] = relationship("User", foreign_keys=[student_id], lazy="joined")  # noqa: F821
    responses: Mapped[list["ExamResponse"]] = relationship(
        "ExamResponse", back_populates="attempt", cascade="all, delete-orphan", lazy="selectin"
    )
    proctoring_events: Mapped[list["ProctoringEvent"]] = relationship(
        "ProctoringEvent", back_populates="attempt", cascade="all, delete-orphan", lazy="selectin"
    )


class ExamResponse(BaseModel):
    __tablename__ = "exam_responses"

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_attempts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    exam_question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_questions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    answer_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    flagged_for_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    marks_awarded: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_auto_graded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    graded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    attempt: Mapped["ExamAttempt"] = relationship("ExamAttempt", back_populates="responses")
    exam_question: Mapped["ExamQuestion"] = relationship("ExamQuestion", back_populates="responses", lazy="joined")
    graded_by: Mapped["User | None"] = relationship("User", foreign_keys=[graded_by_id], lazy="joined")  # noqa: F821


class ProctoringEvent(BaseModel):
    __tablename__ = "proctoring_events"

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_attempts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)  # tab_switch, window_blur, fullscreen_exit, copy_paste_attempt, context_menu, ip_change
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)  # low, medium, high
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    attempt: Mapped["ExamAttempt"] = relationship("ExamAttempt", back_populates="proctoring_events")

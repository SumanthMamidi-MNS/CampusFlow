import uuid
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from campusflow.bedrock.db.base import BaseModel


class QuestionBank(BaseModel):
    __tablename__ = "question_banks"

    department_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("courses.id", ondelete="SET NULL"), index=True, nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    department: Mapped["Department"] = relationship("Department", lazy="joined")  # noqa: F821
    course: Mapped["Course | None"] = relationship("Course", lazy="joined")  # noqa: F821
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_id], lazy="joined")  # noqa: F821
    questions: Mapped[list["Question"]] = relationship(
        "Question", back_populates="question_bank", cascade="all, delete-orphan", lazy="selectin"
    )


class Question(BaseModel):
    __tablename__ = "questions"

    question_bank_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("question_banks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question_type: Mapped[str] = mapped_column(String(32), default="mcq", nullable=False)
    difficulty: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    marks: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    negative_marks: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    metadata_info: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="draft", nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    question_bank: Mapped["QuestionBank"] = relationship("QuestionBank", back_populates="questions")
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_id], lazy="joined")  # noqa: F821
    approved_by: Mapped["User | None"] = relationship("User", foreign_keys=[approved_by_id], lazy="joined")  # noqa: F821
    options: Mapped[list["QuestionOption"]] = relationship(
        "QuestionOption", back_populates="question", cascade="all, delete-orphan", lazy="selectin"
    )


class QuestionOption(BaseModel):
    __tablename__ = "question_options"

    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(16), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    question: Mapped["Question"] = relationship("Question", back_populates="options")

import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from campusflow.bedrock.db.base import BaseModel


class Department(BaseModel):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    head_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    programs: Mapped[list["Program"]] = relationship(
        "Program", back_populates="department", cascade="all, delete-orphan", lazy="selectin"
    )


class Program(BaseModel):
    __tablename__ = "programs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    degree_type: Mapped[str] = mapped_column(String(64), default="Bachelor", nullable=False)
    duration_years: Mapped[int] = mapped_column(Integer, default=4, nullable=False)

    department: Mapped["Department"] = relationship("Department", back_populates="programs")
    batches: Mapped[list["Batch"]] = relationship(
        "Batch", back_populates="program", cascade="all, delete-orphan", lazy="selectin"
    )


class Batch(BaseModel):
    __tablename__ = "batches"

    program_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    start_year: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)

    program: Mapped["Program"] = relationship("Program", back_populates="batches")

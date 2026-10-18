import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from campusflow.bedrock.db.base import BaseModel


class Course(BaseModel):
    __tablename__ = "courses"

    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("departments.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    credits: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    offerings: Mapped[list["CourseOffering"]] = relationship(
        "CourseOffering", back_populates="course", cascade="all, delete-orphan", lazy="selectin"
    )


class CourseOffering(BaseModel):
    __tablename__ = "course_offerings"

    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    academic_term_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("academic_terms.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("batches.id", ondelete="SET NULL"), index=True, nullable=True
    )
    section: Mapped[str] = mapped_column(String(16), default="A", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)

    course: Mapped["Course"] = relationship("Course", back_populates="offerings", lazy="joined")
    faculty_assignments: Mapped[list["FacultyAssignment"]] = relationship(
        "FacultyAssignment",
        back_populates="offering",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class FacultyAssignment(BaseModel):
    __tablename__ = "faculty_assignments"

    course_offering_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    faculty_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(32), default="primary", nullable=False)

    # A lecturer is assigned to a section at most once. The application already
    # checked before inserting, but only the database can hold this under
    # concurrency; a double-click or a retried request must not create a second
    # assignment row (which would double-count teaching scope).
    __table_args__ = (
        UniqueConstraint(
            "course_offering_id",
            "faculty_id",
            name="uq_faculty_assignment_offering_faculty",
        ),
    )

    offering: Mapped["CourseOffering"] = relationship(
        "CourseOffering", back_populates="faculty_assignments"
    )

from datetime import date

from sqlalchemy import Boolean, Date, String
from sqlalchemy.orm import Mapped, mapped_column

from campusflow.bedrock.db.base import BaseModel


class AcademicTerm(BaseModel):
    __tablename__ = "academic_terms"

    name: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    term_type: Mapped[str] = mapped_column(String(32), default="semester", nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

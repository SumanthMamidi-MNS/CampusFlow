from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from campusflow.bedrock.db.base import BaseModel, SoftDeleteMixin
from campusflow.bedrock.rbac.models import UserRole


class User(BaseModel, SoftDeleteMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), default="active", nullable=False
    )  # pending, active, inactive

    user_roles: Mapped[list[UserRole]] = relationship(
        "UserRole", lazy="selectin", cascade="all, delete-orphan"
    )

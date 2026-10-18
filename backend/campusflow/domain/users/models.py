from sqlalchemy import Boolean, Integer, String
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

    # Stable student identity. The business key is the *normalised* registration
    # number (see ``service.normalize_registration_number``): trimmed, internal
    # whitespace collapsed, uppercased. It is unique *when present* — staff and
    # legacy accounts legitimately have none, and several NULLs are allowed.
    registration_number: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True, nullable=True
    )
    admission_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Set when an account is created with a temporary credential (roster import,
    # bulk provisioning). The password itself is never stored in plain text and
    # never appears in an import report, a log or an audit record; the account
    # onboards through the institution's password-reset flow, which is the only
    # path that can set the first real password.
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    user_roles: Mapped[list[UserRole]] = relationship(
        "UserRole", lazy="selectin", cascade="all, delete-orphan"
    )

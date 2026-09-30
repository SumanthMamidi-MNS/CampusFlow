import uuid

from sqlalchemy import Boolean, Column, ForeignKey, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

from campusflow.bedrock.db.base import Base, BaseModel

# Association table for Role <-> Permission
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Role(BaseModel):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    permissions: Mapped[list["Permission"]] = relationship(
        "Permission",
        secondary=role_permissions,
        lazy="selectin",
    )


class Permission(BaseModel):
    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    module: Mapped[str] = mapped_column(String(64), index=True, nullable=False)


class UserRole(BaseModel):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), index=True, nullable=False
    )
    scope_type: Mapped[str] = mapped_column(String(64), default="institution", nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(index=True, nullable=True)

    role: Mapped["Role"] = relationship("Role", lazy="joined")

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from campusflow.bedrock.db.base import BaseModel


class AuditLog(BaseModel):
    __tablename__ = "audit_logs"

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(index=True, nullable=True)
    user_email: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    extra_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

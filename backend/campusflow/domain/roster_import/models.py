import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from campusflow.bedrock.db.base import BaseModel


class RosterImportBatch(BaseModel):
    """One spreadsheet import, staged and then committed.

    The two-phase shape is the point: the file is parsed and validated into
    ``staged_rows`` without touching a single account, the operator sees the
    summary and the per-row resolutions, and only an explicit commit writes
    anything. ``idempotency_key`` makes a retried or duplicated submit return the
    original comparison instead of importing twice.

    ``staged_rows`` deliberately holds no credentials — only normalized
    identifiers, the planned action and any problem with the row.
    """

    __tablename__ = "roster_import_batches"

    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # student | lecturer
    status: Mapped[str] = mapped_column(
        String(16), default="previewed", nullable=False
    )  # previewed | committed | failed
    source_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    course_offering_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("course_offerings.id", ondelete="SET NULL"), index=True, nullable=True
    )
    column_mapping: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    summary: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    staged_rows: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(
        String(128), unique=True, index=True, nullable=False
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    committed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

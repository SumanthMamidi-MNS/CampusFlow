"""Roster import API: preview, commit, report.

Every route requires an import capability **and** (when a section is targeted)
passes the offering-scope kernel, so a lecturer can only import into a section
they manage.
"""

import json
import uuid

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import ValidationError
from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_any_permission
from campusflow.domain.roster_import.service import (
    commit_import,
    list_imports,
    preview_import,
    render_report_csv,
)
from campusflow.domain.users.models import User

router = APIRouter(prefix="/roster-imports", tags=["roster-imports"])

_IMPORT_GATE = require_any_permission(
    "roster:import", "users:bulk_import", "enrollments:manage"
)


def _serialize(row) -> dict:
    return {
        "id": str(row.id),
        "kind": row.kind,
        "status": row.status,
        "source_filename": row.source_filename,
        "course_offering_id": str(row.course_offering_id) if row.course_offering_id else None,
        "column_mapping": row.column_mapping,
        "summary": row.summary,
        "idempotency_key": row.idempotency_key,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "committed_at": row.committed_at.isoformat() if row.committed_at else None,
    }


@router.get("")
async def list_roster_imports(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_IMPORT_GATE),
):
    batches = await list_imports(db, limit=limit)
    return success_response([_serialize(b) for b in batches])


@router.post("/preview")
async def preview_roster_import(
    file: UploadFile = File(...),
    kind: str = Form("student"),
    offering_id: uuid.UUID | None = Form(None),
    mapping: str | None = Form(None),
    idempotency_key: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_IMPORT_GATE),
):
    """Stage an import and report exactly what would happen. Writes no accounts."""
    parsed_mapping: dict[str, str] | None = None
    if mapping:
        try:
            parsed_mapping = json.loads(mapping)
        except json.JSONDecodeError as exc:
            raise ValidationError("The column mapping must be a JSON object.") from exc
        if not isinstance(parsed_mapping, dict):
            raise ValidationError("The column mapping must be a JSON object.")

    content = await file.read()
    batch = await preview_import(
        db,
        kind=kind,
        filename=file.filename,
        content=content,
        offering_id=offering_id,
        mapping=parsed_mapping,
        idempotency_key=idempotency_key,
        current_user=current_user,
    )
    payload = _serialize(batch)
    payload["rows"] = batch.staged_rows
    return success_response(payload)


@router.post("/{batch_id}/commit")
async def commit_roster_import(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_IMPORT_GATE),
):
    """Write the staged rows in one transaction. Repeating a commit is a no-op."""
    batch = await commit_import(db, batch_id=batch_id, current_user=current_user)
    payload = _serialize(batch)
    payload["rows"] = batch.staged_rows
    return success_response(payload)


@router.get("/{batch_id}/report")
async def download_roster_report(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_IMPORT_GATE),
):
    from campusflow.domain.roster_import.models import RosterImportBatch

    batch = await db.get(RosterImportBatch, batch_id)
    if batch is None:
        raise ValidationError("Roster import batch not found.")
    csv_text = render_report_csv(batch)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="roster-report-{batch_id}.csv"'
        },
    )

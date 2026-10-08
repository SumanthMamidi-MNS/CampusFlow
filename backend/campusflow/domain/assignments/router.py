import uuid

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.assignments.schemas import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentSubmissionResponse,
    AssignmentUpdate,
    GradeSubmissionRequest,
    SubmissionGradeResponse,
    SubmissionTextCreate,
)
from campusflow.domain.assignments.service import (
    create_assignment,
    delete_assignment,
    download_submission_file,
    export_course_gradebook_csv,
    get_assignment,
    get_course_gradebook,
    get_my_course_grades,
    get_my_submission,
    grade_submission,
    list_assignments,
    list_my_assignments,
    list_submissions,
    submit_assignment,
    update_assignment,
)
from campusflow.domain.users.models import User

router = APIRouter(tags=["assignments"])


# ── Assignments Endpoints ───────────────────────────────────────────────────
@router.get("/course-offerings/{offering_id}/assignments")
async def list_assignments_endpoint(
    offering_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    assignments = await list_assignments(db, course_offering_id=offering_id, current_user=current_user)
    return success_response([a.model_dump(mode="json") for a in assignments])


@router.get("/assignments/me")
async def list_my_assignments_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Assignments across every offering the current user participates in."""
    assignments = await list_my_assignments(db, current_user=current_user)
    return success_response([a.model_dump(mode="json") for a in assignments])


@router.post("/course-offerings/{offering_id}/assignments")
async def create_assignment_endpoint(
    offering_id: uuid.UUID,
    payload: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assignments:create")),
):
    payload.course_offering_id = offering_id
    assignment = await create_assignment(db, payload=payload, current_user=current_user)
    return success_response(AssignmentResponse.model_validate(assignment).model_dump(mode="json"))


@router.get("/assignments/{assignment_id}")
async def get_assignment_endpoint(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    assignment = await get_assignment(db, assignment_id=assignment_id, current_user=current_user)
    return success_response(assignment.model_dump(mode="json"))


@router.patch("/assignments/{assignment_id}")
async def update_assignment_endpoint(
    assignment_id: uuid.UUID,
    payload: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assignments:create")),
):
    assignment = await update_assignment(db, assignment_id=assignment_id, payload=payload, current_user=current_user)
    return success_response(AssignmentResponse.model_validate(assignment).model_dump(mode="json"))


@router.delete("/assignments/{assignment_id}")
async def delete_assignment_endpoint(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assignments:create")),
):
    await delete_assignment(db, assignment_id=assignment_id, current_user=current_user)
    return success_response({"deleted": True})


# ── Submissions Endpoints ───────────────────────────────────────────────────
@router.post("/assignments/{assignment_id}/submit")
async def submit_text_assignment_endpoint(
    assignment_id: uuid.UUID,
    payload: SubmissionTextCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assignments:submit")),
):
    submission = await submit_assignment(
        db=db,
        assignment_id=assignment_id,
        current_user=current_user,
        content_text=payload.content_text,
    )
    return success_response(AssignmentSubmissionResponse.model_validate(submission).model_dump(mode="json"))


@router.post("/assignments/{assignment_id}/submit-file")
async def submit_file_assignment_endpoint(
    assignment_id: uuid.UUID,
    content_text: str | None = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assignments:submit")),
):
    file_bytes = await file.read()
    submission = await submit_assignment(
        db=db,
        assignment_id=assignment_id,
        current_user=current_user,
        content_text=content_text,
        file_bytes=file_bytes,
        filename=file.filename or "submission.bin",
        mime_type=file.content_type or "application/octet-stream",
    )
    return success_response(AssignmentSubmissionResponse.model_validate(submission).model_dump(mode="json"))


@router.get("/assignments/{assignment_id}/my-submission")
async def get_my_submission_endpoint(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    sub = await get_my_submission(db, assignment_id=assignment_id, current_user=current_user)
    if not sub:
        return success_response(None)
    return success_response(AssignmentSubmissionResponse.model_validate(sub).model_dump(mode="json"))


@router.get("/assignments/{assignment_id}/submissions")
async def list_submissions_endpoint(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assignments:grade")),
):
    subs = await list_submissions(db, assignment_id=assignment_id)
    items = []
    for s in subs:
        resp = AssignmentSubmissionResponse.model_validate(s)
        if s.student:
            resp.student_name = f"{s.student.first_name} {s.student.last_name}"
            resp.student_email = s.student.email
        if s.grade:
            resp.grade = SubmissionGradeResponse.model_validate(s.grade)
        items.append(resp.model_dump(mode="json"))
    return success_response(items)


@router.get("/submissions/{submission_id}/download")
async def download_submission_endpoint(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    file_bytes, filename, mime_type = await download_submission_file(
        db=db, submission_id=submission_id, current_user=current_user
    )
    return Response(
        content=file_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Grading Endpoints ───────────────────────────────────────────────────────
@router.post("/submissions/{submission_id}/grade")
async def grade_submission_endpoint(
    submission_id: uuid.UUID,
    payload: GradeSubmissionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assignments:grade")),
):
    grade = await grade_submission(
        db=db, submission_id=submission_id, payload=payload, current_user=current_user
    )
    return success_response(SubmissionGradeResponse.model_validate(grade).model_dump(mode="json"))


# ── Gradebook Endpoints ────────────────────────────────────────────────────
@router.get("/course-offerings/{offering_id}/gradebook")
async def get_gradebook_endpoint(
    offering_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assignments:grade")),
):
    """Cohort gradebook for the instructors and administrators of this offering."""
    gb = await get_course_gradebook(db, course_offering_id=offering_id, current_user=current_user)
    return success_response(gb.model_dump(mode="json"))


@router.get("/course-offerings/{offering_id}/my-grades")
async def get_my_grades_endpoint(
    offering_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """The caller's own marks in this offering. Never returns cohort data."""
    grades = await get_my_course_grades(
        db, course_offering_id=offering_id, student_user=current_user
    )
    return success_response(grades.model_dump(mode="json"))


@router.get("/course-offerings/{offering_id}/gradebook/export")
async def export_gradebook_endpoint(
    offering_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("assignments:grade")),
):
    csv_content = await export_course_gradebook_csv(
        db, course_offering_id=offering_id, current_user=current_user
    )
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="gradebook_{offering_id}.csv"'},
    )

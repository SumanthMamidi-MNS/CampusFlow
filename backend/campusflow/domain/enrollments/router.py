import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.enrollments.schemas import EnrollStudentRequest
from campusflow.domain.enrollments.service import (
    bulk_enroll_students,
    drop_student,
    enroll_student,
    get_enrollment_response,
    list_enrolled_students,
)
from campusflow.domain.users.models import User

router = APIRouter(prefix="/course-offerings/{offering_id}/enrollments", tags=["enrollments"])


@router.get("")
async def get_enrolled_students_endpoint(
    offering_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    students = await list_enrolled_students(db, offering_id)
    return success_response([s.model_dump(mode="json") for s in students])


@router.post("")
async def enroll_student_endpoint(
    offering_id: uuid.UUID,
    payload: EnrollStudentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("enrollments:manage")),
):
    await enroll_student(db, offering_id, payload.student_id)
    response = await get_enrollment_response(db, offering_id, payload.student_id)
    return success_response(response.model_dump(mode="json"))


@router.delete("/{student_id}")
async def drop_student_endpoint(
    offering_id: uuid.UUID,
    student_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("enrollments:manage")),
):
    await drop_student(db, offering_id, student_id)
    return success_response({"message": "Student successfully dropped from course offering."})


@router.post("/bulk")
async def bulk_enroll_students_endpoint(
    offering_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("enrollments:manage")),
):
    content = await file.read()
    csv_text = content.decode("utf-8-sig", errors="ignore")
    result = await bulk_enroll_students(db, offering_id, csv_text)
    return success_response(result.model_dump(mode="json"))

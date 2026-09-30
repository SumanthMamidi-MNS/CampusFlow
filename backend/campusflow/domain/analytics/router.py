import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.analytics.service import (
    get_course_analytics,
    get_exam_analytics,
    get_institutional_overview,
    get_student_dashboard_analytics,
)
from campusflow.domain.users.models import User

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
async def get_overview_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("analytics:view")),
):
    """Institutional KPI overview for administrators and leadership."""
    data = await get_institutional_overview(db)
    return success_response(data.model_dump(mode="json"))


@router.get("/courses/{course_offering_id}")
async def get_course_analytics_endpoint(
    course_offering_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Course-level performance metrics, assignment completion, and grade distribution."""
    data = await get_course_analytics(db, course_offering_id)
    return success_response(data.model_dump(mode="json"))


@router.get("/exams/{exam_id}")
async def get_exam_analytics_endpoint(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:grade")),
):
    """Detailed exam performance analytics, score brackets, and proctoring stats."""
    data = await get_exam_analytics(db, exam_id)
    return success_response(data.model_dump(mode="json"))


@router.get("/student/me")
async def get_student_dashboard_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Personal performance metrics, pending tasks, and recent grades for the logged in student."""
    data = await get_student_dashboard_analytics(db, current_user.id)
    return success_response(data.model_dump(mode="json"))

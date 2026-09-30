import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.courses.schemas import (
    AssignFacultyRequest,
    CourseCreate,
    CourseOfferingCreate,
    CourseResponse,
)
from campusflow.domain.courses.service import (
    assign_faculty,
    create_course,
    create_course_offering,
    get_course,
    get_course_offering,
    list_course_offerings,
    list_courses,
    unassign_faculty,
)
from campusflow.domain.users.models import User

router = APIRouter(tags=["courses"])


# ── Courses ─────────────────────────────────────────────────────────────────
@router.get("/courses")
async def get_courses_endpoint(
    department_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("courses:read")),
):
    courses = await list_courses(db, department_id=department_id)
    return success_response([c.model_dump(mode="json") for c in courses])


@router.post("/courses")
async def create_course_endpoint(
    payload: CourseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("courses:create")),
):
    course = await create_course(db, payload)
    return success_response(CourseResponse.model_validate(course).model_dump(mode="json"))


@router.get("/courses/{course_id}")
async def get_course_endpoint(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("courses:read")),
):
    course = await get_course(db, course_id)
    return success_response(CourseResponse.model_validate(course).model_dump(mode="json"))


# ── Course Offerings ────────────────────────────────────────────────────────
@router.get("/course-offerings")
async def get_course_offerings_endpoint(
    term_id: uuid.UUID | None = Query(None),
    course_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    offerings = await list_course_offerings(
        db, user=current_user, term_id=term_id, course_id=course_id
    )
    return success_response([o.model_dump(mode="json") for o in offerings])


@router.post("/course-offerings")
async def create_course_offering_endpoint(
    payload: CourseOfferingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("courses:create")),
):
    offering = await create_course_offering(db, payload)
    return success_response(
        {"id": str(offering.id), "section": offering.section, "status": offering.status}
    )


@router.get("/course-offerings/{offering_id}")
async def get_course_offering_endpoint(
    offering_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    off = await get_course_offering(db, offering_id)
    return success_response(
        {
            "id": str(off.id),
            "course_id": str(off.course_id),
            "course_title": off.course.title if off.course else None,
            "course_code": off.course.code if off.course else None,
            "academic_term_id": str(off.academic_term_id),
            "batch_id": str(off.batch_id) if off.batch_id else None,
            "section": off.section,
            "status": off.status,
        }
    )


@router.post("/course-offerings/{offering_id}/faculty")
async def assign_faculty_endpoint(
    offering_id: uuid.UUID,
    payload: AssignFacultyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("courses:create")),
):
    await assign_faculty(db, offering_id, payload.faculty_id, payload.role)
    return success_response({"message": "Faculty member assigned successfully."})


@router.delete("/course-offerings/{offering_id}/faculty/{faculty_id}")
async def unassign_faculty_endpoint(
    offering_id: uuid.UUID,
    faculty_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("courses:create")),
):
    await unassign_faculty(db, offering_id, faculty_id)
    return success_response({"message": "Faculty member unassigned successfully."})

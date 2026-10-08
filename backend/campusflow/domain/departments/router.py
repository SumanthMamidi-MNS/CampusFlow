import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.departments.schemas import (
    AcademicTermCreate,
    AcademicTermResponse,
    BatchCreate,
    BatchResponse,
    DepartmentCreate,
    DepartmentResponse,
    ProgramCreate,
    ProgramResponse,
)
from campusflow.domain.departments.service import (
    create_academic_term,
    create_batch,
    create_department,
    create_program,
    get_department,
    list_academic_terms,
    list_batches,
    list_departments,
    list_programs,
)
from campusflow.domain.users.models import User

router = APIRouter(tags=["academic-structure"])


# Departments
@router.get("/departments")
async def get_departments_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    depts = await list_departments(db)
    return success_response(
        [DepartmentResponse.model_validate(d).model_dump(mode="json") for d in depts]
    )


@router.post("/departments")
async def create_department_endpoint(
    payload: DepartmentCreate,
    current_user: User = Depends(require_permission("departments:manage")),
    db: AsyncSession = Depends(get_db),
):
    dept = await create_department(db, payload)
    return success_response(DepartmentResponse.model_validate(dept).model_dump(mode="json"))


@router.get("/departments/{dept_id}")
async def get_department_endpoint(
    dept_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    dept = await get_department(db, dept_id)
    return success_response(DepartmentResponse.model_validate(dept).model_dump(mode="json"))


# Programs
@router.get("/programs")
async def get_programs_endpoint(
    department_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    progs = await list_programs(db, department_id=department_id)
    return success_response(
        [ProgramResponse.model_validate(p).model_dump(mode="json") for p in progs]
    )


@router.post("/programs")
async def create_program_endpoint(
    payload: ProgramCreate,
    current_user: User = Depends(require_permission("departments:manage")),
    db: AsyncSession = Depends(get_db),
):
    prog = await create_program(db, payload)
    return success_response(ProgramResponse.model_validate(prog).model_dump(mode="json"))


# Batches
@router.get("/batches")
async def get_batches_endpoint(
    program_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    batches = await list_batches(db, program_id=program_id)
    return success_response(
        [BatchResponse.model_validate(b).model_dump(mode="json") for b in batches]
    )


@router.post("/batches")
async def create_batch_endpoint(
    payload: BatchCreate,
    current_user: User = Depends(require_permission("departments:manage")),
    db: AsyncSession = Depends(get_db),
):
    batch = await create_batch(db, payload)
    return success_response(BatchResponse.model_validate(batch).model_dump(mode="json"))


# Academic Terms
@router.get("/academic-terms")
async def get_academic_terms_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    terms = await list_academic_terms(db)
    return success_response(
        [AcademicTermResponse.model_validate(t).model_dump(mode="json") for t in terms]
    )


@router.post("/academic-terms")
async def create_academic_term_endpoint(
    payload: AcademicTermCreate,
    current_user: User = Depends(require_permission("departments:manage")),
    db: AsyncSession = Depends(get_db),
):
    term = await create_academic_term(db, payload)
    return success_response(AcademicTermResponse.model_validate(term).model_dump(mode="json"))

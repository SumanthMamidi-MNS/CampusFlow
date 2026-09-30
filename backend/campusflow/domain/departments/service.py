import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import ConflictError, NotFoundError
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.departments.models import Batch, Department, Program
from campusflow.domain.departments.schemas import (
    AcademicTermCreate,
    BatchCreate,
    DepartmentCreate,
    ProgramCreate,
)


# ── Departments ─────────────────────────────────────────────────────────────
async def create_department(db: AsyncSession, payload: DepartmentCreate) -> Department:
    existing = await db.execute(select(Department).where(Department.code == payload.code.upper()))
    if existing.scalar_one_or_none():
        raise ConflictError(f"Department code '{payload.code}' already exists.")

    dept = Department(
        name=payload.name,
        code=payload.code.upper(),
        description=payload.description,
        head_id=payload.head_id,
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept


async def list_departments(db: AsyncSession) -> list[Department]:
    res = await db.execute(select(Department).order_by(Department.name))
    return list(res.scalars().all())


async def get_department(db: AsyncSession, dept_id: uuid.UUID) -> Department:
    res = await db.execute(select(Department).where(Department.id == dept_id))
    dept = res.scalar_one_or_none()
    if not dept:
        raise NotFoundError("Department not found.")
    return dept


# ── Programs ────────────────────────────────────────────────────────────────
async def create_program(db: AsyncSession, payload: ProgramCreate) -> Program:
    await get_department(db, payload.department_id)
    existing = await db.execute(select(Program).where(Program.code == payload.code.upper()))
    if existing.scalar_one_or_none():
        raise ConflictError(f"Program code '{payload.code}' already exists.")

    prog = Program(
        name=payload.name,
        code=payload.code.upper(),
        department_id=payload.department_id,
        degree_type=payload.degree_type,
        duration_years=payload.duration_years,
    )
    db.add(prog)
    await db.commit()
    await db.refresh(prog)
    return prog


async def list_programs(db: AsyncSession, department_id: uuid.UUID | None = None) -> list[Program]:
    query = select(Program)
    if department_id:
        query = query.where(Program.department_id == department_id)
    res = await db.execute(query.order_by(Program.name))
    return list(res.scalars().all())


# ── Batches ─────────────────────────────────────────────────────────────────
async def create_batch(db: AsyncSession, payload: BatchCreate) -> Batch:
    batch = Batch(
        program_id=payload.program_id,
        start_year=payload.start_year,
        label=payload.label,
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    return batch


async def list_batches(db: AsyncSession, program_id: uuid.UUID | None = None) -> list[Batch]:
    query = select(Batch)
    if program_id:
        query = query.where(Batch.program_id == program_id)
    res = await db.execute(query.order_by(Batch.start_year.desc()))
    return list(res.scalars().all())


# ── Academic Terms ──────────────────────────────────────────────────────────
async def create_academic_term(db: AsyncSession, payload: AcademicTermCreate) -> AcademicTerm:
    term = AcademicTerm(
        name=payload.name,
        term_type=payload.term_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_current=payload.is_current,
    )
    db.add(term)
    await db.commit()
    await db.refresh(term)
    return term


async def list_academic_terms(db: AsyncSession) -> list[AcademicTerm]:
    res = await db.execute(select(AcademicTerm).order_by(AcademicTerm.start_date.desc()))
    return list(res.scalars().all())

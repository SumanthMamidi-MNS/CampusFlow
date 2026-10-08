import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from campusflow.bedrock.api.errors import ConflictError, NotFoundError
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.courses.schemas import (
    CourseCreate,
    CourseOfferingCreate,
    CourseOfferingResponse,
    CourseResponse,
    FacultyAssignmentResponse,
)
from campusflow.domain.users.models import User


# ── Courses ─────────────────────────────────────────────────────────────────
async def create_course(db: AsyncSession, payload: CourseCreate) -> Course:
    existing = await db.execute(select(Course).where(Course.code == payload.code.upper()))
    if existing.scalar_one_or_none():
        raise ConflictError(f"Course code '{payload.code}' already exists.")

    course = Course(
        code=payload.code.upper(),
        title=payload.title,
        department_id=payload.department_id,
        credits=payload.credits,
        description=payload.description,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course


async def list_courses(
    db: AsyncSession, department_id: uuid.UUID | None = None
) -> list[CourseResponse]:
    query = select(Course)
    if department_id:
        query = query.where(Course.department_id == department_id)
    res = await db.execute(query.order_by(Course.code))
    courses = res.scalars().all()
    return [CourseResponse.model_validate(c) for c in courses]


async def get_course(db: AsyncSession, course_id: uuid.UUID) -> Course:
    res = await db.execute(select(Course).where(Course.id == course_id))
    course = res.scalar_one_or_none()
    if not course:
        raise NotFoundError("Course not found.")
    return course


# ── Course Offerings ────────────────────────────────────────────────────────
async def create_course_offering(db: AsyncSession, payload: CourseOfferingCreate) -> CourseOffering:
    await get_course(db, payload.course_id)

    offering = CourseOffering(
        course_id=payload.course_id,
        academic_term_id=payload.academic_term_id,
        batch_id=payload.batch_id,
        section=payload.section.upper(),
        status=payload.status,
    )
    db.add(offering)
    await db.flush()

    # Assign initial faculty
    for f_id in payload.faculty_ids:
        assignment = FacultyAssignment(
            course_offering_id=offering.id,
            faculty_id=f_id,
            role="primary",
        )
        db.add(assignment)

    await db.commit()
    return await get_course_offering(db, offering.id)


async def get_course_offering(db: AsyncSession, offering_id: uuid.UUID) -> CourseOffering:
    res = await db.execute(
        select(CourseOffering)
        .options(
            selectinload(CourseOffering.course), selectinload(CourseOffering.faculty_assignments)
        )
        .where(CourseOffering.id == offering_id)
    )
    offering = res.scalar_one_or_none()
    if not offering:
        raise NotFoundError("Course offering not found.")
    return offering


async def list_course_offerings(
    db: AsyncSession,
    user: User,
    term_id: uuid.UUID | None = None,
    course_id: uuid.UUID | None = None,
) -> list[CourseOfferingResponse]:
    from campusflow.domain.courses.access import visible_offering_ids

    query = select(CourseOffering).options(
        selectinload(CourseOffering.course),
        selectinload(CourseOffering.faculty_assignments),
    )

    if term_id:
        query = query.where(CourseOffering.academic_term_id == term_id)
    if course_id:
        query = query.where(CourseOffering.course_id == course_id)

    # One kernel answers "who sees which offerings" for every role. The old
    # role-name elif-chain fell through for department heads (and for any user
    # with no matching role), leaving the query unscoped — i.e. institution
    # wide. ``None`` means "every offering" (administrators, examination
    # bureau); everyone else gets the explicit id list: taught + headed +
    # enrolled, or nothing at all.
    permitted = await visible_offering_ids(db, user, allow_exam_bureau=True)
    if permitted is None:
        pass  # Institution-wide readers see every offering.
    else:
        query = query.where(CourseOffering.id.in_(permitted))

    res = await db.execute(query.order_by(CourseOffering.created_at.desc()))
    offerings = res.scalars().all()

    results: list[CourseOfferingResponse] = []
    for off in offerings:
        faculty_details: list[FacultyAssignmentResponse] = []
        for fa in off.faculty_assignments:
            u_res = await db.execute(select(User).where(User.id == fa.faculty_id))
            u = u_res.scalar_one_or_none()
            faculty_details.append(
                FacultyAssignmentResponse(
                    faculty_id=fa.faculty_id,
                    role=fa.role,
                    first_name=u.first_name if u else None,
                    last_name=u.last_name if u else None,
                    email=u.email if u else None,
                )
            )

        results.append(
            CourseOfferingResponse(
                id=off.id,
                course_id=off.course_id,
                academic_term_id=off.academic_term_id,
                batch_id=off.batch_id,
                section=off.section,
                status=off.status,
                course_title=off.course.title if off.course else None,
                course_code=off.course.code if off.course else None,
                faculty=faculty_details,
                created_at=off.created_at,
            )
        )

    return results


async def assign_faculty(
    db: AsyncSession, offering_id: uuid.UUID, faculty_id: uuid.UUID, role: str = "primary"
) -> None:
    await get_course_offering(db, offering_id)
    existing = await db.execute(
        select(FacultyAssignment).where(
            FacultyAssignment.course_offering_id == offering_id,
            FacultyAssignment.faculty_id == faculty_id,
        )
    )
    if existing.scalar_one_or_none():
        return

    fa = FacultyAssignment(
        course_offering_id=offering_id,
        faculty_id=faculty_id,
        role=role,
    )
    db.add(fa)
    await db.commit()


async def unassign_faculty(db: AsyncSession, offering_id: uuid.UUID, faculty_id: uuid.UUID) -> None:
    res = await db.execute(
        select(FacultyAssignment).where(
            FacultyAssignment.course_offering_id == offering_id,
            FacultyAssignment.faculty_id == faculty_id,
        )
    )
    fa = res.scalar_one_or_none()
    if fa:
        await db.delete(fa)
        await db.commit()

"""Offering-scoped authorization — the single source of truth for data access.

A permission code tells us *what* a user may do (``exams:grade``); it never
tells us *whose* data they may touch. Every domain that stores rows against a
``course_offering_id`` must route its access decisions through this module so
that one implementation answers ownership questions everywhere.

Roles and their reach:

* ``super_admin`` / ``admin`` — the whole institution.
* ``department_head`` — offerings whose course belongs to a department they head.
* ``exam_controller`` — institution-wide, but **only** for exam-bureau objects
  (rosters, exam authoring, exam analytics). Callers opt in explicitly with
  ``allow_exam_bureau=True``; nothing gets bureau access by accident.
* ``faculty`` — offerings they are assigned to teach.
* ``student`` — offerings they are actively enrolled in.

Resource authorship is handled by callers, not here: an exam or assignment a
faculty member authored is theirs to manage even if the teaching link is
missing, so those services pass an ``owner_id`` fallback.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import AuthorizationError
from campusflow.bedrock.rbac.service import get_user_roles
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.users.models import User

# Institution-wide administration.
INSTITUTION_ROLES = frozenset({"super_admin", "admin"})
# Institution-wide for examination-bureau work only.
EXAM_BUREAU_ROLES = frozenset({"exam_controller"})
# Scoped to the department(s) they head.
DEPARTMENT_ROLES = frozenset({"department_head"})
STAFF_ROLES = INSTITUTION_ROLES | EXAM_BUREAU_ROLES | DEPARTMENT_ROLES | {"faculty"}


async def roles_for(db: AsyncSession, user: User) -> set[str]:
    """Return the user's role names as a set (never ``None``)."""
    return set(await get_user_roles(db, user.id))


async def _is_institution_admin(roles: set[str]) -> bool:
    return bool(roles & INSTITUTION_ROLES)


async def headed_department_ids(db: AsyncSession, user: User) -> set[uuid.UUID]:
    """Departments this user heads."""
    res = await db.execute(select(Department.id).where(Department.head_id == user.id))
    return set(res.scalars().all())


async def teaching_offering_ids(db: AsyncSession, user: User) -> set[uuid.UUID]:
    """Offerings this user is assigned to teach."""
    res = await db.execute(
        select(FacultyAssignment.course_offering_id).where(
            FacultyAssignment.faculty_id == user.id
        )
    )
    return set(res.scalars().all())


async def enrolled_offering_ids(
    db: AsyncSession, user: User, *, active_only: bool = True
) -> set[uuid.UUID]:
    """Offerings this user is (or was) enrolled in."""
    query = select(Enrollment.course_offering_id).where(Enrollment.student_id == user.id)
    if active_only:
        query = query.where(Enrollment.status == "enrolled")
    res = await db.execute(query)
    return set(res.scalars().all())


async def offering_department_id(
    db: AsyncSession, offering_id: uuid.UUID
) -> uuid.UUID | None:
    """The department that owns the course behind an offering."""
    res = await db.execute(
        select(Course.department_id)
        .join(CourseOffering, CourseOffering.course_id == Course.id)
        .where(CourseOffering.id == offering_id)
    )
    return res.scalar_one_or_none()


async def can_manage_offering(
    db: AsyncSession,
    user: User,
    offering_id: uuid.UUID,
    *,
    allow_exam_bureau: bool = False,
    roles: set[str] | None = None,
) -> bool:
    """True when the user may author, grade or administer work in an offering.

    Pass ``roles`` when the caller already resolved them to avoid a second query.
    """
    resolved = roles if roles is not None else await roles_for(db, user)

    if resolved & INSTITUTION_ROLES:
        return True
    if allow_exam_bureau and resolved & EXAM_BUREAU_ROLES:
        return True
    if resolved & DEPARTMENT_ROLES:
        department_id = await offering_department_id(db, offering_id)
        if department_id is not None and department_id in await headed_department_ids(db, user):
            return True
    if not resolved & {"faculty"}:
        return False
    return offering_id in await teaching_offering_ids(db, user)


async def can_view_offering(
    db: AsyncSession,
    user: User,
    offering_id: uuid.UUID,
    *,
    allow_exam_bureau: bool = False,
    roles: set[str] | None = None,
) -> bool:
    """True when the user may read offering-scoped content.

    Management rights imply view rights; every other reader must be actively
    enrolled (a dropped enrolment is not a reader).
    """
    if await can_manage_offering(
        db, user, offering_id, allow_exam_bureau=allow_exam_bureau, roles=roles
    ):
        return True
    return offering_id in await enrolled_offering_ids(db, user)


def _denied(message: str, purpose: str) -> AuthorizationError:
    return AuthorizationError(f"{message} (required scope: {purpose}).")


async def assert_can_manage_offering(
    db: AsyncSession,
    user: User,
    offering_id: uuid.UUID,
    *,
    purpose: str,
    allow_exam_bureau: bool = False,
) -> None:
    """Raise 403 unless the user manages this offering."""
    if not await can_manage_offering(
        db, user, offering_id, allow_exam_bureau=allow_exam_bureau
    ):
        raise _denied("You do not have teaching or administrative access to this course offering", purpose)


async def assert_can_view_offering(
    db: AsyncSession,
    user: User,
    offering_id: uuid.UUID,
    *,
    purpose: str,
    allow_exam_bureau: bool = False,
) -> None:
    """Raise 403 unless the user manages or is enrolled in this offering."""
    if not await can_view_offering(
        db, user, offering_id, allow_exam_bureau=allow_exam_bureau
    ):
        raise _denied("You do not have access to this course offering", purpose)


async def visible_offering_ids(
    db: AsyncSession,
    user: User,
    *,
    include_teaching: bool = True,
    include_enrolled: bool = True,
    allow_exam_bureau: bool = False,
) -> set[uuid.UUID] | None:
    """The offering ids a user may see, or ``None`` meaning "everything".

    ``None`` is returned for institution administrators (and, when the caller
    opts in with ``allow_exam_bureau``, for the examination bureau) so callers
    can skip the ``IN (...)`` filter entirely instead of materialising every id.
    """
    roles = await roles_for(db, user)
    if roles & INSTITUTION_ROLES:
        return None
    if allow_exam_bureau and roles & EXAM_BUREAU_ROLES:
        return None

    ids: set[uuid.UUID] = set()
    if include_teaching:
        if roles & {"faculty"}:
            ids |= await teaching_offering_ids(db, user)
        if roles & DEPARTMENT_ROLES:
            headed = await headed_department_ids(db, user)
            if headed:
                res = await db.execute(
                    select(CourseOffering.id)
                    .join(Course, Course.id == CourseOffering.course_id)
                    .where(Course.department_id.in_(headed))
                )
                ids |= set(res.scalars().all())
    if include_enrolled:
        ids |= await enrolled_offering_ids(db, user)
    return ids

"""Department-scoped access for the question-bank authoring surface.

Question banks hold answer material (``is_correct``, ``accepted_answers``,
numerical tolerances), so *every* read is a staff operation and *every* read
and write is limited to the departments the caller may work in. The route
gates (``require_permission("questions:manage")``) answer *what* the caller
may do; this module, through the shared kernel in
``domain.courses.access``, answers *whose* banks they may touch. Neither the
role logic nor the department queries are re-implemented here.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import AuthorizationError
from campusflow.domain.courses.access import visible_department_ids
from campusflow.domain.users.models import User

# The examination bureau assembles papers from every department's banks, so
# question-bank access opts into bureau scope the same way examination
# authoring does. It never extends to gradebook or roster queries.
_ALLOW_EXAM_BUREAU = True


async def permitted_department_ids(db: AsyncSession, user: User) -> set[uuid.UUID] | None:
    """Departments whose banks this user may read and write.

    ``None`` means every department (institution administrators and the
    examination bureau); an empty set means none.
    """
    return await visible_department_ids(
        db, user, allow_exam_bureau=_ALLOW_EXAM_BUREAU
    )


def assert_department_permitted(
    permitted: set[uuid.UUID] | None,
    department_id: uuid.UUID | None,
    *,
    purpose: str,
) -> None:
    """Raise 403 unless ``department_id`` lies inside the permitted scope."""
    if permitted is None:
        return  # Institution-wide reader (administrator / examination bureau).
    if department_id is not None and department_id in permitted:
        return
    raise AuthorizationError(
        f"You do not have access to this question bank (required scope: {purpose})."
    )

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.config.settings import get_settings
from campusflow.domain.institution.models import Institution
from campusflow.domain.institution.schemas import InstitutionUpdate


async def get_or_create_default_institution(db: AsyncSession) -> Institution:
    """Retrieve the primary institution record or initialize the default."""
    stmt = select(Institution).order_by(Institution.created_at.asc())
    result = await db.execute(stmt)
    institution = result.scalars().first()

    if not institution:
        settings = get_settings()
        institution = Institution(
            name=settings.institution_name,
            code="CAMPUSFLOW",
            logo_url=None,
            primary_color="#2563eb",
            timezone=settings.institution_timezone,
            contact_email="admin@campusflow.edu",
            phone="+1 (555) 019-2834",
            policies={
                "allow_late_submissions": True,
                "exam_strict_proctoring": True,
                "max_login_attempts": 5,
            },
        )
        db.add(institution)
        await db.commit()
        await db.refresh(institution)

    return institution


async def update_institution(
    db: AsyncSession,
    update_data: InstitutionUpdate,
    actor_id: uuid.UUID | None = None,
) -> Institution:
    """Update institution details, branding, and system policies."""
    institution = await get_or_create_default_institution(db)

    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(institution, field, value)

    if actor_id:
        await record_audit_event(
            db,
            action="institution.updated",
            resource_type="institution",
            resource_id=str(institution.id),
            user_id=actor_id,
            changes=update_dict,
        )

    await db.commit()
    await db.refresh(institution)
    return institution

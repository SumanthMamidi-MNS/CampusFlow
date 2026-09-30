import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from campusflow.bedrock.api.errors import register_exception_handlers
from campusflow.bedrock.audit.router import router as audit_router
from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.db.session import async_session_factory
from campusflow.bedrock.middleware.request_id import RequestIDMiddleware
from campusflow.bedrock.rbac.service import seed_roles_and_permissions
from campusflow.domain.analytics.router import router as analytics_router
from campusflow.domain.announcements.router import router as announcements_router
from campusflow.domain.assignments.router import router as assignments_router
from campusflow.domain.courses.router import router as courses_router
from campusflow.domain.departments.router import router as departments_router
from campusflow.domain.enrollments.router import router as enrollments_router
from campusflow.domain.exams.router import router as exams_router
from campusflow.domain.materials.router import router as materials_router
from campusflow.domain.notifications.router import router as notifications_router
from campusflow.domain.question_banks.router import router as question_banks_router
from campusflow.domain.users.auth_router import router as auth_router
from campusflow.domain.users.router import router as users_router

logger = logging.getLogger("campusflow")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Seed roles and permissions
    try:
        async with async_session_factory() as session:
            await seed_roles_and_permissions(session)

            # Check if default super admin exists
            from campusflow.domain.users.models import User
            from campusflow.domain.users.schemas import UserCreate
            from campusflow.domain.users.service import create_user

            admin_res = await session.execute(
                select(User).where(User.email == "admin@campusflow.edu")
            )
            admin = admin_res.scalar_one_or_none()
            if not admin:
                logger.info("Creating initial superadmin user: admin@campusflow.edu")
                await create_user(
                    session,
                    UserCreate(
                        email="admin@campusflow.edu",
                        password="Admin@CampusFlow2026",
                        first_name="System",
                        last_name="Administrator",
                        roles=["super_admin", "admin"],
                        status="active",
                    ),
                )
    except Exception as exc:
        logger.warning("Database seeding skipped or deferred during startup: %s", exc)

    yield


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()

    app = FastAPI(
        title="CampusFlow",
        description="College LMS & Secure Examination Platform",
        version="0.1.0",
        docs_url="/api/docs" if settings.debug else None,
        redoc_url="/api/redoc" if settings.debug else None,
        lifespan=lifespan,
    )

    # Middleware
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Exception handlers
    register_exception_handlers(app)

    # Health check
    @app.get("/api/health", tags=["system"])
    async def health_check():
        return {"status": "healthy", "service": "campusflow"}

    # Register API v1 routers
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(users_router, prefix="/api/v1")
    app.include_router(audit_router, prefix="/api/v1")
    app.include_router(departments_router, prefix="/api/v1")
    app.include_router(courses_router, prefix="/api/v1")
    app.include_router(enrollments_router, prefix="/api/v1")
    app.include_router(materials_router, prefix="/api/v1")
    app.include_router(announcements_router, prefix="/api/v1")
    app.include_router(assignments_router, prefix="/api/v1")
    app.include_router(notifications_router, prefix="/api/v1")
    app.include_router(question_banks_router, prefix="/api/v1")
    app.include_router(exams_router, prefix="/api/v1")
    app.include_router(analytics_router, prefix="/api/v1")

    return app



app = create_app()

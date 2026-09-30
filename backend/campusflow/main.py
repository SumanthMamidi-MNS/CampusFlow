from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.middleware.request_id import RequestIDMiddleware
from campusflow.bedrock.api.errors import register_exception_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup: initialize DB pool, Redis, etc.
    yield
    # Shutdown: close connections


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

    return app


app = create_app()

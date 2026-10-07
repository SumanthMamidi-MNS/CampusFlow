import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Tests exercise the app in debug mode so the production secret guard does not
# block the suite. Must be set before the settings module is imported below.
os.environ.setdefault("DEBUG", "true")

from campusflow.bedrock.db.base import Base  # noqa: E402
from campusflow.bedrock.db.session import get_db  # noqa: E402
from campusflow.bedrock.rbac.service import seed_roles_and_permissions  # noqa: E402
from campusflow.main import create_app  # noqa: E402

# Default: fast in-memory SQLite. Set TEST_DATABASE_URL to a PostgreSQL async
# URL (e.g. postgresql+asyncpg://campusflow:campusflow@localhost:5432/campusflow_test)
# to run the same suite against the production database engine.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
IS_SQLITE = TEST_DATABASE_URL.startswith("sqlite")


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    kwargs: dict = {}
    if IS_SQLITE:
        kwargs = {
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        }
    engine = create_async_engine(TEST_DATABASE_URL, **kwargs)
    async with engine.begin() as conn:
        if IS_SQLITE:
            await conn.run_sync(Base.metadata.create_all)
        else:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine):
    async_session = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
    async with async_session() as session:
        # Seed permissions and roles for testing
        await seed_roles_and_permissions(session)
        yield session
        await session.rollback()


@pytest.fixture
def app(test_engine):
    application = create_app()

    async def override_get_db():
        async_session = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
        async with async_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    application.dependency_overrides[get_db] = override_get_db
    return application


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

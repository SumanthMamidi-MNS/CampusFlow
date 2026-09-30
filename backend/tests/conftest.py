import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from campusflow.bedrock.db.base import Base
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.service import seed_roles_and_permissions
from campusflow.main import create_app

# Use in-memory SQLite with aiosqlite for fast isolated tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
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

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    debug: bool = False
    database_url: str = "postgresql+asyncpg://campusflow:campusflow@localhost:5432/campusflow"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "change-me-in-production-use-a-strong-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    cors_origins: list[str] = ["http://localhost:5173"]
    storage_backend: str = "local"
    storage_local_path: str = "./storage"
    email_backend: str = "console"
    institution_name: str = "CampusFlow"
    institution_timezone: str = "UTC"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

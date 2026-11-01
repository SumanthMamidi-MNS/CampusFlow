from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "change-me-in-production-use-a-strong-random-secret"

# Resolve `backend/.env` from this file, not from the current working directory.
# Without this the configuration is silently lost whenever the app, Alembic or
# the seed script is launched from the repository root instead of backend/.
BACKEND_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    debug: bool = False
    # Log every SQL statement. Deliberately separate from `debug` so the console
    # stays readable during development and demonstrations.
    db_echo: bool = False
    database_url: str = "postgresql+asyncpg://campusflow:campusflow@localhost:5432/campusflow"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    cors_origins: list[str] = ["http://localhost:5173"]
    storage_backend: str = "local"
    storage_local_path: str = "./storage"
    email_backend: str = "console"
    institution_name: str = "CampusFlow"
    institution_timezone: str = "UTC"

    # Authentication rate limiting (per client IP).
    auth_rate_limit_requests: int = 20
    auth_rate_limit_window_seconds: int = 60

    # Sandboxed code execution (see campusflow.bedrock.runner).
    #   backend: "piston" (self-hosted sidecar) or "none" to disable.
    code_runner_enabled: bool = True
    code_runner_backend: str = "piston"
    code_runner_url: str = "http://localhost:2000"
    code_runner_python_version: str = "*"
    code_runner_client_timeout_seconds: float = 20.0
    code_run_max_concurrency: int = 4
    code_run_default_timeout_ms: int = 5000
    code_run_max_timeout_ms: int = 10000
    code_run_default_memory_kb: int = 131_072
    code_run_max_output_bytes: int = 65_536
    # Hard memory ceiling forwarded to the sandbox, in KB. 0 disables it and
    # lets the sandbox apply its own default. Only enable this on hosts where
    # the sandbox can actually enforce a cgroup memory cap — where it cannot,
    # requesting one makes the runner kill the process instead of executing it.
    code_run_memory_limit_kb: int = 0

    # Camera evidence frames are personal data (a downscaled still of the
    # candidate). The institution sets how long they are kept; older frames are
    # erased from the integrity trail by the retention job, while the event row
    # itself (what happened, when, how severe) is kept for review. Non-positive
    # values fall back to the finite application default; frames never persist
    # indefinitely because of an unset or mistaken zero value.
    proctoring_evidence_retention_days: int = 90

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        """Refuse to start outside debug with the shipped placeholder secret."""
        if not self.debug and self.jwt_secret_key == DEFAULT_JWT_SECRET:
            raise ValueError(
                "JWT_SECRET_KEY must be set to a strong, unique value when DEBUG is false. "
                'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

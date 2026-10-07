"""Factory and safety envelope around the configured code runner."""

import asyncio

from campusflow.bedrock.api.errors import ServiceUnavailableError
from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.runner.interface import (
    STATUS_INTERNAL_ERROR,
    STATUS_TIMEOUT,
    CodeRunner,
    ExecutionRequest,
    ExecutionResult,
)
from campusflow.bedrock.runner.piston import PistonRunner

_runner: CodeRunner | None = None
_runner_initialised = False
_semaphore: asyncio.Semaphore | None = None


def get_runner() -> CodeRunner | None:
    """Return the configured runner, or None when execution is unsupported."""
    global _runner, _runner_initialised
    if not _runner_initialised:
        settings = get_settings()
        if settings.code_runner_backend == "piston":
            _runner = PistonRunner(
                base_url=settings.code_runner_url,
                default_version=settings.code_runner_python_version,
                client_timeout_seconds=settings.code_runner_client_timeout_seconds,
            )
        else:
            _runner = None
        _runner_initialised = True
    return _runner


def reset_runner_cache() -> None:
    """Clear cached runner state (used by tests and settings changes)."""
    global _runner, _runner_initialised, _semaphore
    _runner = None
    _runner_initialised = False
    _semaphore = None


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(max(1, get_settings().code_run_max_concurrency))
    return _semaphore


async def run_code(request: ExecutionRequest) -> ExecutionResult:
    """Execute one request under the institution's concurrency and time bounds.

    Fails closed: if execution is disabled, unconfigured, or the backend cannot
    be reached, a ``ServiceUnavailableError`` is raised rather than returning a
    fabricated result.
    """
    settings = get_settings()

    if not settings.code_runner_enabled:
        raise ServiceUnavailableError(
            "Code execution is not enabled for this deployment."
        )

    runner = get_runner()
    if runner is None:
        raise ServiceUnavailableError(
            "No code execution backend is configured for this deployment."
        )

    async with _get_semaphore():
        try:
            result = await asyncio.wait_for(
                runner.run(request),
                timeout=settings.code_runner_client_timeout_seconds,
            )
        except TimeoutError:
            result = ExecutionResult(
                status=STATUS_TIMEOUT,
                timed_out=True,
                message="Execution exceeded the overall time limit.",
            )

    if result.status == STATUS_INTERNAL_ERROR:
        raise ServiceUnavailableError(
            result.message or "The code execution service is currently unavailable."
        )

    return result

"""Piston-backed code execution.

Piston (https://github.com/engineer-man/piston) runs every job inside an
``isolate`` sandbox within its own container, enforcing CPU time and memory
ceilings. CampusFlow only talks to it over HTTP; it never executes code itself.

Deployment note: the Piston container must **not** be reachable from outside the
internal network, and must be started with the Python runtime installed
(``piston`` CLI: ``piston ppman install python``).
"""

import re

import httpx

from campusflow.bedrock.runner.interface import (
    STATUS_COMPILE_ERROR,
    STATUS_INTERNAL_ERROR,
    STATUS_MEMORY_EXCEEDED,
    STATUS_RUNTIME_ERROR,
    STATUS_SUCCESS,
    STATUS_TIMEOUT,
    ExecutionLimits,
    ExecutionRequest,
    ExecutionResult,
)


def _truncate(text: str | None, limit: int) -> str:
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n…[output truncated at {limit} bytes]"


# Piston refuses budgets above its own server-side ceiling with a message like
# "run_timeout cannot exceed the configured limit of 3000". A stock Piston caps
# this at 3000 ms, so the runner recovers by retrying once within the limit
# rather than failing the request outright.
_LIMIT_MESSAGE = re.compile(r"cannot exceed the configured limit of (\d+)")


def _error_detail(response: httpx.Response) -> str:
    """Extract a human-readable cause from an error response."""
    try:
        body = response.json()
    except ValueError:
        return (response.text or "").strip()[:300]
    if isinstance(body, dict):
        for key in ("message", "error", "detail"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return value[:300]
    return str(body)[:300]


def _server_limit(message: str) -> int | None:
    match = _LIMIT_MESSAGE.search(message)
    return int(match.group(1)) if match else None


def _wall_time_ms(run_stage: dict) -> float:
    """Wall time of the run in milliseconds, or infinity when not reported."""
    value = run_stage.get("wall_time")
    return float(value) if isinstance(value, (int, float)) else float("inf")


def _killed_by_memory(
    signal: str | None,
    run_stage: dict,
    limits: ExecutionLimits,
    run_timeout_ms: int,
) -> bool:
    """Whether a signal death was the memory ceiling rather than the clock.

    ``isolate`` reports both an OOM kill and a timeout kill as ``SIGKILL``, so the
    signal alone cannot tell a candidate which ceiling they hit. A memory kill
    happens long before the time budget is spent (measured: 512 MB under a 128 MB
    cap died after 68 ms of a 10 000 ms budget), while a real timeout consumes the
    budget. ``SIGSEGV`` is isolate's allocator death and is unambiguous.
    """
    if signal == "SIGSEGV":
        return True
    if signal != "SIGKILL" or limits.memory_kb <= 0:
        return False
    return _wall_time_ms(run_stage) < run_timeout_ms * 0.9


class PistonRunner:
    """HTTP client for a self-hosted Piston execution engine."""

    def __init__(
        self,
        base_url: str,
        default_version: str = "*",
        client_timeout_seconds: float = 20.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.default_version = default_version
        self.client_timeout_seconds = client_timeout_seconds

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/api/v2/runtimes")
            return res.status_code == 200
        except httpx.HTTPError:
            return False

    def _payload(
        self, request: ExecutionRequest, *, run_timeout: int, compile_timeout: int
    ) -> dict:
        filename = request.filename or _default_filename(request.language)
        payload = {
            "language": request.language,
            "version": self.default_version,
            "files": [{"name": filename, "content": request.source}],
            "stdin": request.stdin or "",
            "run_timeout": run_timeout,
            "compile_timeout": compile_timeout,
        }
        # Only sent when explicitly configured: requesting a memory cap on a
        # host that cannot enforce it makes isolate kill the process (SIGKILL)
        # instead of running it.
        if request.limits.memory_kb > 0:
            payload["run_memory_limit"] = request.limits.memory_kb
        return payload

    async def run(self, request: ExecutionRequest) -> ExecutionResult:
        limits = request.limits
        run_timeout = limits.run_timeout_ms
        compile_timeout = limits.compile_timeout_ms

        try:
            async with httpx.AsyncClient(timeout=self.client_timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/api/v2/execute",
                    json=self._payload(
                        request, run_timeout=run_timeout, compile_timeout=compile_timeout
                    ),
                )

                if response.status_code >= 400:
                    detail = _error_detail(response)
                    ceiling = _server_limit(detail)
                    if response.status_code == 400 and ceiling is not None:
                        # Retry once inside the sandbox's own ceiling instead of
                        # failing the student's run.
                        run_timeout = min(run_timeout, ceiling)
                        compile_timeout = min(compile_timeout, ceiling)
                        response = await client.post(
                            f"{self.base_url}/api/v2/execute",
                            json=self._payload(
                                request, run_timeout=run_timeout, compile_timeout=compile_timeout
                            ),
                        )
                        if response.status_code >= 400:
                            detail = _error_detail(response)

                    if response.status_code >= 400:
                        return ExecutionResult(
                            status=STATUS_INTERNAL_ERROR,
                            message=(
                                f"The code execution service rejected the request "
                                f"(HTTP {response.status_code}): {detail}"
                            ),
                        )
        except httpx.HTTPError as exc:
            return ExecutionResult(
                status=STATUS_INTERNAL_ERROR,
                message=f"The code execution service is unreachable: {exc}",
            )

        data = response.json()
        compile_stage = data.get("compile") or {}
        run_stage = data.get("run") or {}

        compile_code = compile_stage.get("code")
        if compile_code not in (None, 0):
            return ExecutionResult(
                status=STATUS_COMPILE_ERROR,
                stdout=_truncate(compile_stage.get("stdout"), limits.max_output_bytes),
                stderr=_truncate(compile_stage.get("stderr"), limits.max_output_bytes),
                exit_code=compile_code,
            )

        stdout = _truncate(run_stage.get("stdout"), limits.max_output_bytes)
        stderr = _truncate(run_stage.get("stderr"), limits.max_output_bytes)
        code = run_stage.get("code")
        signal = run_stage.get("signal")

        if code == 0 and not signal:
            return ExecutionResult(
                status=STATUS_SUCCESS,
                stdout=stdout,
                stderr=stderr,
                exit_code=0,
            )

        # Isolate reports a killed process via a signal. Distinguish a timeout
        # (no output, killed) from a genuine runtime error where possible.
        if signal in {"SIGKILL", "SIGXCPU", "SIGSEGV"} and not stderr:
            memory_killed = _killed_by_memory(signal, run_stage, limits, run_timeout)
            return ExecutionResult(
                status=STATUS_MEMORY_EXCEEDED if memory_killed else STATUS_TIMEOUT,
                stdout=stdout,
                stderr=stderr,
                exit_code=code,
                timed_out=not memory_killed,
                message="Execution exceeded the configured memory limit."
                if memory_killed
                else "Execution exceeded the configured time limit.",
            )

        return ExecutionResult(
            status=STATUS_RUNTIME_ERROR,
            stdout=stdout,
            stderr=stderr,
            exit_code=code,
            message="The program exited with a non-zero status.",
        )


def _default_filename(language: str) -> str:
    if language in {"python", "python3"}:
        return "main.py"
    if language in {"javascript", "typescript"}:
        return "main.js"
    if language in {"c", "cpp"}:
        return "main.c" if language == "c" else "main.cpp"
    if language == "java":
        return "Main.java"
    return "main.txt"

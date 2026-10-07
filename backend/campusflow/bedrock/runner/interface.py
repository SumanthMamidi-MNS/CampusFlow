from dataclasses import dataclass, field
from typing import Protocol

# Canonical execution status values returned to callers.
STATUS_SUCCESS = "success"
STATUS_COMPILE_ERROR = "compile_error"
STATUS_RUNTIME_ERROR = "runtime_error"
STATUS_TIMEOUT = "timeout"
STATUS_MEMORY_EXCEEDED = "memory_exceeded"
STATUS_INTERNAL_ERROR = "internal_error"


@dataclass(frozen=True)
class ExecutionLimits:
    """Hard resource ceilings for a single execution."""

    run_timeout_ms: int = 5000
    compile_timeout_ms: int = 10000
    # 0 means "leave the sandbox's own memory ceiling in place". Some hosts
    # cannot enforce an isolate memory cap and kill the process outright when
    # one is requested, so sending a limit is opt-in (CODE_RUN_MEMORY_LIMIT_KB).
    memory_kb: int = 0
    max_output_bytes: int = 65_536


@dataclass
class ExecutionFile:
    name: str
    content: str


@dataclass
class ExecutionRequest:
    language: str
    source: str
    stdin: str = ""
    filename: str | None = None
    limits: ExecutionLimits = field(default_factory=ExecutionLimits)


@dataclass
class ExecutionResult:
    status: str
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    duration_ms: int | None = None
    timed_out: bool = False
    message: str | None = None


class CodeRunner(Protocol):
    """Executes untrusted source code in an isolated environment."""

    async def run(self, request: ExecutionRequest) -> ExecutionResult: ...

    async def health(self) -> bool: ...

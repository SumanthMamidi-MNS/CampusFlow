"""Project-agnostic sandboxed code execution.

CampusFlow never executes untrusted student code inside the API process. This
package defines a small ``CodeRunner`` protocol plus a concrete HTTP-backed
implementation (Piston) and a factory that fails closed when no runner is
reachable.
"""

from campusflow.bedrock.runner.interface import (
    CodeRunner,
    ExecutionFile,
    ExecutionLimits,
    ExecutionRequest,
    ExecutionResult,
)
from campusflow.bedrock.runner.service import get_runner, run_code

__all__ = [
    "CodeRunner",
    "ExecutionFile",
    "ExecutionLimits",
    "ExecutionRequest",
    "ExecutionResult",
    "get_runner",
    "run_code",
]

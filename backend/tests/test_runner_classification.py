"""Which ceiling killed the process: the clock or the memory cap.

`isolate` reports both an out-of-memory kill and a timeout as `SIGKILL`, so the
signal alone cannot tell a candidate which limit they hit. With the memory
ceiling enabled in production (D-5) this distinction is user-visible: telling a
student "you ran out of time" when they actually blew a 128 MB budget names the
wrong fault.
"""

import pytest

from campusflow.bedrock.runner.interface import ExecutionLimits
from campusflow.bedrock.runner.piston import _killed_by_memory

CAP = ExecutionLimits(run_timeout_ms=10_000, memory_kb=131_072)
NO_CAP = ExecutionLimits(run_timeout_ms=10_000, memory_kb=0)


@pytest.mark.parametrize(
    ("signal", "run_stage", "limits", "expected"),
    [
        # isolate's allocator death: unambiguous.
        ("SIGSEGV", {"wall_time": 40}, CAP, True),
        # Measured OOM under a 128 MB cap: killed after 68 ms of a 10 s budget.
        ("SIGKILL", {"wall_time": 68}, CAP, True),
        # A real timeout spends the budget before the kill, so it is not memory.
        ("SIGKILL", {"wall_time": 10_000}, CAP, False),
        # No cap was requested, so a SIGKILL cannot be one.
        ("SIGKILL", {"wall_time": 68}, NO_CAP, False),
        # CPU-time exhaustion is a timeout class, not memory.
        ("SIGXCPU", {"wall_time": 9_900}, CAP, False),
        # Unknown wall time keeps the previous, conservative classification.
        ("SIGKILL", {}, CAP, False),
    ],
)
def test_signal_death_is_attributed_to_the_right_ceiling(signal, run_stage, limits, expected):
    assert _killed_by_memory(signal, run_stage, limits, limits.run_timeout_ms) is expected

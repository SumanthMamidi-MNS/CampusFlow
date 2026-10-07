import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

MAX_SOURCE_BYTES = 64_000


# ── Test cases ──────────────────────────────────────────────────────────────
class CodingTestCaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    stdin: str = ""
    expected_output: str = ""
    is_hidden: bool = False
    comparison: str = Field("trimmed", pattern="^(trimmed|exact)$")
    marks: float | None = Field(None, ge=0)
    sort_order: int = 0


class CodingTestCaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    problem_id: uuid.UUID
    name: str
    stdin: str
    expected_output: str
    is_hidden: bool
    comparison: str
    marks: float | None = None
    sort_order: int


# ── Problems ────────────────────────────────────────────────────────────────
class CodingProblemCreate(BaseModel):
    course_offering_id: uuid.UUID
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    language: str = "python"
    starter_code: str | None = None
    total_marks: float = Field(10.0, gt=0)
    time_limit_ms: int = Field(5000, ge=500, le=30_000)
    memory_limit_kb: int = Field(131_072, ge=16_384, le=1_048_576)
    is_published: bool = True
    due_date: datetime | None = None


class CodingProblemUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    starter_code: str | None = None
    total_marks: float | None = Field(None, gt=0)
    time_limit_ms: int | None = Field(None, ge=500, le=30_000)
    memory_limit_kb: int | None = Field(None, ge=16_384, le=1_048_576)
    is_published: bool | None = None
    due_date: datetime | None = None


class CodingProblemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_offering_id: uuid.UUID
    course_code: str | None = None
    course_title: str | None = None
    created_by_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    language: str
    starter_code: str | None = None
    total_marks: float
    time_limit_ms: int
    memory_limit_kb: int
    is_published: bool
    due_date: datetime | None = None
    created_at: datetime
    visible_test_case_count: int = 0
    my_best_score: float | None = None
    my_submission_count: int = 0


# ── Execution ───────────────────────────────────────────────────────────────
class CodeRunRequest(BaseModel):
    source_code: str = Field(..., min_length=1, max_length=MAX_SOURCE_BYTES)
    stdin: str = Field("", max_length=20_000)


class CodeRunResponse(BaseModel):
    status: str
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    duration_ms: int | None = None
    timed_out: bool = False
    message: str | None = None


class CodingTestResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    passed: bool
    status: str
    expected_output: str | None = None
    actual_output: str | None = None
    stderr: str | None = None
    duration_ms: int | None = None
    is_hidden: bool


class CodingSubmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    problem_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str | None = None
    student_email: str | None = None
    language: str
    status: str
    score: float
    max_score: float
    passed_tests: int
    total_tests: int
    duration_ms: int | None = None
    diagnostics: str | None = None
    submitted_at: datetime
    results: list[CodingTestResultResponse] = []


class CodingSubmissionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    problem_id: uuid.UUID
    problem_title: str | None = None
    student_id: uuid.UUID
    student_name: str | None = None
    student_email: str | None = None
    status: str
    score: float
    max_score: float
    passed_tests: int
    total_tests: int
    submitted_at: datetime


class RunnerHealthResponse(BaseModel):
    enabled: bool
    backend: str
    reachable: bool
    detail: str | None = None


class ProgrammingStatsResponse(BaseModel):
    problems: int
    submissions: int
    awaiting_review: int
    average_score_percent: float | None = None


class MySubmissionSummary(BaseModel):
    problem_id: uuid.UUID
    title: str
    course_code: str | None = None
    total_marks: float
    best_score: float | None = None
    submission_count: int = 0
    last_submitted_at: datetime | None = None
    passed_tests: int = 0
    total_tests: int = 0


class ProgrammingOverview(BaseModel):
    stats: ProgrammingStatsResponse
    attempts: list[MySubmissionSummary] = []


class ApiMeta(BaseModel):
    """Kept for typing helpers; responses use the shared envelope."""

    model_config = ConfigDict(extra="allow")

    detail: dict[str, Any] | None = None

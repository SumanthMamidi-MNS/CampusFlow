import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_core import PydanticCustomError

from campusflow.domain.question_banks.schemas import QuestionOptionResponse

# ── Integrity policy vocabulary ─────────────────────────────────────────────
# What reaching the configured tolerance does to a candidate. The policy is
# authored per exam, disclosed to the candidate before the paper starts, and
# enforced by the service layer — the UI only mirrors the server's decision.
WARNING_POLICY_REMOVE = "remove"  # locked out until faculty reopen the attempt
WARNING_POLICY_REVIEW = "review"  # flagged for faculty review, candidate continues
WARNING_POLICIES = frozenset({WARNING_POLICY_REMOVE, WARNING_POLICY_REVIEW})
DEFAULT_WARNING_POLICY = WARNING_POLICY_REMOVE

# Bounds for the tolerance itself. A value outside this range is an authoring
# mistake, not a policy choice, and is refused loudly instead of being clamped
# silently: an exam that tolerates 0 events would lock a candidate on their
# first refresh, and one that tolerates 500 would never flag anybody.
MIN_MAX_VIOLATIONS = 1
MAX_MAX_VIOLATIONS = 20

# Browser-side device detection is authored per exam and **off** unless an exam
# turns it on: it is the only integrity feature that analyses camera pixels with
# a model, so an assessment written before it existed keeps the behaviour its
# cohort was told about (ADR-024).
DEFAULT_DEVICE_DETECTION = False

# How long the institution keeps camera evidence frames before the images are
# erased (D-2). Mirrors Settings.proctoring_evidence_retention_days, which the
# retention job uses; the value is disclosed to the candidate, so it is sent to
# the client rather than hard-coded in the copy. 0 means "kept until erased by
# the institution", never "delete immediately".
DEFAULT_EVIDENCE_RETENTION_DAYS = 90

# How long the camera must be continuously obstructed before it is reported
# (D-12). Four seconds is the approved default; the bounds stop an assessment
# from being authored with a threshold that reports instantly or effectively
# never, either of which would misrepresent what the candidate was told.
DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS = 4
MIN_OBSTRUCTION_THRESHOLD_SECONDS = 2
MAX_OBSTRUCTION_THRESHOLD_SECONDS = 30


def validate_exam_config(config: dict[str, Any] | None) -> dict[str, Any] | None:
    """Reject integrity configuration the engine would otherwise have to guess at.

    A misspelled ``warning_policy`` used to be indistinguishable from an absent
    one, so the harshest behaviour silently applied. Unknown values now fail
    validation (HTTP 422) at authoring time, where the author can fix them.
    """
    if not config:
        return config
    allowed = " or ".join(f"{p!r}" for p in sorted(WARNING_POLICIES))
    if "warning_policy" in config:
        policy = config["warning_policy"]
        if not isinstance(policy, str) or policy not in WARNING_POLICIES:
            raise PydanticCustomError(
                "invalid_warning_policy",
                "warning_policy must be {allowed}; got {got}",
                {"allowed": allowed, "got": repr(policy)},
            )
    if "obstruction_threshold_seconds" in config:
        raw = config["obstruction_threshold_seconds"]
        # ``bool`` is an ``int`` subclass, so ``True`` must not read as 1 second.
        if isinstance(raw, bool) or not isinstance(raw, int):
            raise PydanticCustomError(
                "invalid_obstruction_threshold",
                "obstruction_threshold_seconds must be a whole number of seconds; got {got}",
                {"got": repr(raw)},
            )
        if not MIN_OBSTRUCTION_THRESHOLD_SECONDS <= raw <= MAX_OBSTRUCTION_THRESHOLD_SECONDS:
            raise PydanticCustomError(
                "obstruction_threshold_out_of_range",
                "obstruction_threshold_seconds must be between {low} and {high}; got {got}",
                {
                    "low": MIN_OBSTRUCTION_THRESHOLD_SECONDS,
                    "high": MAX_OBSTRUCTION_THRESHOLD_SECONDS,
                    "got": repr(raw),
                },
            )
    if "device_detection_enabled" in config:
        raw = config["device_detection_enabled"]
        if not isinstance(raw, bool):
            raise PydanticCustomError(
                "invalid_device_detection_flag",
                "device_detection_enabled must be true or false; got {got}",
                {"got": repr(raw)},
            )
    if "max_violations" in config:
        raw = config["max_violations"]
        # ``bool`` is an ``int`` subclass: ``True`` must not read as "tolerate 1".
        if isinstance(raw, bool) or not isinstance(raw, int):
            raise PydanticCustomError(
                "invalid_max_violations",
                "max_violations must be a whole number; got {got}",
                {"got": repr(raw)},
            )
        if not MIN_MAX_VIOLATIONS <= raw <= MAX_MAX_VIOLATIONS:
            raise PydanticCustomError(
                "max_violations_out_of_range",
                "max_violations must be between {low} and {high}; got {got}",
                {
                    "low": MIN_MAX_VIOLATIONS,
                    "high": MAX_MAX_VIOLATIONS,
                    "got": repr(raw),
                },
            )
    return config


# ── Exam Question Schemas ───────────────────────────────────────────────────
class ExamQuestionCreate(BaseModel):
    question_id: uuid.UUID
    section_id: uuid.UUID | None = None
    sort_order: int = 0
    marks_override: float | None = None
    negative_marks_override: float | None = None


class ExamQuestionBatchAdd(BaseModel):
    questions: list[ExamQuestionCreate]


class ExamQuestionGenerate(BaseModel):
    """Draw a random paper from a syllabus scope.

    Empty ``question_bank_ids`` means "every bank for this offering's course or
    department"; ``tags`` are the syllabus topics carried by the questions.
    """

    question_bank_ids: list[uuid.UUID] = []
    tags: list[str] = []
    difficulties: list[str] = []
    question_types: list[str] = []
    question_count: int | None = Field(None, ge=1, le=200)
    replace_existing: bool = False
    shuffle: bool = True


class ExamQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    exam_id: uuid.UUID
    section_id: uuid.UUID | None = None
    question_id: uuid.UUID
    sort_order: int
    marks: float
    negative_marks: float
    question_type: str
    difficulty: str
    body: str
    explanation: str | None = None
    options: list[QuestionOptionResponse] = []


class ExamQuestionStudentDelivery(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_id: uuid.UUID
    sort_order: int
    marks: float
    negative_marks: float
    question_type: str
    body: str
    options: list[dict[str, Any]] = []  # label, body only (is_correct omitted)


# ── Exam CRUD Schemas ───────────────────────────────────────────────────────
class ExamCreate(BaseModel):
    course_offering_id: uuid.UUID
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    exam_type: str = "quiz"  # quiz, midterm, final, practice
    total_marks: float = Field(100.0, gt=0)
    passing_marks: float | None = None
    duration_minutes: int = Field(60, gt=0)
    start_window: datetime
    end_window: datetime
    instructions: str | None = None
    config: dict[str, Any] | None = None
    status: str = "draft"  # draft, scheduled, live, completed, graded, published

    _validate_config = field_validator("config")(validate_exam_config)


class MultiSectionExamCreate(BaseModel):
    """One assessment delivered to one or more of the caller's sections.

    The server validates **every** selected section against the caller's
    teaching/admin scope before creating anything, so a request that substitutes
    a section the caller does not manage is refused (403) and no exam row is
    written. The resulting exams share a ``series_id`` so the assessment can be
    reviewed as one paper across sections.
    """

    course_offering_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    exam_type: str = "quiz"  # quiz, midterm, final, practice
    total_marks: float = Field(100.0, gt=0)
    passing_marks: float | None = None
    duration_minutes: int = Field(60, gt=0)
    start_window: datetime
    end_window: datetime
    instructions: str | None = None
    config: dict[str, Any] | None = None
    status: str = "draft"

    _validate_config = field_validator("config")(validate_exam_config)


class ExamUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    exam_type: str | None = None
    total_marks: float | None = Field(None, gt=0)
    passing_marks: float | None = None
    duration_minutes: int | None = Field(None, gt=0)
    start_window: datetime | None = None
    end_window: datetime | None = None
    instructions: str | None = None
    config: dict[str, Any] | None = None
    status: str | None = None

    _validate_config = field_validator("config")(validate_exam_config)


class ExamResponse(BaseModel):
    """Staff view of an exam. Contains answer keys — never send to a student."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_offering_id: uuid.UUID
    course_title: str | None = None
    course_code: str | None = None
    title: str
    description: str | None = None
    exam_type: str
    total_marks: float
    passing_marks: float | None = None
    duration_minutes: int
    start_window: datetime
    end_window: datetime
    instructions: str | None = None
    config: dict[str, Any] = {}
    status: str
    created_by_id: uuid.UUID | None = None
    created_at: datetime
    series_id: uuid.UUID | None = None
    questions_count: int = 0
    questions: list[ExamQuestionResponse] = []


class ExamStudentConfig(BaseModel):
    """The only examination configuration a candidate may see.

    Deliberately excludes grading internals and any answer material.
    """

    proctoring_enabled: bool = True
    max_attempts: int = 1
    # Disclosed before the paper starts so the candidate knows what the recorded
    # events lead to: removal until faculty reopen the attempt, or a flag for
    # review while the paper continues. Carries no grading internals.
    warning_policy: str = DEFAULT_WARNING_POLICY
    # Whether this assessment analyses camera frames on the candidate's own
    # device for prohibited electronics. Disclosed, because a candidate is
    # entitled to know what their camera is being used for.
    device_detection_enabled: bool = DEFAULT_DEVICE_DETECTION
    # Disclosed: how long the camera must be continuously obstructed before it is
    # reported, so the candidate knows the grace they actually have.
    obstruction_threshold_seconds: int = DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS
    # Disclosed: how long captured evidence frames are kept before the images are
    # erased from the integrity log (D-2). 0 means kept until the institution
    # erases them.
    evidence_retention_days: int = DEFAULT_EVIDENCE_RETENTION_DAYS
    # Withhold the internal grading switches; expose only whether the candidate
    # will see their score the moment they submit, so the delivery surface can
    # say "results are immediate" without leaking any grading policy detail.
    show_results_immediately: bool = False


class ExamStudentResponse(BaseModel):
    """Candidate-safe view of an exam: metadata only, never question content.

    Used by ``GET /exams`` (students) and ``GET /exams/{id}/public`` so a
    candidate's browser never receives answer keys or grading internals.

    ``latest_attempt_status`` is populated by the candidate exam list
    (``GET /exams``) and by the single-exam brief (``GET /exams/{id}/public``)
    so the student surface can decide whether to offer "Take Exam", "Continue
    attempt", or "View Results". Only the caller's own attempt status is ever
    returned.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_offering_id: uuid.UUID
    course_title: str | None = None
    course_code: str | None = None
    title: str
    description: str | None = None
    exam_type: str
    total_marks: float
    passing_marks: float | None = None
    duration_minutes: int
    start_window: datetime
    end_window: datetime
    instructions: str | None = None
    status: str
    questions_count: int = 0
    config: ExamStudentConfig = ExamStudentConfig()
    # How many attempts *this* candidate has already used. Together with
    # ``config.max_attempts`` it tells the candidate surface whether a further
    # attempt is still permitted, so it never offers "Take Exam" for a retake
    # the server would refuse, nor hides a retake the server would allow.
    attempts_used: int = 0
    latest_attempt_status: str | None = None


# ── Student Attempt & Delivery Schemas ──────────────────────────────────────
class StartAttemptRequest(BaseModel):
    browser_fingerprint: str | None = None


class SaveAnswerItem(BaseModel):
    exam_question_id: uuid.UUID
    answer_data: dict[str, Any] | None = None
    time_spent_seconds: int = 0
    flagged_for_review: bool = False


class BatchSaveAnswersRequest(BaseModel):
    answers: list[SaveAnswerItem]


class ExamDeliveryResponse(BaseModel):
    attempt_id: uuid.UUID
    exam_id: uuid.UUID
    exam_title: str
    instructions: str | None = None
    started_at: datetime
    duration_minutes: int
    remaining_seconds: int
    status: str
    # Server-authoritative integrity configuration for this attempt. The
    # candidate is told which consequence applies to them, and the policy is
    # re-sent with every proctoring response in case faculty change it mid-paper.
    proctoring_enabled: bool = True
    warning_policy: str = DEFAULT_WARNING_POLICY
    device_detection_enabled: bool = DEFAULT_DEVICE_DETECTION
    # Seconds of continuous camera obstruction before it is reported, authored
    # per exam (D-12) and echoed to the client that enforces it.
    obstruction_threshold_seconds: int = DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS
    # Days after which captured evidence images are erased (D-2).
    evidence_retention_days: int = DEFAULT_EVIDENCE_RETENTION_DAYS
    questions: list[ExamQuestionStudentDelivery]
    saved_answers: dict[
        str, dict[str, Any]
    ] = {}  # exam_question_id -> answer_data & flagged status


# ── Grading & Results Schemas ───────────────────────────────────────────────
class GradeSingleResponseRequest(BaseModel):
    marks_awarded: float = Field(..., ge=0)
    feedback: str | None = None


class ExamAttemptResponseDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    exam_question_id: uuid.UUID
    question_type: str
    question_body: str
    max_marks: float
    answer_data: dict[str, Any] | None = None
    marks_awarded: float | None = None
    is_auto_graded: bool = False
    feedback: str | None = None
    correct_answer_summary: str | None = None


class ExamAttemptSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    exam_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str | None = None
    student_email: str | None = None
    attempt_number: int
    started_at: datetime
    submitted_at: datetime | None = None
    status: str
    total_score: float | None = None
    percentage: float | None = None
    proctor_violations_count: int = 0
    # Integrity review state, derived server-side from the attempt's flag list so
    # the lecturer's review surface does not have to parse free-form flags in the
    # browser (ADR-023). Staff-only: this model is never candidate-facing.
    flagged_for_review: bool = False
    review_flagged_at: datetime | None = None


class StudentExamResultResponse(BaseModel):
    attempt_id: uuid.UUID
    exam_id: uuid.UUID
    exam_title: str
    started_at: datetime
    submitted_at: datetime | None = None
    status: str
    total_score: float | None = None
    total_marks: float
    percentage: float | None = None
    responses: list[ExamAttemptResponseDetail] = []


# ── Proctoring & Security Schemas ───────────────────────────────────────────
class ProctoringEventCreate(BaseModel):
    event_type: str  # tab_switch, window_blur, fullscreen_exit, copy_paste_attempt, context_menu
    timestamp: datetime | None = None
    severity: str = "medium"  # low, medium, high
    details: dict[str, Any] | None = None


class ProctoringEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    attempt_id: uuid.UUID
    event_type: str
    timestamp: datetime
    severity: str
    details: dict[str, Any] | None = None


class ProctoringStatusResponse(BaseModel):
    violations_count: int
    max_violations: int
    auto_submitted: bool
    is_locked: bool = False
    status: str = "in_progress"
    warning: str | None = None
    # The policy in force for this attempt, so the candidate surface renders the
    # consequence the server will actually apply rather than a hard-coded one.
    warning_policy: str = DEFAULT_WARNING_POLICY


class UnlockAttemptRequest(BaseModel):
    reason: str = "Faculty authorized re-entry after integrity review"
    reset_violations: bool = True

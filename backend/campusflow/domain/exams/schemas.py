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
# The allowance an assessment gets when it does not author one. Disclosed to the
# candidate with the rest of the integrity configuration, so "how many warnings
# do I have" is answered before the first event rather than after it.
#
# Ten is the product's authored ceiling (D-31): a candidate is warned ten times,
# each warning names the remaining count, and the tenth removes them from the
# paper until a lecturer reopens the attempt. An exam may author a different
# value; it may not author silence.
DEFAULT_MAX_VIOLATIONS = 10

# Consecutive warnings cannot arrive back to back. Once the candidate has
# acknowledged a warning, the next one is at least this many seconds away: the
# signal in between is still recorded for review, but it does not spend another
# warning. Without the gap, a single sustained condition — a face held out of
# frame, a phone on the desk, a stall in the camera loop — can fire the whole
# allowance in a second and stop a paper before the candidate has read the first
# warning.
DEFAULT_WARNING_COOLDOWN_SECONDS = 5

# Browser-side device detection is authored per exam and **on** by default: a
# phone, earbuds or a watch in shot is the first thing an invigilator notices,
# and a proctoring product that leaves it off by default is not proctoring
# (D-31). An exam can switch it off, and the switch is disclosed to candidates.
DEFAULT_DEVICE_DETECTION = True

# ── Integrity sensitivity (ADR-029) ──────────────────────────────────────────
#
# The dwell times that decide *when* a camera cue becomes an event are a
# property of the paper, not of the code: a closed-book final and a first-year
# quiz do not deserve the same tolerance for looking at a second screen. Three
# named tiers rather than free numbers, because every value a candidate is held
# to has to be disclosable in one sentence before the paper starts.
INTEGRITY_SENSITIVITIES = frozenset({"relaxed", "standard", "strict"})
DEFAULT_INTEGRITY_SENSITIVITY = "standard"

# The per-tier dwell values, in milliseconds. `standard` is what every
# assessment authored before this setting existed was already held to, so an
# upgrade cannot silently tighten a cohort's paper.
#
# `turn`   — how long the head must stay turned past the yaw threshold.
# `absence`— how long no face may be visible.
# `hand`   — how long a hand must sit at or near the face (reading off a held
#            phone or a crib sheet in the shot) before it is recorded.
# `voice`  — how long another voice must be sustained in the room.
# `mouth`  — how long talking-shaped mouth motion must be sustained while the
#            candidate is otherwise facing the paper (reading an answer aloud to
#            someone off-camera, or repeating a dictated answer).
INTEGRITY_DWELL_MS: dict[str, dict[str, int]] = {
    "relaxed": {"turn": 3_000, "absence": 6_000, "hand": 5_000, "voice": 4_000, "mouth": 3_000},
    # The standard tier is the one most papers run at, and it is deliberately
    # short: a cue that takes three seconds to appear reads to the candidate as a
    # detector that does not work, and the point of the warning is that it lands
    # while the behaviour is still happening.
    "standard": {"turn": 1_500, "absence": 2_000, "hand": 2_500, "voice": 2_000, "mouth": 1_500},
    "strict": {"turn": 1_000, "absence": 1_500, "hand": 1_500, "voice": 1_500, "mouth": 1_000},
}

# Camera cues analysed with a model on the candidate's own device. Each is
# authorised per exam and **independent of the others**, because a department
# may reasonably want faces monitored without a microphone or a hand detector.
#
# A confirmed cue now spends one unit of the allowance like any browser signal
# (D-31): the product's contract is ten visible warnings and then a stop, and
# a cue that is recorded but never warns is indistinguishable from one that does
# not work. What keeps this defensible is confirmation on the client (sustained
# dwell, repeated scans) and the lecturer's authority to reopen an attempt — not
# silence. All of them are on with the camera: a held-up phone is the single most
# common way an answer is delivered mid-paper, and a detector that defaults off
# is a detector that never fires on the assessments nobody remembered to author
# (D-31). An exam may still switch any one of them off, and the switch is
# disclosed to the candidate with the rest of the integrity configuration.
DEFAULT_FACE_MONITORING = True
DEFAULT_HAND_MONITORING = True
# Microphone monitoring is on by default: a second voice, or the candidate
# speaking an answer aloud, is exactly the behaviour the last silence failed to
# catch. The analyser measures band energy; it never records or transmits audio.
DEFAULT_AUDIO_MONITORING = True
# Mouth-movement monitoring is off by default and opt-in per paper (ADR-039).
# The idea is sound — talking is the one cheat that keeps the head, hands, phone
# and microphone silent — but the shipped pixel heuristic could not tell a mouth
# from a jaw, a cheek or compression noise on a still face, and candidates who
# were not talking saw \"sustained mouth movement\" warnings. A cue that spends
# the allowance on a false positive is worse than a cue that does not exist, so
# the engine and the authoring switch stay, the default is off, and the voice
# check remains the supported talking signal. It measures *motion*, never speech:
# no audio is captured for it, no transcript exists, and the event carries two
# motion numbers and a duration.
DEFAULT_MOUTH_MONITORING = False


def integrity_dwell_ms(config: dict[str, Any] | None) -> dict[str, int]:
    """The dwell values for an exam's authored sensitivity, with the default
    filling in anything an older row is missing."""
    raw = (config or {}).get("integrity_sensitivity", DEFAULT_INTEGRITY_SENSITIVITY)
    tier = raw if raw in INTEGRITY_SENSITIVITIES else DEFAULT_INTEGRITY_SENSITIVITY
    return dict(INTEGRITY_DWELL_MS[tier])

# How long captured camera frames are retained before erasure. A non-positive
# institutional setting falls back to this finite default so a configuration
# mistake can never turn off the personal-data safeguard.
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
    # The per-exam integrity tier and each camera cue's switch. An unknown tier
    # is refused rather than defaulted: silently falling back to `standard`
    # would hold a cohort to a dwell they were never told about.
    if "integrity_sensitivity" in config:
        raw = config["integrity_sensitivity"]
        allowed = " or ".join(f"{tier!r}" for tier in sorted(INTEGRITY_SENSITIVITIES))
        if not isinstance(raw, str) or raw not in INTEGRITY_SENSITIVITIES:
            raise PydanticCustomError(
                "invalid_integrity_sensitivity",
                "integrity_sensitivity must be {allowed}; got {got}",
                {"allowed": allowed, "got": repr(raw)},
            )
    for flag in (
        "face_monitoring_enabled",
        "hand_monitoring_enabled",
        "audio_monitoring_enabled",
        "mouth_monitoring_enabled",
    ):
        if flag in config and not isinstance(config[flag], bool):
            raise PydanticCustomError(
                "invalid_monitoring_flag",
                "{flag} must be true or false; got {got}",
                {"flag": flag, "got": repr(config[flag])},
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
    options: list[dict[str, Any]] = []  # display label and body only (is_correct omitted)


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
    # Disclosed before the paper starts: the number of recorded events this
    # attempt tolerates. The candidate surface renders it as `n / m` from the
    # first frame, so the allowance is never a surprise after the fact.
    max_violations: int = DEFAULT_MAX_VIOLATIONS
    # Disclosed before the paper starts: a counted warning is followed by this
    # many seconds in which further signals are recorded but cannot spend
    # another warning. The candidate can therefore never be stopped by a burst
    # they had no time to see, and knows the gap is deliberate.
    warning_cooldown_seconds: int = DEFAULT_WARNING_COOLDOWN_SECONDS
    # Disclosed before the paper starts so the candidate knows what the recorded
    # events lead to: removal until faculty reopen the attempt, or a flag for
    # review while the paper continues. Carries no grading internals.
    warning_policy: str = DEFAULT_WARNING_POLICY
    # Whether this assessment analyses camera frames on the candidate's own
    # device for prohibited electronics. Disclosed, because a candidate is
    # entitled to know what their camera is being used for.
    device_detection_enabled: bool = DEFAULT_DEVICE_DETECTION
    # Disclosed: the integrity tier this paper is run at, and what it means in
    # seconds. Sent as values rather than a label so the candidate surface never
    # has to hard-code a dwell the server owns (ADR-029).
    integrity_sensitivity: str = DEFAULT_INTEGRITY_SENSITIVITY
    face_monitoring_enabled: bool = DEFAULT_FACE_MONITORING
    hand_monitoring_enabled: bool = DEFAULT_HAND_MONITORING
    audio_monitoring_enabled: bool = DEFAULT_AUDIO_MONITORING
    mouth_monitoring_enabled: bool = DEFAULT_MOUTH_MONITORING
    # Disclosed: every threshold the candidate is held to, in milliseconds, so
    # "how long can I look away" is answered before the paper rather than by a
    # warning mid-answer.
    dwell_ms: dict[str, int] = Field(default_factory=dict)
    # Disclosed: the exact vocabulary and what each signal costs. Counted signals
    # can spend the allowance; review-only signals are recorded for the lecturer's
    # review and never counted (ADR-040). Sent as ids from the server's own sets,
    # so the brief renders what the server enforces rather than a copy that can
    # drift from it.
    counted_event_types: list[str] = Field(default_factory=list)
    review_only_event_types: list[str] = Field(default_factory=list)
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
    # A demonstration paper. The candidate surface uses this to offer a fresh
    # demo sitting (one click) when the demo stops at its integrity limit,
    # instead of the lecturer-reopen flow a real paper requires. No answer
    # material is implied by knowing a paper is the demo.
    demo: bool = False


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
    # Integrity counters as the server holds them. Sent with the delivery so a
    # resumed attempt shows the true `n / m` immediately instead of 0 until the
    # candidate happens to trigger another event.
    violations_count: int = 0
    max_violations: int = DEFAULT_MAX_VIOLATIONS
    # Seconds after a counted warning before another can be counted (D-31).
    warning_cooldown_seconds: int = DEFAULT_WARNING_COOLDOWN_SECONDS
    # True when a warning was counted but the candidate has not acknowledged it
    # yet. The delivery surface restores the modal on a resume instead of
    # letting the candidate work past a warning they never saw.
    warning_pending: bool = False
    device_detection_enabled: bool = DEFAULT_DEVICE_DETECTION
    # The integrity tier this attempt is run at and the dwell values it implies.
    # Echoed on delivery so the monitoring loop enforces exactly what the
    # candidate was told, not a client-side constant (ADR-029).
    integrity_sensitivity: str = DEFAULT_INTEGRITY_SENSITIVITY
    face_monitoring_enabled: bool = DEFAULT_FACE_MONITORING
    hand_monitoring_enabled: bool = DEFAULT_HAND_MONITORING
    audio_monitoring_enabled: bool = DEFAULT_AUDIO_MONITORING
    mouth_monitoring_enabled: bool = DEFAULT_MOUTH_MONITORING
    dwell_ms: dict[str, int] = Field(default_factory=dict)
    # The signal split this attempt is actually run under (ADR-040): which cues
    # can spend the allowance and which are recorded for review only. Echoed with
    # the delivery so the brief never promises a cost the server does not apply.
    counted_event_types: list[str] = Field(default_factory=list)
    review_only_event_types: list[str] = Field(default_factory=list)
    # Seconds of continuous camera obstruction before it is reported, authored
    # per exam (D-12) and echoed to the client that enforces it.
    obstruction_threshold_seconds: int = DEFAULT_OBSTRUCTION_THRESHOLD_SECONDS
    # Days after which captured evidence images are erased (D-2).
    evidence_retention_days: int = DEFAULT_EVIDENCE_RETENTION_DAYS
    # True for the demonstration paper, so the stopped screen can restart the
    # demo rather than asking a lecturer who does not exist in the demo.
    demo: bool = False
    shuffle_questions: bool = False
    shuffle_options: bool = False
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
    # A candidate stopped by the tolerance can ask to continue; the request is
    # shown here so the lecturer knows whose paper is waiting, and the attempt
    # stays locked until they approve it. Staff-only, like the review state.
    resume_requested: bool = False
    resume_requested_at: datetime | None = None


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
    event_category: str = "browser_signal"
    # What this cue cost on this attempt: ``counted``, ``review_only`` or
    # ``evidence`` (ADR-040). Separate from `event_category`, which only says
    # where the cue came from.
    disposition: str = "counted"
    evidence_purged_at: datetime | None = None


class ProctoringStatusResponse(BaseModel):
    violations_count: int
    max_violations: int
    auto_submitted: bool
    is_locked: bool = False
    status: str = "in_progress"
    warning: str | None = None
    # A counted warning that still awaits acknowledgement. Sent with every
    # response so a lost first response can be recovered from the next one
    # instead of leaving the ladder silently paused.
    warning_pending: bool = False
    # The policy in force for this attempt, so the candidate surface renders the
    # consequence the server will actually apply rather than a hard-coded one.
    warning_policy: str = DEFAULT_WARNING_POLICY
    # Explicit signal category lets the candidate distinguish browser telemetry,
    # model observations, and passive evidence without guessing from a message.
    event_category: str | None = None
    # Whether this response's cue spent the allowance:
    # ``counted`` / ``review_only`` / ``evidence`` (ADR-040). The candidate
    # surface uses it to keep an inference cue silent — recorded and flagged, but
    # never a modal and never a counter.
    disposition: str | None = None


class WarningAcknowledgementResponse(BaseModel):
    """The result of a candidate acknowledging the warning on screen."""

    warning_pending: bool
    violations_count: int
    max_violations: int
    warning_cooldown_seconds: int = DEFAULT_WARNING_COOLDOWN_SECONDS


class UnlockAttemptRequest(BaseModel):
    reason: str = "Faculty authorized re-entry after integrity review"
    reset_violations: bool = True

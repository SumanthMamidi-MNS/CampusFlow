import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from campusflow.domain.question_banks.schemas import QuestionOptionResponse


# ── Exam Question Schemas ───────────────────────────────────────────────────
class ExamQuestionCreate(BaseModel):
    question_id: uuid.UUID
    section_id: uuid.UUID | None = None
    sort_order: int = 0
    marks_override: float | None = None
    negative_marks_override: float | None = None


class ExamQuestionBatchAdd(BaseModel):
    questions: list[ExamQuestionCreate]


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


class ExamResponse(BaseModel):
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
    questions_count: int = 0
    questions: list[ExamQuestionResponse] = []


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
    questions: list[ExamQuestionStudentDelivery]
    saved_answers: dict[str, dict[str, Any]] = {}  # exam_question_id -> answer_data & flagged status


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
    warning: str | None = None

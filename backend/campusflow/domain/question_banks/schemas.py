import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class QuestionOptionCreate(BaseModel):
    label: str = Field(..., max_length=16)
    body: str = Field(..., min_length=1)
    is_correct: bool = False
    sort_order: int = 0


class QuestionOptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_id: uuid.UUID
    label: str
    body: str
    is_correct: bool
    sort_order: int


class QuestionCreate(BaseModel):
    question_bank_id: uuid.UUID | None = None
    question_type: str = "mcq"  # mcq, msq, true_false, numerical, short_answer, essay, fill_blank
    difficulty: str = "medium"  # easy, medium, hard
    marks: float = Field(1.0, gt=0)
    negative_marks: float = Field(0.0, ge=0)
    body: str = Field(..., min_length=2)
    explanation: str | None = None
    tags: list[str] | None = None
    metadata_info: dict[str, Any] | None = None
    status: str = "draft"  # draft, approved, archived
    options: list[QuestionOptionCreate] | None = None


class QuestionUpdate(BaseModel):
    question_type: str | None = None
    difficulty: str | None = None
    marks: float | None = Field(None, gt=0)
    negative_marks: float | None = Field(None, ge=0)
    body: str | None = Field(None, min_length=2)
    explanation: str | None = None
    tags: list[str] | None = None
    metadata_info: dict[str, Any] | None = None
    status: str | None = None
    options: list[QuestionOptionCreate] | None = None


class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_bank_id: uuid.UUID
    question_type: str
    difficulty: str
    marks: float
    negative_marks: float
    body: str
    explanation: str | None = None
    tags: list[str] | None = None
    metadata_info: dict[str, Any] | None = None
    status: str
    created_by_id: uuid.UUID | None = None
    approved_by_id: uuid.UUID | None = None
    created_at: datetime
    options: list[QuestionOptionResponse] = []


class QuestionBankCreate(BaseModel):
    department_id: uuid.UUID
    course_id: uuid.UUID | None = None
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None


class QuestionBankUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    course_id: uuid.UUID | None = None


class QuestionBankResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    department_id: uuid.UUID
    department_name: str | None = None
    course_id: uuid.UUID | None = None
    course_title: str | None = None
    title: str
    description: str | None = None
    created_by_id: uuid.UUID | None = None
    created_at: datetime
    questions_count: int = 0


class BulkQuestionImportResponse(BaseModel):
    imported_count: int
    failed_count: int
    errors: list[str]

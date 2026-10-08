import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RubricCriterion(BaseModel):
    criterion: str
    max_points: float = Field(..., ge=0)
    description: str | None = None


class AssignmentCreate(BaseModel):
    course_offering_id: uuid.UUID
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    assignment_type: str = "file_upload"
    due_date: datetime
    total_marks: float = Field(100.0, gt=0)
    pass_marks: float | None = Field(None, ge=0)
    weightage: float = Field(10.0, ge=0)
    allow_late: bool = False
    late_penalty_percent_per_day: float = Field(0.0, ge=0, le=100)
    max_late_days: int = Field(0, ge=0)
    rubric: list[RubricCriterion] | None = None
    is_published: bool = True


class AssignmentUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    description: str | None = None
    assignment_type: str | None = None
    due_date: datetime | None = None
    total_marks: float | None = Field(None, gt=0)
    pass_marks: float | None = Field(None, ge=0)
    weightage: float | None = Field(None, ge=0)
    allow_late: bool | None = None
    late_penalty_percent_per_day: float | None = Field(None, ge=0, le=100)
    max_late_days: int | None = Field(None, ge=0)
    rubric: list[RubricCriterion] | None = None
    is_published: bool | None = None


class SubmissionGradeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    submission_id: uuid.UUID
    graded_by_id: uuid.UUID | None = None
    graded_by_name: str | None = None
    marks_obtained: float
    penalty_deducted: float
    final_marks: float
    feedback: str | None = None
    rubric_evaluation: dict[str, Any] | None = None
    graded_at: datetime


class AssignmentSubmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str | None = None
    student_email: str | None = None
    status: str
    submitted_at: datetime
    content_text: str | None = None
    file_path: str | None = None
    file_name: str | None = None
    file_size: int | None = None
    mime_type: str | None = None
    is_late: bool
    late_days: int
    grade: SubmissionGradeResponse | None = None


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_offering_id: uuid.UUID
    title: str
    description: str | None = None
    assignment_type: str
    due_date: datetime
    total_marks: float
    pass_marks: float | None = None
    weightage: float
    allow_late: bool
    late_penalty_percent_per_day: float
    max_late_days: int
    rubric: list[dict[str, Any]] | None = None
    is_published: bool
    published_at: datetime | None = None
    created_by_id: uuid.UUID | None = None
    created_at: datetime
    course_code: str | None = None
    course_title: str | None = None
    my_submission: AssignmentSubmissionResponse | None = None
    submissions_count: int | None = None


class SubmissionTextCreate(BaseModel):
    content_text: str = Field(..., min_length=1)


class GradeSubmissionRequest(BaseModel):
    marks_obtained: float = Field(..., ge=0)
    feedback: str | None = None
    rubric_evaluation: dict[str, Any] | None = None


class GradebookStudentEntry(BaseModel):
    student_id: uuid.UUID
    student_name: str
    student_email: str
    enrollment_status: str
    assignment_scores: dict[str, float | None]
    total_weighted_score: float
    max_possible_weighted: float
    percentage: float


class GradebookResponse(BaseModel):
    course_offering_id: uuid.UUID
    course_title: str
    assignments: list[dict[str, Any]]
    students: list[GradebookStudentEntry]


# ── Self-scoped student grades ──────────────────────────────────────────────
# A candidate may always see their own marks, but never the cohort. These
# schemas carry exactly one student's data and no other identity.


class MyAssignmentGrade(BaseModel):
    assignment_id: uuid.UUID
    title: str
    total_marks: float
    weightage: float
    due_date: datetime
    submission_status: str | None = None
    submitted_at: datetime | None = None
    is_late: bool = False
    marks_obtained: float | None = None
    penalty_deducted: float | None = None
    final_marks: float | None = None
    feedback: str | None = None
    graded_at: datetime | None = None


class MyCourseGradesResponse(BaseModel):
    course_offering_id: uuid.UUID
    course_title: str
    student_id: uuid.UUID
    assignments: list[MyAssignmentGrade]
    total_weighted_score: float
    max_possible_weighted: float
    percentage: float

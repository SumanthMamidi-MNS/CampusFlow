import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict


class InstitutionalOverviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_students: int
    total_faculty: int
    total_departments: int
    total_courses: int
    total_exams: int
    total_submissions: int
    overall_pass_rate: float
    department_enrollment_breakdown: list[dict[str, Any]]
    recent_activity: list[dict[str, Any]]


class CourseAnalyticsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    course_offering_id: uuid.UUID
    course_code: str
    course_title: str
    total_enrolled: int
    assignment_completion_rate: float
    average_assignment_score: float | None = None
    exam_average_score: float | None = None
    overall_course_pass_rate: float
    grade_distribution: dict[str, int]


class ExamAnalyticsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    exam_id: uuid.UUID
    exam_title: str
    total_attempts: int
    graded_attempts: int
    average_score: float | None = None
    median_score: float | None = None
    highest_score: float | None = None
    lowest_score: float | None = None
    pass_percentage: float | None = None
    score_brackets: dict[str, int]
    violation_stats: dict[str, int]


class StudentDashboardAnalyticsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    enrolled_courses_count: int
    completed_assignments_count: int
    pending_assignments_count: int
    completed_exams_count: int
    upcoming_exams_count: int
    overall_average_percentage: float | None = None
    recent_scores: list[dict[str, Any]]

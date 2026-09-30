import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CourseBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    title: str = Field(..., min_length=1, max_length=255)
    department_id: uuid.UUID
    credits: int = Field(3, ge=1, le=12)
    description: str | None = None


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    title: str | None = None
    credits: int | None = None
    description: str | None = None


class CourseResponse(CourseBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class CourseOfferingBase(BaseModel):
    course_id: uuid.UUID
    academic_term_id: uuid.UUID
    batch_id: uuid.UUID | None = None
    section: str = Field("A", max_length=16)
    status: str = Field("active", pattern="^(active|completed|archived)$")


class CourseOfferingCreate(CourseOfferingBase):
    faculty_ids: list[uuid.UUID] = Field(default_factory=list)


class FacultyAssignmentResponse(BaseModel):
    faculty_id: uuid.UUID
    role: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    model_config = ConfigDict(from_attributes=True)


class CourseOfferingResponse(CourseOfferingBase):
    id: uuid.UUID
    course_title: str | None = None
    course_code: str | None = None
    faculty: list[FacultyAssignmentResponse] = Field(default_factory=list)
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AssignFacultyRequest(BaseModel):
    faculty_id: uuid.UUID
    role: str = Field("primary", pattern="^(primary|co_instructor|teaching_assistant)$")

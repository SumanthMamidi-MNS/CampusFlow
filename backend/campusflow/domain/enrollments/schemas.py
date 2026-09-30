import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class EnrollStudentRequest(BaseModel):
    student_id: uuid.UUID


class EnrollmentResponse(BaseModel):
    id: uuid.UUID
    course_offering_id: uuid.UUID
    student_id: uuid.UUID
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    status: str
    enrolled_at: datetime
    model_config = ConfigDict(from_attributes=True)


class BulkEnrollResult(BaseModel):
    total_processed: int
    enrolled_count: int
    skipped_count: int
    errors: list[dict]

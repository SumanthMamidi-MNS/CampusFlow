import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class DepartmentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=32)
    description: str | None = None
    head_id: uuid.UUID | None = None


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    code: str | None = Field(None, min_length=1, max_length=32)
    description: str | None = None
    head_id: uuid.UUID | None = None


class DepartmentResponse(DepartmentBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProgramBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=32)
    department_id: uuid.UUID
    degree_type: str = "Bachelor"
    duration_years: int = 4


class ProgramCreate(ProgramBase):
    pass


class ProgramResponse(ProgramBase):
    id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class BatchBase(BaseModel):
    program_id: uuid.UUID
    start_year: int
    label: str


class BatchCreate(BatchBase):
    pass


class BatchResponse(BatchBase):
    id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AcademicTermBase(BaseModel):
    name: str
    term_type: str = "semester"
    start_date: date
    end_date: date
    is_current: bool = False


class AcademicTermCreate(AcademicTermBase):
    pass


class AcademicTermResponse(AcademicTermBase):
    id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

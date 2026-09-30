import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(None, max_length=32)
    status: str = Field("active", pattern="^(pending|active|inactive)$")


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    roles: list[str] = Field(default_factory=lambda: ["student"])


class UserUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    phone: str | None = Field(None, max_length=32)
    status: str | None = Field(None, pattern="^(pending|active|inactive)$")
    password: str | None = Field(None, min_length=8)
    roles: list[str] | None = None


class UserResponse(UserBase):
    id: uuid.UUID
    roles: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BulkImportResult(BaseModel):
    total_processed: int
    created_count: int
    skipped_count: int
    errors: list[dict]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

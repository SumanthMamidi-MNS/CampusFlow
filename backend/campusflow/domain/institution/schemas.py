import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InstitutionBase(BaseModel):
    name: str
    code: str
    logo_url: str | None = None
    primary_color: str = "#2563eb"
    timezone: str = "UTC"
    contact_email: str | None = None
    phone: str | None = None
    policies: dict | None = None


class InstitutionCreate(InstitutionBase):
    pass


class InstitutionUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    timezone: str | None = None
    contact_email: str | None = None
    phone: str | None = None
    policies: dict | None = None


class InstitutionResponse(InstitutionBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

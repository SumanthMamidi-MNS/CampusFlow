import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    is_pinned: bool = False


class AnnouncementResponse(BaseModel):
    id: uuid.UUID
    course_offering_id: uuid.UUID
    author_id: uuid.UUID
    author_name: str | None = None
    title: str
    body: str
    is_pinned: bool
    published_at: datetime
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

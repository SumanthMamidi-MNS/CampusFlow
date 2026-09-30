import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MaterialFolderCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    parent_id: uuid.UUID | None = None
    sort_order: int = 0


class MaterialFolderResponse(BaseModel):
    id: uuid.UUID
    course_offering_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    title: str
    sort_order: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class MaterialCreate(BaseModel):
    folder_id: uuid.UUID | None = None
    title: str = Field(..., min_length=1, max_length=255)
    material_type: str = Field("link", pattern="^(link|text|file)$")
    url: str | None = None
    content_text: str | None = None
    sort_order: int = 0


class MaterialResponse(BaseModel):
    id: uuid.UUID
    course_offering_id: uuid.UUID
    folder_id: uuid.UUID | None = None
    title: str
    material_type: str
    file_path: str | None = None
    file_size: int | None = None
    mime_type: str | None = None
    url: str | None = None
    content_text: str | None = None
    sort_order: int
    is_published: bool
    published_at: datetime | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

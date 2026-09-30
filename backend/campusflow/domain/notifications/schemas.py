import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    message: str
    notification_type: str
    link: str | None = None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


class NotificationPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email_assignments: bool
    email_grades: bool
    email_exams: bool
    email_announcements: bool
    in_app_assignments: bool
    in_app_grades: bool
    in_app_exams: bool
    in_app_announcements: bool


class NotificationPreferenceUpdate(BaseModel):
    email_assignments: bool | None = None
    email_grades: bool | None = None
    email_exams: bool | None = None
    email_announcements: bool | None = None
    in_app_assignments: bool | None = None
    in_app_grades: bool | None = None
    in_app_exams: bool | None = None
    in_app_announcements: bool | None = None


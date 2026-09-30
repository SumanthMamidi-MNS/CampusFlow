export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unread_count: number;
}

export interface NotificationPreference {
  email_assignments: boolean;
  email_grades: boolean;
  email_exams: boolean;
  email_announcements: boolean;
  in_app_assignments: boolean;
  in_app_grades: boolean;
  in_app_exams: boolean;
  in_app_announcements: boolean;
}

export type NotificationPreferenceUpdate = Partial<NotificationPreference>;


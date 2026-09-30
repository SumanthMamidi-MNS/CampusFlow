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

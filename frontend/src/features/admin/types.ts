export interface Institution {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  primary_color: string;
  timezone: string;
  contact_email: string | null;
  phone: string | null;
  policies: {
    allow_late_submissions?: boolean;
    exam_strict_proctoring?: boolean;
    max_login_attempts?: number;
    [key: string]: any;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface InstitutionUpdatePayload {
  name?: string;
  logo_url?: string | null;
  primary_color?: string;
  timezone?: string;
  contact_email?: string | null;
  phone?: string | null;
  policies?: Record<string, any> | null;
}

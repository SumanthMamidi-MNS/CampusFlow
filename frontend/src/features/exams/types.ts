export type ExamType = 'quiz' | 'midterm' | 'final' | 'practice';
export type ExamStatus = 'draft' | 'scheduled' | 'live' | 'completed' | 'graded' | 'published';
export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted' | 'graded' | 'locked_violation';

export interface ExamQuestionOption {
  id?: string;
  label: string;
  body: string;
  is_correct?: boolean;
  sort_order?: number;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  section_id?: string | null;
  question_id: string;
  sort_order: number;
  marks: number;
  negative_marks: number;
  question_type: string;
  difficulty: string;
  body: string;
  explanation?: string | null;
  options: ExamQuestionOption[];
}

export interface Exam {
  id: string;
  course_offering_id: string;
  course_title?: string | null;
  course_code?: string | null;
  title: string;
  description?: string | null;
  exam_type: ExamType;
  total_marks: number;
  passing_marks?: number | null;
  duration_minutes: number;
  start_window: string;
  end_window: string;
  instructions?: string | null;
  config: {
    shuffle_questions?: boolean;
    shuffle_options?: boolean;
    auto_grade?: boolean;
    show_results_immediately?: boolean;
    proctoring_enabled?: boolean;
    max_violations?: number;
    max_attempts?: number;
    allowed_cidrs?: string[];
  };
  status: ExamStatus;
  created_by_id?: string | null;
  created_at: string;
  questions_count: number;
  questions: ExamQuestion[];
}

export interface ExamCreateInput {
  course_offering_id: string;
  title: string;
  description?: string | null;
  exam_type?: ExamType;
  total_marks: number;
  passing_marks?: number | null;
  duration_minutes: number;
  start_window: string;
  end_window: string;
  instructions?: string | null;
  config?: Record<string, any>;
  status?: ExamStatus;
}

export interface ExamUpdateInput {
  title?: string;
  description?: string | null;
  exam_type?: ExamType;
  total_marks?: number;
  passing_marks?: number | null;
  duration_minutes?: number;
  start_window?: string;
  end_window?: string;
  instructions?: string | null;
  config?: Record<string, any>;
  status?: ExamStatus;
}

export interface ExamDeliveryQuestion {
  id: string;
  question_id: string;
  sort_order: number;
  marks: number;
  negative_marks: number;
  question_type: string;
  body: string;
  options: { label: string; body: string }[];
}

export interface ExamDelivery {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  instructions?: string | null;
  started_at: string;
  duration_minutes: number;
  remaining_seconds: number;
  status: AttemptStatus;
  questions: ExamDeliveryQuestion[];
  saved_answers: Record<string, { answer_data: any; flagged_for_review: boolean }>;
}

export interface SaveAnswerPayload {
  exam_question_id: string;
  answer_data: any;
  time_spent_seconds?: number;
  flagged_for_review?: boolean;
}

export interface ExamAttemptSummary {
  id: string;
  exam_id: string;
  student_id: string;
  student_name?: string | null;
  student_email?: string | null;
  attempt_number: number;
  started_at: string;
  submitted_at?: string | null;
  status: AttemptStatus;
  total_score?: number | null;
  percentage?: number | null;
  proctor_violations_count: number;
}

export interface ExamResponseDetail {
  id: string;
  exam_question_id: string;
  question_type: string;
  question_body: string;
  max_marks: number;
  answer_data?: any;
  marks_awarded?: number | null;
  is_auto_graded: boolean;
  feedback?: string | null;
  correct_answer_summary?: string | null;
}

export interface StudentExamResult {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  started_at: string;
  submitted_at?: string | null;
  status: AttemptStatus;
  total_score?: number | null;
  total_marks: number;
  percentage?: number | null;
  responses: ExamResponseDetail[];
}

// ── Proctoring Types ────────────────────────────────────────────────────────
export interface ProctoringEventCreate {
  event_type: string;
  timestamp?: string | null;
  severity?: 'low' | 'medium' | 'high';
  details?: Record<string, any> | null;
}

export interface ProctoringEvent {
  id: string;
  attempt_id: string;
  event_type: string;
  timestamp: string;
  severity: string;
  details?: Record<string, any> | null;
}

export interface ProctoringStatus {
  violations_count: number;
  max_violations: number;
  auto_submitted: boolean;
  warning?: string | null;
  is_locked?: boolean;
  status?: string;
}

export interface UnlockAttemptPayload {
  reason?: string;
  reset_violations?: boolean;
}


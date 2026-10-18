export type ExamType = 'quiz' | 'midterm' | 'final' | 'practice';
export type ExamStatus = 'draft' | 'scheduled' | 'live' | 'completed' | 'graded' | 'published';
export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted' | 'graded' | 'locked_violation';
/**
 * What reaching the integrity tolerance does to a candidate.
 * `remove` locks the attempt until a lecturer reopens it; `review` flags the
 * attempt for faculty review and the candidate keeps working. Authored per
 * exam and enforced by the server, never by the browser.
 */
export type ExamWarningPolicy = 'remove' | 'review';

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
    /**
     * What reaching the tolerance does. `remove` (the default) takes the
     * candidate out of the paper until a lecturer reopens the attempt;
     * `review` flags the attempt and lets them keep working.
     */
    warning_policy?: ExamWarningPolicy;
    device_detection_enabled?: boolean;
    obstruction_threshold_seconds?: number;
    max_attempts?: number;
    allowed_cidrs?: string[];
  };
  status: ExamStatus;
  created_by_id?: string | null;
  created_at: string;
  questions_count: number;
  questions: ExamQuestion[];
}

/**
 * The only examination configuration a candidate may see.
 * The server never sends grading internals to a candidate.
 */
export interface ExamStudentConfig {
  proctoring_enabled: boolean;
  max_attempts: number;
  /** Disclosed to the candidate before the paper starts. */
  warning_policy?: ExamWarningPolicy;
  /** On-device camera analysis for prohibited electronics (ADR-024). */
  device_detection_enabled?: boolean;
  /** Seconds of continuous camera obstruction before it is reported (D-12). */
  obstruction_threshold_seconds?: number;
  /** Days after which captured evidence images are erased (D-2); 0 = kept. */
  evidence_retention_days?: number;
}

/**
 * Examination metadata as returned to a candidate (and to the exam list for
 * every role). Deliberately has no `questions`: answer material is only ever
 * delivered through the staff-only exam detail endpoint.
 */
export interface ExamSummary {
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
  status: ExamStatus;
  questions_count: number;
  config: Partial<ExamStudentConfig>;
  /**
   * The candidate's own latest attempt status for this exam, when known.
   * One of: in_progress | submitted | auto_submitted | graded | locked_violation | null
   */
  latest_attempt_status?: string | null;
  /**
   * How many attempts this candidate has already used. Compare with
   * `config.max_attempts` to decide whether a further attempt is permitted.
   */
  attempts_used?: number;
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

/**
 * A random paper drawn on the server from the syllabus scope.
 *
 * `question_bank_ids` narrows the pool to specific banks; leaving it empty
 * makes the whole course/department pool the syllabus. `tags` are the syllabus
 * topics (each question's tags), which is how a lecturer scopes a paper to a
 * unit of the syllabus without hand-picking questions.
 */
export interface ExamGenerateInput {
  question_bank_ids?: string[];
  tags?: string[];
  difficulties?: string[];
  question_types?: string[];
  question_count?: number;
  replace_existing?: boolean;
  shuffle?: boolean;
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
  /** Server-authoritative integrity configuration for this attempt. */
  proctoring_enabled: boolean;
  warning_policy?: ExamWarningPolicy;
  device_detection_enabled?: boolean;
  obstruction_threshold_seconds?: number;
  /** Days after which captured evidence images are erased (D-2); 0 = kept. */
  evidence_retention_days?: number;
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
  /** The attempt awaits faculty integrity review (ADR-023). Server-derived. */
  flagged_for_review?: boolean;
  /** When the tolerance was crossed and the review flag was stamped. */
  review_flagged_at?: string | null;
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
  /** The policy in force for this attempt, as the server enforces it. */
  warning_policy?: ExamWarningPolicy;
}

export interface UnlockAttemptPayload {
  reason?: string;
  reset_violations?: boolean;
}


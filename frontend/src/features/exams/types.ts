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
    /** Dwell tier the paper is run at (ADR-029). */
    integrity_sensitivity?: ExamIntegritySensitivity;
    face_monitoring_enabled?: boolean;
    hand_monitoring_enabled?: boolean;
    audio_monitoring_enabled?: boolean;
    mouth_monitoring_enabled?: boolean;
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
  /**
   * The disclosed integrity allowance: how many recorded events this attempt
   * tolerates. Shown before the paper starts, not after the first event.
   */
  max_violations?: number;
  /**
   * Disclosed gap after a counted warning. Signals inside it are recorded but
   * cannot spend another warning, so a burst cannot empty the allowance.
   */
  warning_cooldown_seconds?: number;
  /** Disclosed to the candidate before the paper starts. */
  warning_policy?: ExamWarningPolicy;
  /** On-device camera analysis for prohibited electronics (ADR-024). */
  device_detection_enabled?: boolean;
  /** The dwell tier this paper runs at, and the camera cues it switches on. */
  integrity_sensitivity?: ExamIntegritySensitivity;
  face_monitoring_enabled?: boolean;
  hand_monitoring_enabled?: boolean;
  audio_monitoring_enabled?: boolean;
  mouth_monitoring_enabled?: boolean;
  /** Every threshold the candidate is held to, in milliseconds. */
  dwell_ms?: ExamDwellMs;
  /** Seconds of continuous camera obstruction before it is reported (D-12). */
  obstruction_threshold_seconds?: number;
  /** Days after which captured evidence images are erased (D-2); 0 = kept. */
  evidence_retention_days?: number;
  /** The demonstration paper; its stopped screen restarts the demo in one click. */
  demo?: boolean;
}

/**
 * How tightly a paper's camera cues are enforced (ADR-029).
 *
 * `standard` is what every assessment authored before the switch existed was
 * already held to, so an upgrade never silently tightens a cohort's paper.
 */
export type ExamIntegritySensitivity = 'relaxed' | 'standard' | 'strict';

/** The dwell values a tier implies, as the server discloses them. */
export interface ExamDwellMs {
  /** Head turned past the yaw threshold. */
  turn?: number;
  /** No face visible. */
  absence?: number;
  /** A hand held at the face. */
  hand?: number;
  /** A second voice sustained in the room. */
  voice?: number;
  /** Talking-shaped mouth movement while facing the paper. */
  mouth?: number;
}

/**
 * The dwell values every tier implies, mirrored from the server's
 * `INTEGRITY_DWELL_MS` so the authoring form can show an author what each tier
 * will mean in seconds before they pick it.
 *
 * Presentation only: the value the candidate is held to is always the one the
 * server sends with the delivery, never this table.
 */
export const INTEGRITY_DWELL_MS: Record<ExamIntegritySensitivity, Required<ExamDwellMs>> = {
  relaxed: { turn: 3_000, absence: 6_000, hand: 6_000, voice: 6_000, mouth: 4_500 },
  standard: { turn: 2_000, absence: 3_000, hand: 3_500, voice: 3_500, mouth: 3_000 },
  strict: { turn: 1_200, absence: 2_000, hand: 2_000, voice: 2_000, mouth: 2_000 },
};

/** The name each tier is called on screen, in one place. */
export const SENSITIVITY_LABEL: Record<ExamIntegritySensitivity, string> = {
  relaxed: 'Relaxed',
  standard: 'Standard',
  strict: 'Strict',
};

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
  /** Integrity counters as the server holds them, so a resume shows the truth. */
  violations_count?: number;
  max_violations?: number;
  /** Server-owned gap between counted warnings, echoed for the brief copy. */
  warning_cooldown_seconds?: number;
  /** A counted warning still awaits acknowledgement (restored on a resume). */
  warning_pending?: boolean;
  device_detection_enabled?: boolean;
  /** The dwell tier this attempt runs at, and the monitoring it switches on. */
  integrity_sensitivity?: ExamIntegritySensitivity;
  face_monitoring_enabled?: boolean;
  hand_monitoring_enabled?: boolean;
  audio_monitoring_enabled?: boolean;
  mouth_monitoring_enabled?: boolean;
  dwell_ms?: ExamDwellMs;
  obstruction_threshold_seconds?: number;
  /** Days after which captured evidence images are erased (D-2); 0 = kept. */
  evidence_retention_days?: number;
  /** True for the demo paper, whose stopped screen offers a fresh sitting. */
  demo?: boolean;
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
  /**
   * The candidate was stopped at the tolerance and has asked to continue. The
   * attempt is still locked; approving it is what reopens the paper.
   */
  resume_requested?: boolean;
  resume_requested_at?: string | null;
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
  /** Server-classified source; camera/model observations are never violations. */
  event_category?: 'browser_signal' | 'camera_observation' | 'evidence';
  /** Present after the retained image has been erased. */
  evidence_purged_at?: string | null;
}

export interface ProctoringStatus {
  violations_count: number;
  max_violations: number;
  auto_submitted: boolean;
  warning?: string | null;
  /** A counted warning still awaits acknowledgement; the ladder is paused. */
  warning_pending?: boolean;
  is_locked?: boolean;
  status?: string;
  /** The policy in force for this attempt, as the server enforces it. */
  warning_policy?: ExamWarningPolicy;
  event_category?: 'browser_signal' | 'camera_observation' | 'evidence' | null;
}

export interface UnlockAttemptPayload {
  reason?: string;
  reset_violations?: boolean;
}


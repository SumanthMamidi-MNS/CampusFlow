export interface RubricCriterion {
  criterion: string;
  max_points: number;
  description?: string;
}

export interface SubmissionGrade {
  id: string;
  submission_id: string;
  graded_by_id?: string;
  graded_by_name?: string;
  marks_obtained: number;
  penalty_deducted: number;
  final_marks: number;
  feedback?: string;
  rubric_evaluation?: Record<string, any>;
  graded_at: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name?: string;
  student_email?: string;
  status: 'submitted' | 'graded' | 'returned' | 'draft';
  submitted_at: string;
  content_text?: string;
  file_path?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  is_late: boolean;
  late_days: number;
  grade?: SubmissionGrade;
}

export interface Assignment {
  id: string;
  course_offering_id: string;
  title: string;
  description?: string;
  assignment_type: string;
  due_date: string;
  total_marks: number;
  pass_marks?: number;
  weightage: number;
  allow_late: boolean;
  late_penalty_percent_per_day: number;
  max_late_days: number;
  rubric?: RubricCriterion[];
  is_published: boolean;
  published_at?: string;
  created_by_id?: string;
  created_at: string;
  my_submission?: AssignmentSubmission;
  submissions_count?: number;
}

export interface CreateAssignmentPayload {
  title: string;
  description?: string;
  assignment_type?: string;
  due_date: string;
  total_marks: number;
  pass_marks?: number;
  weightage: number;
  allow_late: boolean;
  late_penalty_percent_per_day: number;
  max_late_days: number;
  rubric?: RubricCriterion[];
  is_published: boolean;
}

export interface GradebookStudentEntry {
  student_id: string;
  student_name: string;
  student_email: string;
  enrollment_status: string;
  assignment_scores: Record<string, number | null>;
  total_weighted_score: number;
  max_possible_weighted: number;
  percentage: number;
}

export interface GradebookResponse {
  course_offering_id: string;
  course_title: string;
  assignments: Array<{
    id: string;
    title: string;
    total_marks: number;
    weightage: number;
  }>;
  students: GradebookStudentEntry[];
}

export interface DepartmentEnrollmentStat {
  department_id: string;
  department_name: string;
  code: string;
  courses_count: number;
  students_enrolled: number;
}

export interface RecentAuditActivity {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  timestamp: string;
}

export interface InstitutionalOverview {
  total_students: number;
  total_faculty: number;
  total_departments: number;
  total_courses: number;
  total_exams: number;
  total_submissions: number;
  overall_pass_rate: number;
  department_enrollment_breakdown: DepartmentEnrollmentStat[];
  recent_activity: RecentAuditActivity[];
}

export interface CourseAnalytics {
  course_offering_id: string;
  course_code: string;
  course_title: string;
  total_enrolled: number;
  assignment_completion_rate: number;
  average_assignment_score?: number | null;
  exam_average_score?: number | null;
  overall_course_pass_rate: number;
  grade_distribution: Record<string, number>;
}

export interface ExamAnalytics {
  exam_id: string;
  exam_title: string;
  total_attempts: number;
  graded_attempts: number;
  average_score?: number | null;
  median_score?: number | null;
  highest_score?: number | null;
  lowest_score?: number | null;
  pass_percentage?: number | null;
  score_brackets: Record<string, number>;
  violation_stats: {
    total_violations: number;
    attempts_with_violations: number;
    auto_submitted_breaches: number;
  };
}

export interface StudentScoreSummary {
  type: 'exam' | 'assignment';
  title: string;
  score: number;
  percentage: number;
  date: string;
}

export interface StudentDashboardAnalytics {
  enrolled_courses_count: number;
  completed_assignments_count: number;
  pending_assignments_count: number;
  completed_exams_count: number;
  upcoming_exams_count: number;
  overall_average_percentage?: number | null;
  recent_scores: StudentScoreSummary[];
}

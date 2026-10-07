export type ExecutionStatus =
  | 'success'
  | 'compile_error'
  | 'runtime_error'
  | 'timeout'
  | 'memory_exceeded'
  | 'internal_error';

export type SubmissionStatus = 'passed' | 'partial' | 'failed' | 'error';

export interface CodingProblem {
  id: string;
  course_offering_id: string;
  course_code?: string | null;
  course_title?: string | null;
  created_by_id?: string | null;
  title: string;
  description?: string | null;
  language: string;
  starter_code?: string | null;
  total_marks: number;
  time_limit_ms: number;
  memory_limit_kb: number;
  is_published: boolean;
  due_date?: string | null;
  created_at: string;
  visible_test_case_count: number;
  my_best_score?: number | null;
  my_submission_count: number;
}

export interface CodingTestCase {
  id: string;
  problem_id: string;
  name: string;
  stdin: string;
  expected_output: string;
  is_hidden: boolean;
  comparison: 'trimmed' | 'exact';
  marks?: number | null;
  sort_order: number;
}

export interface CodeRunResult {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exit_code?: number | null;
  duration_ms?: number | null;
  timed_out: boolean;
  message?: string | null;
}

export interface CodingTestResult {
  id: string;
  name: string;
  passed: boolean;
  status: string;
  expected_output?: string | null;
  actual_output?: string | null;
  stderr?: string | null;
  duration_ms?: number | null;
  is_hidden: boolean;
}

export interface CodingSubmission {
  id: string;
  problem_id: string;
  student_id: string;
  student_name?: string | null;
  student_email?: string | null;
  language: string;
  status: SubmissionStatus;
  score: number;
  max_score: number;
  passed_tests: number;
  total_tests: number;
  duration_ms?: number | null;
  diagnostics?: string | null;
  submitted_at: string;
  results: CodingTestResult[];
}

export interface RunnerHealth {
  enabled: boolean;
  backend: string;
  reachable: boolean;
  detail?: string | null;
}

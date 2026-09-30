export type QuestionType =
  | 'mcq'
  | 'msq'
  | 'true_false'
  | 'numerical'
  | 'short_answer'
  | 'essay'
  | 'fill_blank';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type QuestionStatus = 'draft' | 'approved' | 'archived';

export interface QuestionOption {
  id?: string;
  question_id?: string;
  label: string;
  body: string;
  is_correct: boolean;
  sort_order: number;
}

export interface Question {
  id: string;
  question_bank_id: string;
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  marks: number;
  negative_marks: number;
  body: string;
  explanation?: string | null;
  tags?: string[] | null;
  metadata_info?: Record<string, any> | null;
  status: QuestionStatus;
  created_by_id?: string | null;
  approved_by_id?: string | null;
  created_at: string;
  options: QuestionOption[];
}

export interface QuestionBank {
  id: string;
  department_id: string;
  department_name?: string | null;
  course_id?: string | null;
  course_title?: string | null;
  title: string;
  description?: string | null;
  created_by_id?: string | null;
  created_at: string;
  questions_count: number;
}

export interface QuestionBankCreateInput {
  department_id: string;
  course_id?: string | null;
  title: string;
  description?: string | null;
}

export interface QuestionOptionCreateInput {
  label: string;
  body: string;
  is_correct: boolean;
  sort_order?: number;
}

export interface QuestionCreateInput {
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  marks: number;
  negative_marks?: number;
  body: string;
  explanation?: string | null;
  tags?: string[] | null;
  metadata_info?: Record<string, any> | null;
  status?: QuestionStatus;
  options?: QuestionOptionCreateInput[];
}

export interface BulkImportResult {
  imported_count: number;
  failed_count: number;
  errors: string[];
}

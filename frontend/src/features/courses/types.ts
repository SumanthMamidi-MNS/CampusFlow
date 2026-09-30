export interface Course {
  id: string;
  code: string;
  title: string;
  department_id: string;
  credits: number;
  description?: string | null;
  created_at: string;
}

export interface FacultyAssignment {
  faculty_id: string;
  role: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export interface CourseOffering {
  id: string;
  course_id: string;
  academic_term_id: string;
  batch_id?: string | null;
  section: string;
  status: 'active' | 'completed' | 'archived';
  course_title?: string | null;
  course_code?: string | null;
  faculty: FacultyAssignment[];
  created_at: string;
}

export interface Enrollment {
  id: string;
  course_offering_id: string;
  student_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  student_name?: string | null;
  student_email?: string | null;
  status: string;
  enrolled_at: string;
}

export interface MaterialFolder {
  id: string;
  course_offering_id: string;
  parent_id?: string | null;
  title: string;
  sort_order: number;
  created_at: string;
}

export interface Material {
  id: string;
  course_offering_id: string;
  folder_id?: string | null;
  title: string;
  material_type: 'file' | 'link' | 'text';
  file_path?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  url?: string | null;
  content_text?: string | null;
  sort_order: number;
  is_published: boolean;
  published_at?: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  course_offering_id: string;
  author_id: string;
  author_name?: string | null;
  title: string;
  body: string;
  is_pinned: boolean;
  published_at: string;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
}

export interface Program {
  id: string;
  name: string;
  code: string;
  department_id: string;
  degree_type: string;
  duration_years: number;
}

export interface AcademicTerm {
  id: string;
  name: string;
  term_type: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

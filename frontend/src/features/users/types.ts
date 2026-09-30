export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  status: 'pending' | 'active' | 'inactive';
  roles: string[];
  created_at: string;
  updated_at: string;
}

export interface UserCreateInput {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  password: string;
  roles: string[];
  status?: 'pending' | 'active' | 'inactive';
}

export interface UserUpdateInput {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  password?: string;
  roles?: string[];
  status?: 'pending' | 'active' | 'inactive';
}

export interface BulkImportResult {
  total_processed: number;
  created_count: number;
  skipped_count: number;
  errors: Array<{
    row: number;
    email: string;
    error: string;
  }>;
}

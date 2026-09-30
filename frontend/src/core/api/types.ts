export interface ApiResponse<T> {
  data: T;
  meta: {
    request_id: string;
    timestamp: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    page_size: number;
    request_id: string;
    timestamp: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{
      field?: string;
      message: string;
    }>;
  };
  meta: {
    request_id: string;
  };
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[];
  status: 'pending' | 'active' | 'inactive';
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/core/api/client';
import type { PaginatedResponse, ApiResponse } from '@/core/api/types';
import type { User, UserCreateInput, UserUpdateInput, BulkImportResult } from './types';

export function useUsers(params: {
  search?: string;
  status?: string;
  role?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedResponse<User>>('/users', {
        params: {
          search: params.search || undefined,
          status: params.status || undefined,
          role: params.role || undefined,
          page: params.page || 1,
          page_size: params.pageSize || 20,
        },
      });
      return response.data;
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UserCreateInput) => {
      const response = await apiClient.post<ApiResponse<User>>('/users', payload);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UserUpdateInput }) => {
      const response = await apiClient.patch<ApiResponse<User>>(`/users/${id}`, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useBulkImportUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post<ApiResponse<BulkImportResult>>(
        '/users/bulk-import',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

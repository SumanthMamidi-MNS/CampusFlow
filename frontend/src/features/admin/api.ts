import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/core/api/types';
import type { Institution, InstitutionUpdatePayload } from './types';

export function useInstitution() {
  return useQuery({
    queryKey: ['institution-settings'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Institution>>('/institution');
      return res.data.data;
    },
  });
}

export function useUpdateInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InstitutionUpdatePayload) => {
      const res = await apiClient.put<ApiResponse<Institution>>('/institution', payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institution-settings'] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type { Institution, InstitutionUpdatePayload } from './types';

export function useInstitution() {
  return useQuery({
    queryKey: ['institution-settings'],
    queryFn: async () => {
      const res = await apiClient.get<Institution>('/institution');
      return res.data;
    },
  });
}

export function useUpdateInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InstitutionUpdatePayload) => {
      const res = await apiClient.put<Institution>('/institution', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institution-settings'] });
    },
  });
}

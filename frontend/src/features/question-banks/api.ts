import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type {
  BulkImportResult,
  Question,
  QuestionBank,
  QuestionBankCreateInput,
  QuestionCreateInput,
} from './types';

// ── Question Banks Queries & Mutations ──────────────────────────────────────

export function useQuestionBanks(params?: { department_id?: string; course_id?: string }) {
  return useQuery({
    queryKey: ['question-banks', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.department_id) searchParams.set('department_id', params.department_id);
      if (params?.course_id) searchParams.set('course_id', params.course_id);
      const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const res = await apiClient.get<QuestionBank[]>(`/question-banks${query}`);
      return res.data;
    },
  });
}

export function useQuestionBank(bankId: string) {
  return useQuery({
    queryKey: ['question-bank', bankId],
    queryFn: async () => {
      const res = await apiClient.get<QuestionBank>(`/question-banks/${bankId}`);
      return res.data;
    },
    enabled: Boolean(bankId),
  });
}

export function useCreateQuestionBank() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: QuestionBankCreateInput) => {
      const res = await apiClient.post<QuestionBank>('/question-banks', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-banks'] });
    },
  });
}

export function useDeleteQuestionBank() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bankId: string) => {
      const res = await apiClient.delete<{ message: string }>(`/question-banks/${bankId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-banks'] });
    },
  });
}

// ── Questions Queries & Mutations ───────────────────────────────────────────

export function useQuestions(
  bankId: string,
  filters?: {
    question_type?: string;
    difficulty?: string;
    status?: string;
    search?: string;
  }
) {
  return useQuery({
    queryKey: ['questions', bankId, filters],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (filters?.question_type) searchParams.set('question_type', filters.question_type);
      if (filters?.difficulty) searchParams.set('difficulty', filters.difficulty);
      if (filters?.status) searchParams.set('status', filters.status);
      if (filters?.search) searchParams.set('search', filters.search);
      const query = searchParams.toString() ? `?${searchParams.toString()}` : '';

      const res = await apiClient.get<Question[]>(`/question-banks/${bankId}/questions${query}`);
      return res.data;
    },
    enabled: Boolean(bankId),
  });
}

export function useCreateQuestion(bankId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: QuestionCreateInput) => {
      const res = await apiClient.post<Question>(
        `/question-banks/${bankId}/questions`,
        payload
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', bankId] });
      queryClient.invalidateQueries({ queryKey: ['question-bank', bankId] });
      queryClient.invalidateQueries({ queryKey: ['question-banks'] });
    },
  });
}

export function useApproveQuestion(bankId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (questionId: string) => {
      const res = await apiClient.post<Question>(`/questions/${questionId}/approve`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', bankId] });
    },
  });
}

export function useDeleteQuestion(bankId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (questionId: string) => {
      const res = await apiClient.delete<{ message: string }>(`/questions/${questionId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', bankId] });
      queryClient.invalidateQueries({ queryKey: ['question-bank', bankId] });
      queryClient.invalidateQueries({ queryKey: ['question-banks'] });
    },
  });
}

export function useBulkImportQuestions(bankId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post<BulkImportResult>(
        `/question-banks/${bankId}/import-csv`,
        formData
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', bankId] });
      queryClient.invalidateQueries({ queryKey: ['question-bank', bankId] });
      queryClient.invalidateQueries({ queryKey: ['question-banks'] });
    },
  });
}

export async function downloadQuestionsCsv(bankId: string, title?: string) {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/v1/question-banks/${bankId}/export-csv`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  });
  if (!response.ok) {
    throw new Error('Failed to export questions CSV');
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title ? title.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'question_bank'}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

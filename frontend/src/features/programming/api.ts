import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/core/api/types';
import type {
  CodeRunResult,
  CodingProblem,
  CodingSubmission,
  CodingTestCase,
  RunnerHealth,
} from './types';

export function useCodingProblems() {
  return useQuery({
    queryKey: ['coding-problems'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CodingProblem[]>>('/programming/problems');
      return res.data.data;
    },
  });
}

export function useCodingProblem(problemId: string) {
  return useQuery({
    queryKey: ['coding-problem', problemId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CodingProblem>>(`/programming/problems/${problemId}`);
      return res.data.data;
    },
    enabled: Boolean(problemId),
  });
}

export function useCreateCodingProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      course_offering_id: string;
      title: string;
      description?: string;
      language?: string;
      starter_code?: string;
      total_marks: number;
      time_limit_ms?: number;
      is_published?: boolean;
    }) => {
      const res = await apiClient.post<ApiResponse<CodingProblem>>('/programming/problems', payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coding-problems'] });
    },
  });
}

export function useDeleteCodingProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (problemId: string) => {
      const res = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(
        `/programming/problems/${problemId}`
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coding-problems'] });
    },
  });
}

export function useTestCases(problemId: string, enabled = true) {
  return useQuery({
    queryKey: ['coding-test-cases', problemId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CodingTestCase[]>>(
        `/programming/problems/${problemId}/test-cases`
      );
      return res.data.data;
    },
    enabled: Boolean(problemId) && enabled,
    retry: false,
  });
}

export function useAddTestCase(problemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      stdin: string;
      expected_output: string;
      is_hidden: boolean;
      comparison?: 'trimmed' | 'exact';
    }) => {
      const res = await apiClient.post<ApiResponse<CodingTestCase>>(
        `/programming/problems/${problemId}/test-cases`,
        payload
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coding-test-cases', problemId] });
    },
  });
}

export function useDeleteTestCase(problemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (testCaseId: string) => {
      const res = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(
        `/programming/test-cases/${testCaseId}`
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coding-test-cases', problemId] });
    },
  });
}

export function useRunCode(problemId: string) {
  return useMutation({
    mutationFn: async ({ sourceCode, stdin }: { sourceCode: string; stdin: string }) => {
      const res = await apiClient.post<ApiResponse<CodeRunResult>>(
        `/programming/problems/${problemId}/run`,
        { source_code: sourceCode, stdin }
      );
      return res.data.data;
    },
  });
}

export function useSubmitCode(problemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceCode }: { sourceCode: string }) => {
      const res = await apiClient.post<ApiResponse<CodingSubmission>>(
        `/programming/problems/${problemId}/submit`,
        { source_code: sourceCode, stdin: '' }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coding-problem', problemId] });
      queryClient.invalidateQueries({ queryKey: ['coding-problems'] });
      queryClient.invalidateQueries({ queryKey: ['coding-my-submissions', problemId] });
    },
  });
}

export function useMyCodeSubmissions(problemId: string) {
  return useQuery({
    queryKey: ['coding-my-submissions', problemId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CodingSubmission[]>>(
        `/programming/problems/${problemId}/my-submissions`
      );
      return res.data.data;
    },
    enabled: Boolean(problemId),
    retry: false,
  });
}

export function useProblemSubmissions(problemId: string, enabled = true) {
  return useQuery({
    queryKey: ['coding-submissions', problemId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CodingSubmission[]>>(
        `/programming/problems/${problemId}/submissions`
      );
      return res.data.data;
    },
    enabled: Boolean(problemId) && enabled,
    retry: false,
  });
}

export function useRunnerHealth() {
  return useQuery({
    queryKey: ['coding-runner-health'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<RunnerHealth>>('/programming/health');
      return res.data.data;
    },
    retry: false,
  });
}

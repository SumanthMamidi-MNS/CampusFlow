import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type {
  Exam,
  ExamAttemptSummary,
  ExamCreateInput,
  ExamDelivery,
  ExamUpdateInput,
  ProctoringEvent,
  ProctoringEventCreate,
  ProctoringStatus,
  SaveAnswerPayload,
  StudentExamResult,
} from './types';

// ── Exam Queries & Mutations ────────────────────────────────────────────────

export function useExams(courseOfferingId?: string, status?: string) {
  return useQuery({
    queryKey: ['exams', courseOfferingId, status],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (courseOfferingId) searchParams.set('course_offering_id', courseOfferingId);
      if (status) searchParams.set('status', status);
      const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const res = await apiClient.get<Exam[]>(`/exams${query}`);
      return res.data;
    },
  });
}

export function useExam(examId: string) {
  return useQuery({
    queryKey: ['exam', examId],
    queryFn: async () => {
      const res = await apiClient.get<Exam>(`/exams/${examId}`);
      return res.data;
    },
    enabled: Boolean(examId),
  });
}

export function useCreateExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ExamCreateInput) => {
      const res = await apiClient.post<Exam>('/exams', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useUpdateExam(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ExamUpdateInput) => {
      const res = await apiClient.put<Exam>(`/exams/${examId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useDeleteExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (examId: string) => {
      const res = await apiClient.delete<{ message: string }>(`/exams/${examId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useAddQuestionsToExam(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (questions: { question_id: string; marks_override?: number; sort_order?: number }[]) => {
      const res = await apiClient.post<Exam>(`/exams/${examId}/questions`, { questions });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useRemoveQuestionFromExam(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (examQuestionId: string) => {
      const res = await apiClient.delete<{ message: string }>(`/exams/${examId}/questions/${examQuestionId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

// ── Exam Delivery (Student) ─────────────────────────────────────────────────

export function useStartExam(examId: string) {
  return useMutation({
    mutationFn: async (fingerprint?: string) => {
      const res = await apiClient.post<ExamDelivery>(`/exams/${examId}/start`, {
        browser_fingerprint: fingerprint || null,
      });
      return res.data;
    },
  });
}

export function useSaveExamAnswers(attemptId: string) {
  return useMutation({
    mutationFn: async (answers: SaveAnswerPayload[]) => {
      const res = await apiClient.put<{ status: string; count: number }>(
        `/exam-attempts/${attemptId}/answers`,
        { answers }
      );
      return res.data;
    },
  });
}

export function useSubmitExam(attemptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{
        attempt_id: string;
        status: string;
        total_score: number | null;
        percentage: number | null;
      }>(`/exam-attempts/${attemptId}/submit`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-attempts'] });
      queryClient.invalidateQueries({ queryKey: ['my-result'] });
    },
  });
}

// ── Grading & Results ───────────────────────────────────────────────────────

export function useExamAttempts(examId: string) {
  return useQuery({
    queryKey: ['exam-attempts', examId],
    queryFn: async () => {
      const res = await apiClient.get<ExamAttemptSummary[]>(`/exams/${examId}/attempts`);
      return res.data;
    },
    enabled: Boolean(examId),
  });
}

export function useGradeExamResponse(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ responseId, marksAwarded, feedback }: { responseId: string; marksAwarded: number; feedback?: string }) => {
      const res = await apiClient.post<{ response_id: string; attempt_total_score: number; attempt_status: string }>(
        `/exam-responses/${responseId}/grade`,
        { marks_awarded: marksAwarded, feedback: feedback || null }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-attempts', examId] });
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

export function usePublishExamResults(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ exam_id: string; status: string }>(`/exams/${examId}/publish`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useStudentExamResult(examId: string) {
  return useQuery({
    queryKey: ['my-result', examId],
    queryFn: async () => {
      const res = await apiClient.get<StudentExamResult>(`/exams/${examId}/my-result`);
      return res.data;
    },
    enabled: Boolean(examId),
    retry: false,
  });
}

// ── Proctoring Hooks ────────────────────────────────────────────────────────

export function useRecordProctoringEvent(attemptId: string) {
  return useMutation({
    mutationFn: async (payload: ProctoringEventCreate) => {
      const res = await apiClient.post<ProctoringStatus>(
        `/exam-attempts/${attemptId}/proctoring-events`,
        payload
      );
      return res.data;
    },
  });
}

export function useProctoringTimeline(attemptId: string | null) {
  return useQuery({
    queryKey: ['proctoring-timeline', attemptId],
    queryFn: async () => {
      if (!attemptId) return [];
      const res = await apiClient.get<ProctoringEvent[]>(
        `/exam-attempts/${attemptId}/proctoring-events`
      );
      return res.data;
    },
    enabled: Boolean(attemptId),
  });
}


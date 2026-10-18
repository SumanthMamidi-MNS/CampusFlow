import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/core/api/types';
import type {
  Exam,
  ExamAttemptSummary,
  ExamCreateInput,
  ExamDelivery,
  ExamGenerateInput,
  ExamResponseDetail,
  ExamSummary,
  ExamUpdateInput,
  ProctoringEvent,
  ProctoringEventCreate,
  ProctoringStatus,
  SaveAnswerPayload,
  StudentExamResult,
} from './types';

// ── Exam Queries & Mutations ────────────────────────────────────────────────

/**
 * Exam list for the current user.
 *
 * The server returns a candidate-safe summary to candidates and the full
 * definition to examination staff, so this deliberately types the response as
 * the common (safe) shape.
 */
export function useExams(courseOfferingId?: string, status?: string) {
  return useQuery({
    queryKey: ['exams', courseOfferingId, status],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (courseOfferingId) searchParams.set('course_offering_id', courseOfferingId);
      if (status) searchParams.set('status', status);
      const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const res = await apiClient.get<ApiResponse<ExamSummary[]>>(`/exams${query}`);
      return res.data.data;
    },
    // The list is the source of truth for whether a student may begin/resume an
    // exam, so keep it reasonably fresh without spamming the server while the
    // student is reading the page.
    staleTime: 10_000,
  });
}

/**
 * Candidate-safe brief for one exam (metadata only).
 *
 * This is what the assessment-taking surface uses before an attempt starts;
 * it never returns question content or answer keys.
 */
export function useExamBrief(examId: string) {
  return useQuery({
    queryKey: ['exam-brief', examId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ExamSummary>>(`/exams/${examId}/public`);
      return res.data.data;
    },
    enabled: Boolean(examId),
    retry: false,
  });
}

/** Full exam definition for authorised examination staff (includes answer keys). */
export function useExam(examId: string) {
  return useQuery({
    queryKey: ['exam', examId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Exam>>(`/exams/${examId}`);
      return res.data.data;
    },
    enabled: Boolean(examId),
  });
}

export function useCreateExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ExamCreateInput) => {
      const res = await apiClient.post<ApiResponse<Exam>>('/exams', payload);
      return res.data.data;
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
      const res = await apiClient.put<ApiResponse<Exam>>(`/exams/${examId}`, payload);
      return res.data.data;
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
      const res = await apiClient.delete<ApiResponse<{ message: string }>>(`/exams/${examId}`);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

/**
 * Draw a random paper from the syllabus scope (banks + topic tags + difficulty)
 * on the server. `replace_existing` swaps the current paper for the new draw;
 * otherwise the drawn questions are appended.
 */
export function useGenerateExamQuestions(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ExamGenerateInput): Promise<Exam> => {
      const res = await apiClient.post<ApiResponse<Exam>>(
        `/exams/${examId}/generate-questions`,
        payload
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

/**
 * Same draw, for the scheduling flow where the exam id only exists after the
 * exam has been created.
 */
export function useGenerateExamQuestionsAfterCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      examId,
      payload,
    }: {
      examId: string;
      payload: ExamGenerateInput;
    }): Promise<Exam> => {
      const res = await apiClient.post<ApiResponse<Exam>>(
        `/exams/${examId}/generate-questions`,
        payload
      );
      return res.data.data;
    },
    onSuccess: (_data, { examId }) => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

export function useAddQuestionsToExam(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (questions: { question_id: string; marks_override?: number; sort_order?: number }[]) => {
      const res = await apiClient.post<ApiResponse<Exam>>(`/exams/${examId}/questions`, { questions });
      return res.data.data;
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
      const res = await apiClient.delete<ApiResponse<{ message: string }>>(`/exams/${examId}/questions/${examQuestionId}`);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });
}

// ── Exam Delivery (Student) ─────────────────────────────────────────────────

export function useStartExam(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fingerprint?: string) => {
      const res = await apiClient.post<ApiResponse<ExamDelivery>>(`/exams/${examId}/start`, {
        browser_fingerprint: fingerprint || null,
      });
      return res.data.data;
    },
    onSuccess: () => {
      // Keep the exam list fresh so a resumed attempt is reflected everywhere.
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exam-brief', examId] });
    },
  });
}

export function useSaveExamAnswers(attemptId: string) {
  return useMutation({
    mutationFn: async (answers: SaveAnswerPayload[]) => {
      const res = await apiClient.put<ApiResponse<{ status: string; count: number }>>(
        `/exam-attempts/${attemptId}/answers`,
        { answers }
      );
      return res.data.data;
    },
  });
}

export function useSubmitExam(attemptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiResponse<{
        attempt_id: string;
        status: string;
        total_score: number | null;
        percentage: number | null;
      }>>(`/exam-attempts/${attemptId}/submit`);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-attempts'] });
      queryClient.invalidateQueries({ queryKey: ['my-result'] });
    },
  });
}

// ── Grading & Results ───────────────────────────────────────────────────────

/**
 * Staff view of an exam's attempts. `flaggedOnly` narrows it to the integrity
 * review queue; the server does the filtering so the browser never decides what
 * counts as flagged.
 */
export function useExamAttempts(examId: string, flaggedOnly = false) {
  return useQuery({
    queryKey: ['exam-attempts', examId, flaggedOnly],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ExamAttemptSummary[]>>(
        `/exams/${examId}/attempts`,
        { params: flaggedOnly ? { flagged_only: true } : undefined }
      );
      return res.data.data;
    },
    enabled: Boolean(examId),
  });
}

export function useAttemptResponses(attemptId: string | null) {
  return useQuery({
    queryKey: ['attempt-responses', attemptId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ExamResponseDetail[]>>(
        `/exam-attempts/${attemptId}/responses`
      );
      return res.data.data;
    },
    enabled: Boolean(attemptId),
  });
}

export function useGradeExamResponse(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ responseId, marksAwarded, feedback }: { responseId: string; marksAwarded: number; feedback?: string }) => {
      const res = await apiClient.post<ApiResponse<{ response_id: string; attempt_total_score: number; attempt_status: string }>>(
        `/exam-responses/${responseId}/grade`,
        { marks_awarded: marksAwarded, feedback: feedback || null }
      );
      return res.data.data;
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
      const res = await apiClient.post<ApiResponse<{ exam_id: string; status: string }>>(`/exams/${examId}/publish`);
      return res.data.data;
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
      const res = await apiClient.get<ApiResponse<StudentExamResult>>(`/exams/${examId}/my-result`);
      return res.data.data;
    },
    enabled: Boolean(examId),
    retry: false,
  });
}

// ── Proctoring Hooks ────────────────────────────────────────────────────────

export function useRecordProctoringEvent(attemptId: string) {
  return useMutation({
    mutationFn: async (payload: ProctoringEventCreate): Promise<ProctoringStatus> => {
      const res = await apiClient.post<ApiResponse<ProctoringStatus>>(
        `/exam-attempts/${attemptId}/proctoring-events`,
        payload
      );
      return res.data.data;
    },
  });
}

export function useProctoringTimeline(attemptId: string | null) {
  return useQuery({
    queryKey: ['proctoring-timeline', attemptId],
    queryFn: async () => {
      if (!attemptId) return [] as ProctoringEvent[];
      const res = await apiClient.get<ApiResponse<ProctoringEvent[]>>(
        `/exam-attempts/${attemptId}/proctoring-events`
      );
      return res.data.data;
    },
    enabled: Boolean(attemptId),
  });
}

export function useUnlockExamAttempt(examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      attemptId,
      reason,
      resetViolations = true,
    }: {
      attemptId: string;
      reason?: string;
      resetViolations?: boolean;
    }) => {
      const res = await apiClient.post<
        ApiResponse<{
          attempt_id: string;
          status: string;
          proctor_violations_count: number;
          message: string;
        }>
      >(`/exams/${examId}/attempts/${attemptId}/unlock`, {
        reason: reason || 'Faculty authorized re-entry after integrity review',
        reset_violations: resetViolations,
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-attempts', examId] });
      queryClient.invalidateQueries({ queryKey: ['proctoring-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['exam', examId] });
    },
  });
}

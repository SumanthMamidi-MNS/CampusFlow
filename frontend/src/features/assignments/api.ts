import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/core/api/types';
import type {
  Assignment,
  AssignmentSubmission,
  CreateAssignmentPayload,
  GradebookResponse,
  MyCourseGrades,
  SubmissionGrade,
} from './types';

export function useAssignments(offeringId: string) {
  return useQuery({
    queryKey: ['assignments', offeringId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Assignment[]>>(
        `/course-offerings/${offeringId}/assignments`
      );
      return res.data.data;
    },
    enabled: Boolean(offeringId),
  });
}

export function useMyAssignments() {
  return useQuery({
    queryKey: ['my-assignments'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Assignment[]>>('/assignments/me');
      return res.data.data;
    },
  });
}

/** Submit a file to an assignment from the cross-course coursework view. */
export function useSubmitMyAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assignmentId,
      file,
      contentText,
    }: {
      assignmentId: string;
      file?: File;
      contentText?: string;
    }) => {
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        if (contentText) formData.append('content_text', contentText);
        const res = await apiClient.post<ApiResponse<AssignmentSubmission>>(
          `/assignments/${assignmentId}/submit-file`,
          formData
        );
        return res.data.data;
      }
      const res = await apiClient.post<ApiResponse<AssignmentSubmission>>(
        `/assignments/${assignmentId}/submit`,
        { content_text: contentText || '' }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}

export function useCreateAssignment(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAssignmentPayload) => {
      const res = await apiClient.post<ApiResponse<Assignment>>(
        `/course-offerings/${offeringId}/assignments`,
        payload
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', offeringId] });
      queryClient.invalidateQueries({ queryKey: ['gradebook', offeringId] });
    },
  });
}

export function useDeleteAssignment(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const res = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/assignments/${assignmentId}`);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', offeringId] });
      queryClient.invalidateQueries({ queryKey: ['gradebook', offeringId] });
    },
  });
}

export function useSubmitAssignmentText(assignmentId: string, offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contentText: string) => {
      const res = await apiClient.post<ApiResponse<AssignmentSubmission>>(
        `/assignments/${assignmentId}/submit`,
        { content_text: contentText }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', offeringId] });
      queryClient.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      queryClient.invalidateQueries({ queryKey: ['gradebook', offeringId] });
    },
  });
}

export function useSubmitAssignmentFile(assignmentId: string, offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, contentText }: { file: File; contentText?: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (contentText) {
        formData.append('content_text', contentText);
      }
      const res = await apiClient.post<ApiResponse<AssignmentSubmission>>(
        `/assignments/${assignmentId}/submit-file`,
        formData
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', offeringId] });
      queryClient.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      queryClient.invalidateQueries({ queryKey: ['gradebook', offeringId] });
    },
  });
}

export function useAssignmentSubmissions(assignmentId: string) {
  return useQuery({
    queryKey: ['submissions', assignmentId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<AssignmentSubmission[]>>(
        `/assignments/${assignmentId}/submissions`
      );
      return res.data.data;
    },
    enabled: Boolean(assignmentId),
  });
}

export function useGradeSubmission(assignmentId: string, offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      submissionId,
      marksObtained,
      feedback,
      rubricEvaluation,
    }: {
      submissionId: string;
      marksObtained: number;
      feedback?: string;
      rubricEvaluation?: Record<string, any>;
    }) => {
      const res = await apiClient.post<ApiResponse<SubmissionGrade>>(
        `/submissions/${submissionId}/grade`,
        {
          marks_obtained: marksObtained,
          feedback,
          rubric_evaluation: rubricEvaluation,
        }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      queryClient.invalidateQueries({ queryKey: ['assignments', offeringId] });
      queryClient.invalidateQueries({ queryKey: ['gradebook', offeringId] });
    },
  });
}

export function useGradebook(offeringId: string, enabled = true) {
  return useQuery({
    queryKey: ['gradebook', offeringId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<GradebookResponse>>(
        `/course-offerings/${offeringId}/gradebook`
      );
      return res.data.data;
    },
    // The cohort gradebook is instructor/admin data; students must not request it.
    enabled: Boolean(offeringId) && enabled,
  });
}

/**
 * The signed-in student's own marks in one course.
 *
 * This is the student-facing counterpart to the cohort gradebook: the server
 * scopes the response to the caller, so it is safe for every authenticated user.
 */
export function useMyCourseGrades(offeringId: string, enabled = true) {
  return useQuery({
    queryKey: ['my-grades', offeringId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<MyCourseGrades>>(
        `/course-offerings/${offeringId}/my-grades`
      );
      return res.data.data;
    },
    enabled: Boolean(offeringId) && enabled,
  });
}

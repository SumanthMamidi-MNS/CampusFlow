import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type {
  Assignment,
  AssignmentSubmission,
  CreateAssignmentPayload,
  GradebookResponse,
  SubmissionGrade,
} from './types';

export function useAssignments(offeringId: string) {
  return useQuery({
    queryKey: ['assignments', offeringId],
    queryFn: async () => {
      const res = await apiClient.get<Assignment[]>(
        `/course-offerings/${offeringId}/assignments`
      );
      return res.data;
    },
    enabled: Boolean(offeringId),
  });
}

export function useCreateAssignment(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAssignmentPayload) => {
      const res = await apiClient.post<Assignment>(
        `/course-offerings/${offeringId}/assignments`,
        payload
      );
      return res.data;
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
      const res = await apiClient.delete<{ deleted: boolean }>(`/assignments/${assignmentId}`);
      return res.data;
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
      const res = await apiClient.post<AssignmentSubmission>(
        `/assignments/${assignmentId}/submit`,
        { content_text: contentText }
      );
      return res.data;
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
      const res = await apiClient.post<AssignmentSubmission>(
        `/assignments/${assignmentId}/submit-file`,
        formData
      );
      return res.data;
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
      const res = await apiClient.get<AssignmentSubmission[]>(
        `/assignments/${assignmentId}/submissions`
      );
      return res.data;
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
      const res = await apiClient.post<SubmissionGrade>(
        `/submissions/${submissionId}/grade`,
        {
          marks_obtained: marksObtained,
          feedback,
          rubric_evaluation: rubricEvaluation,
        }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions', assignmentId] });
      queryClient.invalidateQueries({ queryKey: ['assignments', offeringId] });
      queryClient.invalidateQueries({ queryKey: ['gradebook', offeringId] });
    },
  });
}

export function useGradebook(offeringId: string) {
  return useQuery({
    queryKey: ['gradebook', offeringId],
    queryFn: async () => {
      const res = await apiClient.get<GradebookResponse>(
        `/course-offerings/${offeringId}/gradebook`
      );
      return res.data;
    },
    enabled: Boolean(offeringId),
  });
}

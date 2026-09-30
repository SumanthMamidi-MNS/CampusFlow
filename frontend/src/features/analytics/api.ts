import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/core/api/client';
import type { ApiResponse } from '@/core/api/types';
import type {
  CourseAnalytics,
  ExamAnalytics,
  InstitutionalOverview,
  StudentDashboardAnalytics,
} from './types';

export function useInstitutionalOverview() {
  return useQuery({
    queryKey: ['analytics-overview'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<InstitutionalOverview>>('/analytics/overview');
      return res.data.data;
    },
  });
}

export function useCourseAnalytics(courseOfferingId?: string) {
  return useQuery({
    queryKey: ['course-analytics', courseOfferingId],
    queryFn: async () => {
      if (!courseOfferingId) return null;
      const res = await apiClient.get<ApiResponse<CourseAnalytics>>(`/analytics/courses/${courseOfferingId}`);
      return res.data.data;
    },
    enabled: Boolean(courseOfferingId),
  });
}

export function useExamAnalytics(examId?: string) {
  return useQuery({
    queryKey: ['exam-analytics', examId],
    queryFn: async () => {
      if (!examId) return null;
      const res = await apiClient.get<ApiResponse<ExamAnalytics>>(`/analytics/exams/${examId}`);
      return res.data.data;
    },
    enabled: Boolean(examId),
  });
}

export function useStudentDashboardAnalytics() {
  return useQuery({
    queryKey: ['student-dashboard-analytics'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<StudentDashboardAnalytics>>('/analytics/student/me');
      return res.data.data;
    },
  });
}

export async function downloadExamResultsCsv(examId: string, examTitle: string) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/v1/exams/${examId}/export-results`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error('Failed to download exam results spreadsheet.');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const sanitizedTitle = examTitle.replace(/[^a-zA-Z0-9]/g, '_');
  a.download = `${sanitizedTitle}_results.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

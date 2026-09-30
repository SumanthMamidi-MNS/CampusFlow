import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/core/api/client';
import type { ApiResponse } from '@/core/api/types';
import type {
  AcademicTerm,
  Announcement,
  Course,
  CourseOffering,
  Department,
  Enrollment,
  Material,
  MaterialFolder,
  Program,
} from './types';

// ── Course Offerings ────────────────────────────────────────────────────────
export function useCourseOfferings(params?: { termId?: string; courseId?: string }) {
  return useQuery({
    queryKey: ['course-offerings', params],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CourseOffering[]>>('/course-offerings', {
        params: {
          term_id: params?.termId || undefined,
          course_id: params?.courseId || undefined,
        },
      });
      return res.data.data;
    },
  });
}

export function useCourseOffering(id: string) {
  return useQuery({
    queryKey: ['course-offering', id],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CourseOffering>>(`/course-offerings/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Course[]>>('/courses');
      return res.data.data;
    },
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      code: string;
      title: string;
      department_id: string;
      credits: number;
      description?: string;
    }) => {
      const res = await apiClient.post<ApiResponse<Course>>('/courses', payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}

export function useCreateCourseOffering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      course_id: string;
      academic_term_id: string;
      batch_id?: string | null;
      section: string;
      status: string;
      faculty_ids: string[];
    }) => {
      const res = await apiClient.post<ApiResponse<any>>('/course-offerings', payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-offerings'] });
    },
  });
}

// ── Enrollments ─────────────────────────────────────────────────────────────
export function useOfferingEnrollments(offeringId: string) {
  return useQuery({
    queryKey: ['enrollments', offeringId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Enrollment[]>>(
        `/course-offerings/${offeringId}/enrollments`
      );
      return res.data.data;
    },
    enabled: !!offeringId,
  });
}

export function useEnrollStudent(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (studentId: string) => {
      const res = await apiClient.post<ApiResponse<Enrollment>>(
        `/course-offerings/${offeringId}/enrollments`,
        { student_id: studentId }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments', offeringId] });
    },
  });
}

export function useDropStudent(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (studentId: string) => {
      await apiClient.delete(`/course-offerings/${offeringId}/enrollments/${studentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments', offeringId] });
    },
  });
}

// ── Materials ───────────────────────────────────────────────────────────────
export function useOfferingFolders(offeringId: string) {
  return useQuery({
    queryKey: ['folders', offeringId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<MaterialFolder[]>>(
        `/course-offerings/${offeringId}/folders`
      );
      return res.data.data;
    },
    enabled: !!offeringId,
  });
}

export function useCreateFolder(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; parent_id?: string | null }) => {
      const res = await apiClient.post<ApiResponse<MaterialFolder>>(
        `/course-offerings/${offeringId}/folders`,
        payload
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', offeringId] });
    },
  });
}

export function useOfferingMaterials(offeringId: string, folderId?: string | null) {
  return useQuery({
    queryKey: ['materials', offeringId, folderId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Material[]>>(
        `/course-offerings/${offeringId}/materials`,
        { params: { folder_id: folderId || undefined } }
      );
      return res.data.data;
    },
    enabled: !!offeringId,
  });
}

export function useUploadMaterialFile(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      title,
      folderId,
      file,
    }: {
      title: string;
      folderId?: string | null;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append('title', title);
      if (folderId) formData.append('folder_id', folderId);
      formData.append('file', file);

      const res = await apiClient.post<ApiResponse<Material>>(
        `/course-offerings/${offeringId}/materials/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', offeringId] });
    },
  });
}

// ── Announcements ───────────────────────────────────────────────────────────
export function useOfferingAnnouncements(offeringId: string) {
  return useQuery({
    queryKey: ['announcements', offeringId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Announcement[]>>(
        `/course-offerings/${offeringId}/announcements`
      );
      return res.data.data;
    },
    enabled: !!offeringId,
  });
}

export function useCreateAnnouncement(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; body: string; is_pinned?: boolean }) => {
      const res = await apiClient.post<ApiResponse<Announcement>>(
        `/course-offerings/${offeringId}/announcements`,
        payload
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements', offeringId] });
    },
  });
}

// ── Academic Structure (Departments, Programs, Terms) ──────────────────────
export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Department[]>>('/departments');
      return res.data.data;
    },
  });
}

export function usePrograms(departmentId?: string) {
  return useQuery({
    queryKey: ['programs', departmentId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Program[]>>('/programs', {
        params: { department_id: departmentId || undefined },
      });
      return res.data.data;
    },
  });
}

export function useAcademicTerms() {
  return useQuery({
    queryKey: ['academic-terms'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<AcademicTerm[]>>('/academic-terms');
      return res.data.data;
    },
  });
}

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ConfirmDialog } from '@/core/components/ui';
import {
  ArrowLeft,
  Bell,
  Folder,
  FileText,
  Download,
  ExternalLink,
  Users,
  Plus,
  Upload,
  Pin,
  X,
  UserX,
  ClipboardList,
  GraduationCap,
  Clock,
  CheckCircle2,
  FileCheck,
  Send,
  Trash2,
} from 'lucide-react';
import {
  useCourseOffering,
  useCreateAnnouncement,
  useCreateFolder,
  useDropStudent,
  useEnrollStudent,
  useOfferingAnnouncements,
  useOfferingFolders,
  useOfferingMaterials,
  useOfferingEnrollments,
  useUploadMaterialFile,
} from '@/features/courses/api';
import {
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useSubmitAssignmentFile,
  useAssignmentSubmissions,
  useGradeSubmission,
  useGradebook,
} from '@/features/assignments/api';
import type {
  Assignment,
  AssignmentSubmission,
  GradebookStudentEntry,
} from '@/features/assignments/types';
import { useAuth } from '@/core/auth/hooks';

export function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const offeringId = id || '';

  const [dropTarget, setDropTarget] = useState<{ studentId: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<
    'announcements' | 'materials' | 'assignments' | 'gradebook' | 'roster'
  >('announcements');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Dialog states for courses
  const [isAnnounceOpen, setIsAnnounceOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);

  // Dialog states for assignments
  const [isCreateAssignOpen, setIsCreateAssignOpen] = useState(false);
  const [selectedAssignForSubmit, setSelectedAssignForSubmit] = useState<Assignment | null>(null);
  const [selectedAssignForGrading, setSelectedAssignForGrading] = useState<Assignment | null>(null);
  const [gradingSubmission, setGradingSubmission] = useState<AssignmentSubmission | null>(null);

  // Form states - announcements
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annPinned, setAnnPinned] = useState(false);

  // Form states - materials
  const [folderTitle, setFolderTitle] = useState('');
  const [matTitle, setMatTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Form states - enroll
  const [studentIdToEnroll, setStudentIdToEnroll] = useState('');

  // Form states - assignment creation
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDesc, setAssignDesc] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assignTotalMarks, setAssignTotalMarks] = useState('100');
  const [assignWeightage, setAssignWeightage] = useState('10');
  const [assignAllowLate, setAssignAllowLate] = useState(false);
  const [assignLatePenalty, setAssignLatePenalty] = useState('5');
  const [assignMaxLateDays, setAssignMaxLateDays] = useState('3');

  // Form states - student submission
  const [subText, setSubText] = useState('');
  const [subFile, setSubFile] = useState<File | null>(null);

  // Form states - instructor grading
  const [gradeMarks, setGradeMarks] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');

  const { user } = useAuth();
  const isInstructorOrAdmin = user?.roles.some((r) =>
    ['admin', 'super_admin', 'faculty', 'department_head'].includes(r)
  );

  // Queries
  const { data: offering, isLoading } = useCourseOffering(offeringId);
  const { data: announcements } = useOfferingAnnouncements(offeringId);
  const { data: folders } = useOfferingFolders(offeringId);
  const { data: materials } = useOfferingMaterials(offeringId, selectedFolderId);
  const { data: enrollments } = useOfferingEnrollments(offeringId);
  const { data: assignments } = useAssignments(offeringId);
  const { data: gradebook } = useGradebook(offeringId);
  const { data: submissionsForAssign } = useAssignmentSubmissions(
    selectedAssignForGrading?.id || ''
  );

  // Mutations
  const createAnnouncementMutation = useCreateAnnouncement(offeringId);
  const createFolderMutation = useCreateFolder(offeringId);
  const uploadMaterialMutation = useUploadMaterialFile(offeringId);
  const enrollStudentMutation = useEnrollStudent(offeringId);
  const dropStudentMutation = useDropStudent(offeringId);
  const createAssignMutation = useCreateAssignment(offeringId);
  const deleteAssignMutation = useDeleteAssignment(offeringId);
  const submitFileMutation = useSubmitAssignmentFile(
    selectedAssignForSubmit?.id || '',
    offeringId
  );
  const gradeSubmissionMutation = useGradeSubmission(
    selectedAssignForGrading?.id || '',
    offeringId
  );

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-slate-500">Loading course...</div>;
  }

  if (!offering) {
    return (
      <div className="py-20 text-center">
        <h3 className="text-base font-semibold text-slate-700">Course Offering Not Found</h3>
        <Link to="/courses" className="mt-3 text-sm text-blue-600 hover:underline inline-block">
          Return to Courses
        </Link>
      </div>
    );
  }

  // Handlers
  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAnnouncementMutation.mutateAsync({
      title: annTitle,
      body: annBody,
      is_pinned: annPinned,
    });
    setAnnTitle('');
    setAnnBody('');
    setAnnPinned(false);
    setIsAnnounceOpen(false);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    await createFolderMutation.mutateAsync({
      title: folderTitle,
      parent_id: selectedFolderId || undefined,
    });
    setFolderTitle('');
    setIsFolderOpen(false);
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    await uploadMaterialMutation.mutateAsync({
      file: uploadFile,
      title: matTitle || uploadFile.name,
      folderId: selectedFolderId || undefined,
    });
    setUploadFile(null);
    setMatTitle('');
    setIsUploadOpen(false);
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentIdToEnroll) return;
    await enrollStudentMutation.mutateAsync(studentIdToEnroll);
    setStudentIdToEnroll('');
    setIsEnrollOpen(false);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAssignMutation.mutateAsync({
      title: assignTitle,
      description: assignDesc,
      due_date: new Date(assignDueDate).toISOString(),
      total_marks: parseFloat(assignTotalMarks) || 100,
      weightage: parseFloat(assignWeightage) || 10,
      allow_late: assignAllowLate,
      late_penalty_percent_per_day: assignAllowLate ? parseFloat(assignLatePenalty) || 0 : 0,
      max_late_days: assignAllowLate ? parseInt(assignMaxLateDays, 10) || 0 : 0,
      is_published: true,
    });
    setAssignTitle('');
    setAssignDesc('');
    setAssignDueDate('');
    setIsCreateAssignOpen(false);
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignForSubmit || !subFile) return;
    await submitFileMutation.mutateAsync({
      file: subFile,
      contentText: subText,
    });
    setSubFile(null);
    setSubText('');
    setSelectedAssignForSubmit(null);
  };

  const handleGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingSubmission) return;
    await gradeSubmissionMutation.mutateAsync({
      submissionId: gradingSubmission.id,
      marksObtained: parseFloat(gradeMarks) || 0,
      feedback: gradeFeedback,
    });
    setGradingSubmission(null);
    setGradeMarks('');
    setGradeFeedback('');
  };

  const handleExportGradebook = async () => {
    const token = localStorage.getItem('access_token');
    const res = await fetch(`/api/v1/course-offerings/${offeringId}/gradebook/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradebook_${offeringId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadFile = async (materialId: string, filename: string) => {
    const token = localStorage.getItem('access_token');
    const res = await fetch(`/api/v1/materials/${materialId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download.bin';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadSubmission = async (submissionId: string, filename: string) => {
    const token = localStorage.getItem('access_token');
    const res = await fetch(`/api/v1/submissions/${submissionId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'submission.bin';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="space-y-6">
      {/* Header & Breadcrumb */}
      <div>
        <Link
          to="/courses"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Courses
        </Link>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 uppercase tracking-wide">
                {offering.course_code}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                Section {offering.section}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 capitalize">
                {offering.status}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{offering.course_title}</h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition shrink-0 ${
            activeTab === 'announcements'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>Announcements</span>
        </button>

        <button
          onClick={() => setActiveTab('materials')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition shrink-0 ${
            activeTab === 'materials'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Folder className="h-4 w-4" />
          <span>Course Materials</span>
        </button>

        <button
          onClick={() => setActiveTab('assignments')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition shrink-0 ${
            activeTab === 'assignments'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          <span>Assignments</span>
          {assignments && assignments.length > 0 && (
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {assignments.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('gradebook')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition shrink-0 ${
            activeTab === 'gradebook'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <GraduationCap className="h-4 w-4" />
          <span>Gradebook</span>
        </button>

        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition shrink-0 ${
            activeTab === 'roster'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Student Roster</span>
        </button>
      </div>

      {/* ── Tab Content: Announcements ─────────────────────────────────── */}
      {activeTab === 'announcements' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-900">Class Announcements</h3>
            {isInstructorOrAdmin && (
              <button
                onClick={() => setIsAnnounceOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Post Announcement</span>
              </button>
            )}
          </div>

          {!announcements || announcements.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
              No announcements posted yet.
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className={`bg-white rounded-xl border p-5 shadow-xs transition ${
                    ann.is_pinned ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {ann.is_pinned && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                          <Pin className="h-3 w-3" /> Pinned
                        </span>
                      )}
                      <h4 className="text-base font-bold text-slate-900">{ann.title}</h4>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(ann.published_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{ann.body}</p>
                  <div className="mt-3 text-xs text-slate-400 font-medium">
                    Posted by: {ann.author_name || 'Faculty Instructor'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Content: Materials ─────────────────────────────────────── */}
      {activeTab === 'materials' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600 font-medium overflow-x-auto">
              <button
                onClick={() => setSelectedFolderId(null)}
                className={`hover:text-blue-600 ${selectedFolderId === null ? 'font-bold text-blue-600' : ''}`}
              >
                Root
              </button>
              {selectedFolderId && (
                <>
                  <span>/</span>
                  <span className="font-bold text-slate-900">
                    {folders?.find((f) => f.id === selectedFolderId)?.title || 'Folder'}
                  </span>
                </>
              )}
            </div>

            {isInstructorOrAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFolderOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Folder className="h-3.5 w-3.5 text-slate-500" />
                  <span>New Folder</span>
                </button>
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload File</span>
                </button>
              </div>
            )}
          </div>

          {/* Folders List */}
          {selectedFolderId === null && folders && folders.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {folders.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setSelectedFolderId(f.id)}
                  className="flex items-center gap-3 p-3.5 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-xs transition cursor-pointer"
                >
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 leading-tight">{f.title}</h4>
                    <span className="text-xs text-slate-400">Folder</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Files List */}
          {!materials || materials.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
              No files in this directory.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {materials.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="truncate">
                      <h4 className="text-sm font-semibold text-slate-900 truncate">{m.title}</h4>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span className="uppercase">{m.material_type}</span>
                        {m.file_size && (
                          <span>{(m.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                        )}
                        <span>{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {m.material_type === 'file' && (
                      <button
                        onClick={() => handleDownloadFile(m.id, m.title)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download</span>
                      </button>
                    )}
                    {m.material_type === 'link' && m.url && (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open Link</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Content: Assignments ───────────────────────────────────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-slate-900">Assignments & Coursework</h3>
              <p className="text-xs text-slate-500">Track deadlines, submissions, and grades</p>
            </div>
            {isInstructorOrAdmin && (
              <button
                onClick={() => setIsCreateAssignOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Assignment</span>
              </button>
            )}
          </div>

          {!assignments || assignments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
              No assignments published yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {assignments.map((assign: Assignment) => {
                const isPastDue = new Date() > new Date(assign.due_date);
                const mySub = assign.my_submission;
                const isGraded = mySub?.status === 'graded' && mySub.grade;

                return (
                  <div
                    key={assign.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                            {assign.total_marks} Points
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                            Weight: {assign.weightage}%
                          </span>
                          {assign.allow_late ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                              Late Accepted (-{assign.late_penalty_percent_per_day}%/day, max {assign.max_late_days}d)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-50 text-slate-500">
                              No Late Submissions
                            </span>
                          )}
                        </div>
                        <h4 className="text-lg font-bold text-slate-900">{assign.title}</h4>
                        {assign.description && (
                          <p className="mt-1 text-sm text-slate-600">{assign.description}</p>
                        )}
                        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              Due:{' '}
                              <strong className={isPastDue ? 'text-red-600 font-semibold' : 'text-slate-700 font-semibold'}>
                                {new Date(assign.due_date).toLocaleString()}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right action column */}
                      <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
                        {/* Instructor actions */}
                        {isInstructorOrAdmin ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedAssignForGrading(assign)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition"
                            >
                              <FileCheck className="h-3.5 w-3.5" />
                              <span>View Submissions ({assign.submissions_count || 0})</span>
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this assignment?')) {
                                  deleteAssignMutation.mutate(assign.id);
                                }
                              }}
                              className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                              title="Delete Assignment"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          /* Student actions */
                          <div className="flex flex-col items-start md:items-end gap-1.5">
                            {isGraded ? (
                              <div className="text-right">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Graded: {mySub.grade?.final_marks} / {assign.total_marks} pts
                                </span>
                                {mySub.grade?.feedback && (
                                  <p className="mt-1 text-xs italic text-slate-600 max-w-xs text-right">
                                    "{mySub.grade.feedback}"
                                  </p>
                                )}
                              </div>
                            ) : mySub ? (
                              <div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Submitted
                                </span>
                                {mySub.is_late && (
                                  <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                    Late (+{mySub.late_days}d)
                                  </span>
                                )}
                                <button
                                  onClick={() => setSelectedAssignForSubmit(assign)}
                                  className="mt-2 block text-xs text-blue-600 hover:underline"
                                >
                                  Resubmit Work
                                </button>
                              </div>
                            ) : (
                              <div>
                                <button
                                  onClick={() => setSelectedAssignForSubmit(assign)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
                                >
                                  <Upload className="h-3.5 w-3.5" />
                                  <span>Submit Assignment</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Content: Gradebook ─────────────────────────────────────── */}
      {activeTab === 'gradebook' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Course Gradebook</h3>
              <p className="text-xs text-slate-500">
                Aggregated student performance with weighted scores
              </p>
            </div>
            {isInstructorOrAdmin && (
              <button
                onClick={handleExportGradebook}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Export CSV</span>
              </button>
            )}
          </div>

          {!gradebook || gradebook.students.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
              No gradebook records available yet.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-700 font-bold">
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Status</th>
                    {gradebook.assignments.map((a: { id: string; title: string; total_marks: number; weightage: number }) => (
                      <th key={a.id} className="py-3 px-4 text-center">
                        <span className="block font-bold">{a.title}</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          {a.total_marks} pts ({a.weightage}%)
                        </span>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-center">Total Weighted</th>
                    <th className="py-3 px-4 text-center">Overall %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gradebook.students.map((st: GradebookStudentEntry) => (
                    <tr key={st.student_id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-semibold text-slate-900">{st.student_name}</td>
                      <td className="py-3 px-4 text-slate-500 font-mono">{st.student_email}</td>
                      <td className="py-3 px-4">
                        <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                          {st.enrollment_status}
                        </span>
                      </td>
                      {gradebook.assignments.map((a: { id: string }) => {
                        const score = st.assignment_scores[a.id];
                        return (
                          <td key={a.id} className="py-3 px-4 text-center">
                            {score !== null && score !== undefined ? (
                              <span className="font-semibold text-slate-800">{score}</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-3 px-4 text-center font-bold text-slate-900">
                        {st.total_weighted_score} / {st.max_possible_weighted}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`font-bold px-2 py-0.5 rounded ${
                            st.percentage >= 70
                              ? 'bg-emerald-100 text-emerald-800'
                              : st.percentage >= 40
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {st.percentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab Content: Roster ────────────────────────────────────────── */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-900">Class Roster</h3>
            {isInstructorOrAdmin && (
              <button
                onClick={() => setIsEnrollOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Enroll Student</span>
              </button>
            )}
          </div>

          {!enrollments || enrollments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
              No students enrolled yet.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-xs">
              {enrollments.map((enr) => (
                <div key={enr.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 font-bold text-xs uppercase">
                      {(enr.student_name || enr.first_name || 'S').charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        {enr.student_name ||
                          [enr.first_name, enr.last_name].filter(Boolean).join(' ') ||
                          'Enrolled Student'}
                      </h4>
                      <span className="text-xs text-slate-400 font-mono">
                        {enr.student_email || enr.email || enr.student_id}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 capitalize">
                      {enr.status}
                    </span>
                    {isInstructorOrAdmin && (
                      <button
                        onClick={() =>
                          setDropTarget({
                            studentId: enr.student_id,
                            name:
                              enr.student_name ||
                              [enr.first_name, enr.last_name].filter(Boolean).join(' ') ||
                              'this student',
                          })
                        }
                        title="Drop student"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <UserX className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}

      {/* Post Announcement Modal */}
      {isAnnounceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Post Announcement</h3>
              <button onClick={() => setIsAnnounceOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handlePostAnnouncement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
                <input
                  required
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="e.g. Midterm Date Changed"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Message *</label>
                <textarea
                  required
                  rows={4}
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  placeholder="Write the announcement body..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pin"
                  checked={annPinned}
                  onChange={(e) => setAnnPinned(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="pin" className="text-xs font-semibold text-slate-700">
                  Pin to top of class announcements
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAnnounceOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAnnouncementMutation.isPending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Post
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Assignment Modal */}
      {isCreateAssignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Create New Assignment</h3>
              <button onClick={() => setIsCreateAssignOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assignment Title *
                </label>
                <input
                  required
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  placeholder="e.g. Homework 1: SQL Optimization"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions</label>
                <textarea
                  rows={3}
                  value={assignDesc}
                  onChange={(e) => setAssignDesc(e.target.value)}
                  placeholder="Provide instructions, rubric expectations, or submission links..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date *</label>
                  <input
                    required
                    type="datetime-local"
                    value={assignDueDate}
                    onChange={(e) => setAssignDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Total Marks *</label>
                  <input
                    required
                    type="number"
                    value={assignTotalMarks}
                    onChange={(e) => setAssignTotalMarks(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Weightage (%) *</label>
                  <input
                    required
                    type="number"
                    value={assignWeightage}
                    onChange={(e) => setAssignWeightage(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allow_late"
                    checked={assignAllowLate}
                    onChange={(e) => setAssignAllowLate(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <label htmlFor="allow_late" className="text-xs font-semibold text-slate-800">
                    Accept Late Submissions with Automatic Penalty
                  </label>
                </div>

                {assignAllowLate && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Deduction (% per late day)
                      </label>
                      <input
                        type="number"
                        value={assignLatePenalty}
                        onChange={(e) => setAssignLatePenalty(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Max Allowed Late Days
                      </label>
                      <input
                        type="number"
                        value={assignMaxLateDays}
                        onChange={(e) => setAssignMaxLateDays(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-1.5 text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsCreateAssignOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAssignMutation.isPending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  {createAssignMutation.isPending ? 'Publishing...' : 'Publish Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Submit Assignment Modal */}
      {selectedAssignForSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Submit: {selectedAssignForSubmit.title}</h3>
              <button onClick={() => setSelectedAssignForSubmit(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleStudentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Upload Solution File *
                </label>
                <input
                  required
                  type="file"
                  onChange={(e) => setSubFile(e.target.files?.[0] || null)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Comments</label>
                <textarea
                  rows={3}
                  value={subText}
                  onChange={(e) => setSubText(e.target.value)}
                  placeholder="Optional comments or execution instructions for the instructor..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedAssignForSubmit(null)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitFileMutation.isPending || !subFile}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span>{submitFileMutation.isPending ? 'Submitting...' : 'Confirm Submission'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Instructor Submissions & Grading Drawer/Modal */}
      {selectedAssignForGrading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900">
                  Submissions: {selectedAssignForGrading.title}
                </h3>
                <span className="text-xs text-slate-500">
                  Total marks: {selectedAssignForGrading.total_marks} | Submissions: {submissionsForAssign?.length || 0}
                </span>
              </div>
              <button onClick={() => setSelectedAssignForGrading(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Grading Form Panel if a submission is selected */}
            {gradingSubmission && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    Grade Submission: {gradingSubmission.student_name}
                  </h4>
                  <button onClick={() => setGradingSubmission(null)} className="text-xs text-slate-500 hover:text-slate-800">
                    Cancel
                  </button>
                </div>
                <form onSubmit={handleGradeSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Marks Awarded (out of {selectedAssignForGrading.total_marks}) *
                      </label>
                      <input
                        required
                        type="number"
                        step="0.5"
                        max={selectedAssignForGrading.total_marks}
                        value={gradeMarks}
                        onChange={(e) => setGradeMarks(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Feedback</label>
                      <input
                        value={gradeFeedback}
                        onChange={(e) => setGradeFeedback(e.target.value)}
                        placeholder="Constructive feedback for student..."
                        className="w-full rounded-lg border border-slate-300 p-2 text-sm bg-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="submit"
                      disabled={gradeSubmissionMutation.isPending}
                      className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      {gradeSubmissionMutation.isPending ? 'Saving...' : 'Save & Publish Grade'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Submissions List Table */}
            {!submissionsForAssign || submissionsForAssign.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No submissions received yet for this assignment.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-slate-50 text-slate-700 font-bold">
                      <th className="py-2.5 px-3">Student</th>
                      <th className="py-2.5 px-3">Submitted At</th>
                      <th className="py-2.5 px-3">File / Work</th>
                      <th className="py-2.5 px-3">Grade</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {submissionsForAssign.map((s: AssignmentSubmission) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3">
                          <span className="block font-semibold text-slate-900">{s.student_name}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">{s.student_email}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span>{new Date(s.submitted_at).toLocaleString()}</span>
                          {s.is_late && (
                            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                              Late (+{s.late_days}d)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {s.file_name ? (
                            <button
                              onClick={() => handleDownloadSubmission(s.id, s.file_name || 'file.bin')}
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
                            >
                              <Download className="h-3 w-3" />
                              <span>{s.file_name}</span>
                            </button>
                          ) : (
                            <span className="text-slate-500 italic truncate max-w-xs block">
                              {s.content_text || 'Text response'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {s.grade ? (
                            <span className="font-bold text-emerald-700">
                              {s.grade.final_marks} / {selectedAssignForGrading.total_marks}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">Ungraded</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              setGradingSubmission(s);
                              setGradeMarks(s.grade ? String(s.grade.marks_obtained) : '');
                              setGradeFeedback(s.grade?.feedback || '');
                            }}
                            className="px-3 py-1 rounded bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100"
                          >
                            {s.grade ? 'Re-grade' : 'Grade'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Material Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Upload Learning Material</h3>
              <button onClick={() => setIsUploadOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleUploadFile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">File *</label>
                <input
                  required
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Title (Optional)
                </label>
                <input
                  value={matTitle}
                  onChange={(e) => setMatTitle(e.target.value)}
                  placeholder="Defaults to filename"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadMaterialMutation.isPending || !uploadFile}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {isFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Create Folder</h3>
              <button onClick={() => setIsFolderOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Folder Title *</label>
                <input
                  required
                  value={folderTitle}
                  onChange={(e) => setFolderTitle(e.target.value)}
                  placeholder="e.g. Unit 2 - Query Optimization"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsFolderOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createFolderMutation.isPending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enroll Student Modal */}
      {isEnrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Enroll Student</h3>
              <button onClick={() => setIsEnrollOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleEnrollStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Student User UUID *
                </label>
                <input
                  required
                  value={studentIdToEnroll}
                  onChange={(e) => setStudentIdToEnroll(e.target.value)}
                  placeholder="Paste student account UUID"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsEnrollOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enrollStudentMutation.isPending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  {enrollStudentMutation.isPending ? 'Enrolling...' : 'Enroll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dropTarget !== null}
        title="Drop student"
        body={`Drop ${dropTarget?.name ?? 'this student'} from this course? Their existing submissions and grades are retained.`}
        confirmLabel="Drop student"
        destructive
        onCancel={() => setDropTarget(null)}
        onConfirm={() => {
          const target = dropTarget;
          setDropTarget(null);
          if (target) dropStudentMutation.mutate(target.studentId);
        }}
      />
    </div>
  );
}

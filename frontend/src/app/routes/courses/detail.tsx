import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
import { useAuth } from '@/core/auth/hooks';

export function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const offeringId = id || '';

  const [activeTab, setActiveTab] = useState<'announcements' | 'materials' | 'roster'>('announcements');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Dialog states
  const [isAnnounceOpen, setIsAnnounceOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);

  // Form states
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annPinned, setAnnPinned] = useState(false);

  const [folderTitle, setFolderTitle] = useState('');
  const [matTitle, setMatTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [studentIdToEnroll, setStudentIdToEnroll] = useState('');

  const { user } = useAuth();
  const isInstructorOrAdmin = user?.roles.some((r) =>
    ['admin', 'super_admin', 'faculty', 'department_head'].includes(r)
  );

  const { data: offering, isLoading } = useCourseOffering(offeringId);
  const { data: announcements } = useOfferingAnnouncements(offeringId);
  const { data: folders } = useOfferingFolders(offeringId);
  const { data: materials } = useOfferingMaterials(offeringId, selectedFolderId);
  const { data: enrollments } = useOfferingEnrollments(offeringId);

  const createAnnouncementMutation = useCreateAnnouncement(offeringId);
  const createFolderMutation = useCreateFolder(offeringId);
  const uploadMaterialMutation = useUploadMaterialFile(offeringId);
  const enrollStudentMutation = useEnrollStudent(offeringId);
  const dropStudentMutation = useDropStudent(offeringId);

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
    await createFolderMutation.mutateAsync({ title: folderTitle });
    setFolderTitle('');
    setIsFolderOpen(false);
  };

  const handleUploadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    await uploadMaterialMutation.mutateAsync({
      title: matTitle || uploadFile.name,
      folderId: selectedFolderId,
      file: uploadFile,
    });
    setMatTitle('');
    setUploadFile(null);
    setIsUploadOpen(false);
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentIdToEnroll.trim()) return;
    await enrollStudentMutation.mutateAsync(studentIdToEnroll.trim());
    setStudentIdToEnroll('');
    setIsEnrollOpen(false);
  };

  const handleDropStudent = async (studentId: string, name: string) => {
    if (confirm(`Remove ${name} from this course offering?`)) {
      await dropStudentMutation.mutateAsync(studentId);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Back button & Course Header */}
      <div>
        <Link
          to="/courses"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Course Catalog</span>
        </Link>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-blue-50 text-blue-700 border border-blue-100">
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
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
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
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'materials'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Folder className="h-4 w-4" />
          <span>Course Materials</span>
        </button>

        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
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
                    ann.is_pinned ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
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
            {/* Breadcrumb / Folder selector */}
            <div className="flex items-center gap-2 text-sm text-slate-600 font-medium overflow-x-auto">
              <button
                onClick={() => setSelectedFolderId(null)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  selectedFolderId === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-slate-200 hover:bg-slate-50'
                }`}
              >
                All Root Materials
              </button>
              {(folders || []).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    selectedFolderId === f.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  📁 {f.title}
                </button>
              ))}
            </div>

            {isInstructorOrAdmin && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsFolderOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                >
                  <Folder className="h-3.5 w-3.5 text-slate-500" />
                  <span>New Folder</span>
                </button>
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload Resource</span>
                </button>
              </div>
            )}
          </div>

          {!materials || materials.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
              No materials uploaded in this section.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100">
              {materials.map((mat) => (
                <div
                  key={mat.id}
                  className="p-4 flex items-center justify-between hover:bg-slate-50/75 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                      {mat.material_type === 'file' ? (
                        <FileText className="h-5 w-5" />
                      ) : (
                        <ExternalLink className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{mat.title}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="capitalize">{mat.material_type}</span>
                        {mat.file_size && <span>• {(mat.file_size / 1024).toFixed(1)} KB</span>}
                        <span>• {new Date(mat.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    {mat.material_type === 'file' ? (
                      <a
                        href={`/api/v1/materials/${mat.id}/download`}
                        download
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download</span>
                      </a>
                    ) : mat.url ? (
                      <a
                        href={mat.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open Link</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Content: Student Roster ─────────────────────────────────── */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-900">
              Enrolled Students ({enrollments?.length || 0})
            </h3>
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
              No students are currently enrolled in this offering.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Student</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Enrolled Date</th>
                    {isInstructorOrAdmin && <th className="px-6 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrollments.map((enr) => (
                    <tr key={enr.id} className="hover:bg-slate-50/75 transition">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">
                          {enr.first_name} {enr.last_name}
                        </div>
                        <div className="text-xs text-slate-400">{enr.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                          {enr.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(enr.enrolled_at).toLocaleDateString()}
                      </td>
                      {isInstructorOrAdmin && (
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() =>
                              handleDropStudent(
                                enr.student_id,
                                `${enr.first_name || ''} ${enr.last_name || ''}`.trim()
                              )
                            }
                            className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 transition"
                            title="Drop from course"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Post Announcement Modal */}
      {isAnnounceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
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
                  placeholder="e.g. Schedule Change"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Body *</label>
                <textarea
                  required
                  rows={4}
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  placeholder="Write the announcement message..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={annPinned}
                  onChange={(e) => setAnnPinned(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Pin this announcement to top of feed</span>
              </label>
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
                  {createAnnouncementMutation.isPending ? 'Posting...' : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Material Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900">Upload Learning Resource</h3>
              <button onClick={() => setIsUploadOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleUploadMaterial} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  value={matTitle}
                  onChange={(e) => setMatTitle(e.target.value)}
                  placeholder="e.g. Lecture 1 Slides (leave blank for filename)"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">File *</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold hover:file:bg-blue-100"
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
                  disabled={!uploadFile || uploadMaterialMutation.isPending}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploadMaterialMutation.isPending ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {isFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
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
    </div>
  );
}

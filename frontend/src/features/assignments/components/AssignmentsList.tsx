import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Clock,
  CheckCircle2,
  Upload,
  Filter,
  Search,
  ExternalLink,
  Plus,
  FileCheck,
  ChevronRight,
  X,
} from 'lucide-react';
import { PageHeader } from '@/core/components/layout/page-header';
import { useAuth } from '@/core/auth/hooks';

interface DisplayAssignment {
  id: string;
  course_code: string;
  course_title: string;
  offering_id: string;
  title: string;
  description: string;
  due_date: string;
  total_marks: number;
  weightage: number;
  allow_late: boolean;
  late_penalty: number;
  status: 'pending' | 'submitted' | 'graded';
  obtained_marks?: number;
  feedback?: string;
  submitted_at?: string;
  submissions_count?: number;
}

const DEMO_ASSIGNMENTS: DisplayAssignment[] = [
  {
    id: 'demo-as-1',
    course_code: 'CS301',
    course_title: 'Database Management Systems',
    offering_id: 'demo-off-1',
    title: 'Milestone 2: Relational Schema & B-Tree Indexing Optimization',
    description: 'Implement normalized schema up to BCNF and construct query execution plan benchmarks with composite B-Tree indexes.',
    due_date: new Date(Date.now() + 86400000 * 2).toISOString(),
    total_marks: 100,
    weightage: 15,
    allow_late: true,
    late_penalty: 5,
    status: 'pending',
    submissions_count: 24,
  },
  {
    id: 'demo-as-2',
    course_code: 'CS402',
    course_title: 'Network & Web Security',
    offering_id: 'demo-off-2',
    title: 'Lab 4: TLS 1.3 Handshake & Packet Wireshark Analysis',
    description: 'Capture and inspect cryptographic key exchange parameters, cipher suites, and forward-secrecy mechanisms using Wireshark.',
    due_date: new Date(Date.now() + 86400000 * 5).toISOString(),
    total_marks: 50,
    weightage: 10,
    allow_late: false,
    late_penalty: 0,
    status: 'pending',
    submissions_count: 18,
  },
  {
    id: 'demo-as-3',
    course_code: 'CS201',
    course_title: 'Data Structures & Algorithms',
    offering_id: 'demo-off-3',
    title: 'Assignment 3: Red-Black Tree Balancing & Amortized Complexity',
    description: 'Implement left/right rotations and recoloring logic for self-balancing search trees. Provide asymptotic proof for O(log n) guarantees.',
    due_date: new Date(Date.now() - 86400000 * 3).toISOString(),
    total_marks: 100,
    weightage: 12,
    allow_late: true,
    late_penalty: 10,
    status: 'graded',
    obtained_marks: 94,
    feedback: 'Excellent rigor in the formal amortized potential method proof. Code is cleanly structured and conforms to POSIX guidelines.',
    submitted_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    submissions_count: 42,
  },
  {
    id: 'demo-as-4',
    course_code: 'CS305',
    course_title: 'Operating Systems & Concurrency',
    offering_id: 'demo-off-4',
    title: 'Project 1: Multithreaded Job Scheduler with Semaphore Synchronization',
    description: 'Construct a preemptive thread pool scheduler with starvation prevention, condition variables, and mutex lock hierarchy.',
    due_date: new Date(Date.now() - 86400000 * 1).toISOString(),
    total_marks: 100,
    weightage: 20,
    allow_late: true,
    late_penalty: 5,
    status: 'submitted',
    submitted_at: new Date(Date.now() - 86400000 * 1.5).toISOString(),
    submissions_count: 36,
  },
];

export function AssignmentsList() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'submitted' | 'graded'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [submitModalAssign, setSubmitModalAssign] = useState<DisplayAssignment | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [isSubmittingSuccess, setIsSubmittingSuccess] = useState(false);

  const isPrivileged = user?.roles.some((r) =>
    ['admin', 'super_admin', 'faculty', 'department_head'].includes(r)
  );

  // Filter assignments
  const filteredAssignments = DEMO_ASSIGNMENTS.filter((as) => {
    if (activeTab === 'pending' && as.status !== 'pending') return false;
    if (activeTab === 'submitted' && as.status !== 'submitted') return false;
    if (activeTab === 'graded' && as.status !== 'graded') return false;
    if (selectedCourse !== 'all' && as.course_code !== selectedCourse) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        as.title.toLowerCase().includes(q) ||
        as.course_code.toLowerCase().includes(q) ||
        as.course_title.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingSuccess(true);
    setTimeout(() => {
      setIsSubmittingSuccess(false);
      setSubmitModalAssign(null);
      setSubmissionFile(null);
      setSubmissionNotes('');
    }, 1200);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      <PageHeader
        title="Coursework & Assignments"
        description="Comprehensive directory of academic coursework, submission deadlines, and evaluation scorecards."
        actions={
          isPrivileged ? (
            <Link
              to="/courses"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Create in Course</span>
            </Link>
          ) : undefined
        }
      />

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by assignment title, code, or course..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-900"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">All Courses</option>
              <option value="CS301">CS301 — Database Systems</option>
              <option value="CS402">CS402 — Network & Web Security</option>
              <option value="CS201">CS201 — Data Structures</option>
              <option value="CS305">CS305 — Operating Systems</option>
            </select>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            {filteredAssignments.length}{' '}
            {filteredAssignments.length === 1 ? 'assignment' : 'assignments'}
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          All Coursework
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'pending'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Pending Submissions</span>
          <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px] font-bold">
            2
          </span>
        </button>
        <button
          onClick={() => setActiveTab('submitted')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'submitted'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Awaiting Evaluation
        </button>
        <button
          onClick={() => setActiveTab('graded')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeTab === 'graded'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Graded & Finalized
        </button>
      </div>

      {/* Assignments Grid / List */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No Coursework Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            There are no active or completed assignments matching your selected filter criteria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredAssignments.map((assign) => {
            const dueDate = new Date(assign.due_date);
            const isPastDue = new Date() > dueDate;

            return (
              <div
                key={assign.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                      {assign.course_code}
                    </span>
                    <span className="text-xs text-slate-500 font-medium truncate max-w-xs">
                      {assign.course_title}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                      {assign.total_marks} Points
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-50 text-slate-600">
                      Weight: {assign.weightage}%
                    </span>
                    {assign.allow_late ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700">
                        Late Allowed (-{assign.late_penalty}%/day)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-500">
                        Strict Deadline
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900">{assign.title}</h3>
                  <p className="text-xs text-slate-600 line-clamp-2">{assign.description}</p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                        Due:{' '}
                        <strong
                          className={isPastDue ? 'text-rose-600 font-semibold' : 'text-slate-800 font-semibold'}
                        >
                          {dueDate.toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </strong>
                      </span>
                    </div>

                    {isPrivileged && (
                      <div className="flex items-center gap-1.5">
                        <FileCheck className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          <strong>{assign.submissions_count}</strong> student submissions
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Action / Status Column */}
                <div className="flex flex-col items-start md:items-end gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  {assign.status === 'graded' ? (
                    <div className="text-left md:text-right">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>
                          Graded: {assign.obtained_marks} / {assign.total_marks} pts
                        </span>
                      </div>
                      {assign.feedback && (
                        <p className="text-[11px] italic text-slate-500 mt-1 max-w-xs text-left md:text-right">
                          "{assign.feedback}"
                        </p>
                      )}
                    </div>
                  ) : assign.status === 'submitted' ? (
                    <div className="text-left md:text-right">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                        <span>Submitted</span>
                      </span>
                      <p className="text-[11px] text-slate-400 mt-1">Pending instructor review</p>
                    </div>
                  ) : (
                    <div>
                      {isPrivileged ? (
                        <Link
                          to={`/courses/${assign.offering_id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                        >
                          <span>Manage Submissions</span>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        </Link>
                      ) : (
                        <button
                          onClick={() => setSubmitModalAssign(assign)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>Submit Work</span>
                        </button>
                      )}
                    </div>
                  )}

                  <Link
                    to={`/courses/${assign.offering_id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-600 transition"
                  >
                    <span>Course Workspace</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Student Submission Modal */}
      {submitModalAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
                  {submitModalAssign.course_code}
                </span>
                <h2 className="text-base font-bold text-slate-900">{submitModalAssign.title}</h2>
              </div>
              <button
                onClick={() => setSubmitModalAssign(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="p-6 space-y-4">
              {isSubmittingSuccess && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Your submission has been securely uploaded and timestamped!</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Deliverable Archive / Report File *
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-300 rounded-lg p-1.5"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Accepted formats: PDF, ZIP, TAR.GZ, IPYNB, DOCX (Max 25MB)
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Submission Notes / Abstract (Optional)
                </label>
                <textarea
                  rows={3}
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  placeholder="Provide instructions, repository link, or notes for the grading evaluator..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">Honor Code Statement:</p>
                <p>
                  By submitting this deliverable, you certify that all content represents your own original intellectual work in accordance with institutional academic integrity policies.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSubmitModalAssign(null)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!submissionFile || isSubmittingSuccess}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-xs"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{isSubmittingSuccess ? 'Uploading...' : 'Confirm Submission'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

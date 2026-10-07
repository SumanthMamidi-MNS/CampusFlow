import { useMemo, useState } from 'react';
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
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '@/core/components/layout/page-header';
import { useAuth } from '@/core/auth/hooks';
import { EmptyState } from '@/core/components/ui/empty-state';
import { PageLoading } from '@/core/components/ui/loading';
import { useMyAssignments, useSubmitMyAssignment } from '../api';
import type { Assignment } from '../types';

type DerivedStatus = 'pending' | 'submitted' | 'graded';

function deriveStatus(assignment: Assignment): DerivedStatus {
  if (assignment.my_submission?.grade) return 'graded';
  if (assignment.my_submission) return 'submitted';
  return 'pending';
}

function errorMessage(err: any, fallback: string): string {
  return err?.response?.data?.error?.message || err?.message || fallback;
}

export function AssignmentsList() {
  const { user } = useAuth();
  const { data: assignments, isLoading, isError, error, refetch } = useMyAssignments();
  const submitMutation = useSubmitMyAssignment();

  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'submitted' | 'graded'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [submitTarget, setSubmitTarget] = useState<Assignment | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [submitError, setSubmitError] = useState('');

  const isPrivileged = Boolean(
    user?.roles.some((r) => ['admin', 'super_admin', 'faculty', 'department_head'].includes(r))
  );

  const rows = useMemo(
    () => (assignments ?? []).map((a) => ({ assignment: a, status: deriveStatus(a) })),
    [assignments]
  );

  const courseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach(({ assignment }) => {
      if (assignment.course_code) {
        seen.set(assignment.course_code, assignment.course_title || assignment.course_code);
      }
    });
    return Array.from(seen.entries());
  }, [rows]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter((r) => r.status === 'pending').length,
      submitted: rows.filter((r) => r.status === 'submitted').length,
      graded: rows.filter((r) => r.status === 'graded').length,
    }),
    [rows]
  );

  const filtered = rows.filter(({ assignment, status }) => {
    if (activeTab !== 'all' && status !== activeTab) return false;
    if (selectedCourse !== 'all' && assignment.course_code !== selectedCourse) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        assignment.title.toLowerCase().includes(q) ||
        (assignment.course_code || '').toLowerCase().includes(q) ||
        (assignment.course_title || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const closeModal = () => {
    setSubmitTarget(null);
    setSubmissionFile(null);
    setSubmissionNotes('');
    setSubmitError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitTarget) return;
    setSubmitError('');
    try {
      await submitMutation.mutateAsync({
        assignmentId: submitTarget.id,
        file: submissionFile || undefined,
        contentText: submissionNotes || undefined,
      });
      closeModal();
    } catch (err: any) {
      setSubmitError(errorMessage(err, 'Submission failed. Please try again.'));
    }
  };

  const tabs: Array<{ key: typeof activeTab; label: string }> = [
    { key: 'all', label: 'All Coursework' },
    { key: 'pending', label: 'Pending Submissions' },
    { key: 'submitted', label: 'Awaiting Evaluation' },
    { key: 'graded', label: 'Graded & Finalized' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      <PageHeader
        title="Coursework & Assignments"
        description="Academic coursework, submission deadlines, and evaluation records across your courses."
        actions={
          isPrivileged ? (
            <Link
              to="/courses"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Create in Course</span>
            </Link>
          ) : undefined
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <label htmlFor="assignment-search" className="sr-only">
            Search coursework
          </label>
          <input
            id="assignment-search"
            type="text"
            placeholder="Search by assignment title, code, or course…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <label htmlFor="assignment-course-filter" className="sr-only">
              Filter by course
            </label>
            <select
              id="assignment-course-filter"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">All Courses</option>
              {courseOptions.map(([code, title]) => (
                <option key={code} value={code}>
                  {code} — {title}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {filtered.length} {filtered.length === 1 ? 'assignment' : 'assignments'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            aria-current={activeTab === tab.key ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{tab.label}</span>
            <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 text-[10px] font-bold">
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageLoading message="Loading coursework…" />
      ) : isError ? (
        <div className="bg-white rounded-xl border border-rose-200 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-3" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-800">Could not load coursework</h3>
          <p className="text-xs text-slate-500 mt-1">{errorMessage(error, 'Request failed.')}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Coursework Found"
          description="There are no assignments matching your current filters."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map(({ assignment, status }) => {
            const dueDate = new Date(assignment.due_date);
            const isPastDue = new Date() > dueDate;
            const grade = assignment.my_submission?.grade;
            return (
              <div
                key={assignment.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {assignment.course_code && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        {assignment.course_code}
                      </span>
                    )}
                    {assignment.course_title && (
                      <span className="text-xs text-slate-500 font-medium truncate max-w-xs">
                        {assignment.course_title}
                      </span>
                    )}
                    <span className="text-slate-300">•</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                      {assignment.total_marks} Points
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-50 text-slate-600">
                      Weight: {assignment.weightage}%
                    </span>
                    {assignment.allow_late ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700">
                        Late allowed (−{assignment.late_penalty_percent_per_day}%/day)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-500">
                        Strict deadline
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900">{assignment.title}</h3>
                  {assignment.description && (
                    <p className="text-xs text-slate-600 line-clamp-2">{assignment.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <span>
                        Due:{' '}
                        <strong className={isPastDue ? 'text-rose-600 font-semibold' : 'text-slate-800 font-semibold'}>
                          {dueDate.toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </strong>
                      </span>
                    </div>
                    {isPrivileged && assignment.submissions_count != null && (
                      <div className="flex items-center gap-1.5">
                        <FileCheck className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        <span>
                          <strong>{assignment.submissions_count}</strong> student submissions
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  {status === 'graded' && grade ? (
                    <div className="text-left md:text-right">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        <span>
                          Graded: {grade.final_marks} / {assignment.total_marks} pts
                        </span>
                      </div>
                      {grade.feedback && (
                        <p className="text-[11px] italic text-slate-500 mt-1 max-w-xs text-left md:text-right">
                          “{grade.feedback}”
                        </p>
                      )}
                    </div>
                  ) : status === 'submitted' ? (
                    <div className="text-left md:text-right">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                        <span>Submitted</span>
                      </span>
                      <p className="text-[11px] text-slate-400 mt-1">Pending instructor review</p>
                    </div>
                  ) : isPrivileged ? (
                    <Link
                      to={`/courses/${assignment.course_offering_id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                    >
                      <span>Manage Submissions</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    </Link>
                  ) : (
                    <button
                      onClick={() => setSubmitTarget(assignment)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Submit Work</span>
                    </button>
                  )}

                  <Link
                    to={`/courses/${assignment.course_offering_id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-600 transition"
                  >
                    <span>Course Workspace</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {submitTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-assignment-title"
            className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                {submitTarget.course_code && (
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
                    {submitTarget.course_code}
                  </span>
                )}
                <h2 id="submit-assignment-title" className="text-base font-bold text-slate-900">
                  {submitTarget.title}
                </h2>
              </div>
              <button
                onClick={closeModal}
                aria-label="Close submission dialog"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {submitError && (
                <div role="alert" className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" aria-hidden="true" />
                  <span>{submitError}</span>
                </div>
              )}

              <div>
                <label htmlFor="submission-file" className="block text-xs font-semibold text-slate-700 mb-1">
                  Deliverable file
                </label>
                <input
                  id="submission-file"
                  type="file"
                  onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-300 rounded-lg p-1.5"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Optional if you provide written notes below. Provide at least one of the two.
                </p>
              </div>

              <div>
                <label htmlFor="submission-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                  Submission notes (optional)
                </label>
                <textarea
                  id="submission-notes"
                  rows={3}
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  placeholder="Provide a repository link or notes for the evaluator…"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">Honor code</p>
                <p>
                  By submitting this deliverable you certify that it represents your own original work
                  in accordance with institutional academic integrity policy.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={(!submissionFile && !submissionNotes.trim()) || submitMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-xs"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{submitMutation.isPending ? 'Submitting…' : 'Confirm Submission'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

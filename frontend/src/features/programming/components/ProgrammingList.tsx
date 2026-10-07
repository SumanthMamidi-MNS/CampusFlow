import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Code2, Plus, Terminal, X } from 'lucide-react';
import { PageHeader } from '@/core/components/layout/page-header';
import { PageLoading } from '@/core/components/ui/loading';
import { EmptyState } from '@/core/components/ui/empty-state';
import { useAuth } from '@/core/auth/hooks';
import { useCourseOfferings } from '@/features/courses/api';
import { useCodingProblems, useCreateCodingProblem, useRunnerHealth } from '../api';

function apiError(err: any, fallback: string): string {
  return err?.response?.data?.error?.message || err?.message || fallback;
}

export function ProgrammingList() {
  const { user } = useAuth();
  const isStaff = Boolean(
    user?.roles.some((r) => ['admin', 'super_admin', 'faculty', 'department_head'].includes(r))
  );

  const { data: problems, isLoading, isError, error, refetch } = useCodingProblems();
  const { data: health } = useRunnerHealth();
  const { data: offerings } = useCourseOfferings();
  const createProblem = useCreateCodingProblem();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [offeringId, setOfferingId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalMarks, setTotalMarks] = useState(10);
  const [starterCode, setStarterCode] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const list = problems ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.course_code || '').toLowerCase().includes(q) ||
        (p.course_title || '').toLowerCase().includes(q)
    );
  }, [problems, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!offeringId) {
      setFormError('Please select a course offering.');
      return;
    }
    if (!title.trim()) {
      setFormError('A problem title is required.');
      return;
    }
    try {
      await createProblem.mutateAsync({
        course_offering_id: offeringId,
        title: title.trim(),
        description: description.trim() || undefined,
        total_marks: Number(totalMarks) || 10,
        starter_code: starterCode || undefined,
        language: 'python',
        is_published: true,
      });
      setIsCreateOpen(false);
      setTitle('');
      setDescription('');
      setStarterCode('');
    } catch (err: any) {
      setFormError(apiError(err, 'Could not create the problem.'));
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      <PageHeader
        title="Programming Environment"
        description="Write, run, and submit Python directly in your browser, with automated test-case evaluation."
        actions={
          isStaff ? (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>New Problem</span>
            </button>
          ) : undefined
        }
      />

      {health && !health.reachable && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">Code execution service unavailable</p>
            <p className="mt-0.5">
              The sandboxed execution service is not reachable, so running and submitting code is
              temporarily disabled. Your instructor has been notified of the outage.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <label htmlFor="coding-search" className="sr-only">
          Search problems
        </label>
        <input
          id="coding-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search problems by title or course…"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
        />
      </div>

      {isLoading ? (
        <PageLoading message="Loading programming problems…" />
      ) : isError ? (
        <div className="bg-white rounded-xl border border-rose-200 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-3" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-800">Could not load problems</h3>
          <p className="text-xs text-slate-500 mt-1">{apiError(error, 'Request failed.')}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Code2}
          title="No programming problems"
          description={
            isStaff
              ? 'Create your first Python problem and add test cases to make it auto-gradable.'
              : 'Your instructors have not published any programming problems for your courses yet.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((problem) => (
            <Link
              key={problem.id}
              to={`/programming/${problem.id}`}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-blue-300 transition"
            >
              <div className="flex items-center gap-2">
                {problem.course_code && (
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-100">
                    {problem.course_code}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  <Terminal className="h-3 w-3" aria-hidden="true" />
                  {problem.language}
                </span>
                {!problem.is_published && (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                    Draft
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-base font-bold text-slate-900 group-hover:text-blue-700 transition">
                {problem.title}
              </h3>
              {problem.course_title && (
                <p className="text-xs text-slate-500 mt-0.5">{problem.course_title}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span>
                  <strong className="text-slate-700">{problem.total_marks}</strong> marks
                </span>
                <span>
                  <strong className="text-slate-700">{problem.visible_test_case_count}</strong>{' '}
                  test case{problem.visible_test_case_count === 1 ? '' : 's'}
                </span>
                <span>
                  limit <strong className="text-slate-700">{problem.time_limit_ms / 1000}s</strong>
                </span>
              </div>
              {problem.my_submission_count > 0 && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Best: {problem.my_best_score ?? 0} / {problem.total_marks}
                  <span className="font-normal text-emerald-600">
                    · {problem.my_submission_count} attempt
                    {problem.my_submission_count === 1 ? '' : 's'}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-problem-title"
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="create-problem-title" className="text-base font-bold text-slate-900">
                New programming problem
              </h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {formError && (
                <div role="alert" className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                  {formError}
                </div>
              )}
              <div>
                <label htmlFor="problem-offering" className="block text-xs font-semibold text-slate-700 mb-1">
                  Course offering
                </label>
                <select
                  id="problem-offering"
                  value={offeringId}
                  onChange={(e) => setOfferingId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Select an offering…</option>
                  {(offerings || []).map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {offering.course_code} — {offering.course_title} (Sec {offering.section})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="problem-title" className="block text-xs font-semibold text-slate-700 mb-1">
                  Title
                </label>
                <input
                  id="problem-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  placeholder="e.g. Sum of two integers"
                />
              </div>
              <div>
                <label htmlFor="problem-description" className="block text-xs font-semibold text-slate-700 mb-1">
                  Problem statement
                </label>
                <textarea
                  id="problem-description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-600 focus:outline-none"
                  placeholder="Describe the input format, the required output, and any constraints."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="problem-marks" className="block text-xs font-semibold text-slate-700 mb-1">
                    Total marks
                  </label>
                  <input
                    id="problem-marks"
                    type="number"
                    min={1}
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="problem-starter" className="block text-xs font-semibold text-slate-700 mb-1">
                    Starter code (optional)
                  </label>
                  <input
                    id="problem-starter"
                    type="text"
                    value={starterCode}
                    onChange={(e) => setStarterCode(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
                    placeholder="print(input())"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProblem.isPending}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createProblem.isPending ? 'Creating…' : 'Create problem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

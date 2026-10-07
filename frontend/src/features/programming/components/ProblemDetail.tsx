import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Code2,
  Loader2,
  Play,
  Send,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { PageLoading } from '@/core/components/ui/loading';
import { useAuth } from '@/core/auth/hooks';
import { CodeEditor } from './CodeEditor';
import {
  useAddTestCase,
  useCodingProblem,
  useDeleteTestCase,
  useMyCodeSubmissions,
  useProblemSubmissions,
  useRunCode,
  useSubmitCode,
  useTestCases,
} from '../api';
import type { CodeRunResult, CodingSubmission } from '../types';

function apiError(err: any, fallback: string): string {
  return err?.response?.data?.error?.message || err?.message || fallback;
}

function statusTone(status: string): string {
  switch (status) {
    case 'passed':
    case 'success':
      return 'text-emerald-700';
    case 'partial':
      return 'text-amber-700';
    case 'error':
    case 'compile_error':
    case 'runtime_error':
    case 'timeout':
    case 'memory_exceeded':
      return 'text-rose-700';
    default:
      return 'text-slate-600';
  }
}

export function ProblemDetail() {
  const { id } = useParams<{ id: string }>();
  const problemId = id || '';
  const { user } = useAuth();
  const isStaff = Boolean(
    user?.roles.some((r) => ['admin', 'super_admin', 'faculty', 'department_head'].includes(r))
  );

  const { data: problem, isLoading, isError, error, refetch } = useCodingProblem(problemId);
  const runCode = useRunCode(problemId);
  const submitCode = useSubmitCode(problemId);
  const { data: mySubmissions } = useMyCodeSubmissions(problemId);

  const [tab, setTab] = useState<'workspace' | 'test-cases' | 'submissions'>('workspace');
  const [source, setSource] = useState<string | null>(null);
  const [stdin, setStdin] = useState('');
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [lastSubmission, setLastSubmission] = useState<CodingSubmission | null>(null);
  const [actionError, setActionError] = useState('');

  const code = source ?? problem?.starter_code ?? '';

  const latestSubmission = useMemo(() => {
    if (lastSubmission) return lastSubmission;
    return mySubmissions && mySubmissions.length > 0 ? mySubmissions[0] : null;
  }, [lastSubmission, mySubmissions]);

  if (isLoading) return <PageLoading message="Loading problem…" />;

  if (isError || !problem) {
    return (
      <div className="max-w-xl mx-auto my-12 rounded-xl border border-slate-200 bg-white p-8 text-center">
        <AlertCircle className="h-9 w-9 text-rose-500 mx-auto mb-3" aria-hidden="true" />
        <h1 className="text-lg font-bold text-slate-900">Problem unavailable</h1>
        <p className="mt-1 text-sm text-slate-600">{apiError(error, 'This problem could not be loaded.')}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link
            to="/programming"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to problems
          </Link>
          <button
            onClick={() => refetch()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const handleRun = async () => {
    setActionError('');
    setRunResult(null);
    try {
      const result = await runCode.mutateAsync({ sourceCode: code, stdin });
      setRunResult(result);
    } catch (err: any) {
      setActionError(apiError(err, 'Could not run your program.'));
    }
  };

  const handleSubmit = async () => {
    setActionError('');
    try {
      const submission = await submitCode.mutateAsync({ sourceCode: code });
      setLastSubmission(submission);
    } catch (err: any) {
      setActionError(apiError(err, 'Could not submit your solution.'));
    }
  };

  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: 'workspace', label: 'Workspace' },
    ...(isStaff
      ? ([
          { key: 'test-cases', label: 'Test cases' },
          { key: 'submissions', label: 'Submissions' },
        ] as Array<{ key: typeof tab; label: string }>)
      : []),
  ];

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <Link
          to="/programming"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to problems
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {problem.course_code && (
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-100">
              {problem.course_code}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            <Terminal className="h-3 w-3" aria-hidden="true" /> {problem.language}
          </span>
          <span className="text-[11px] font-semibold text-slate-500">
            {problem.total_marks} marks · {problem.time_limit_ms / 1000}s limit ·{' '}
            {Math.round(problem.memory_limit_kb / 1024)} MB
          </span>
        </div>
        <h1 className="mt-2 text-xl font-bold text-slate-900">{problem.title}</h1>
        {problem.description && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{problem.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {actionError}
        </div>
      )}

      {tab === 'workspace' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Code2 className="h-4 w-4" aria-hidden="true" /> Your solution
              </h2>
              <button
                onClick={() => setSource(problem.starter_code ?? '')}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
              >
                Reset to starter code
              </button>
            </div>
            <CodeEditor value={code} onChange={setSource} language={problem.language} />

            <div>
              <label htmlFor="stdin" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Program input (stdin) — used only when you press Run
              </label>
              <textarea
                id="stdin"
                rows={3}
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs focus:border-blue-600 focus:outline-none"
                placeholder="Type the input your program should read…"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleRun}
                disabled={runCode.isPending || code.trim() === ''}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {runCode.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4" aria-hidden="true" />
                )}
                Run code
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitCode.isPending || code.trim() === ''}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitCode.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                Submit for grading
              </button>
              <span className="text-[11px] text-slate-500">
                Submitting runs every test case and records your marks.
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Output</h2>
              {!runResult ? (
                <p className="mt-2 text-xs text-slate-500">
                  Press Run to execute your program in the sandbox.
                </p>
              ) : (
                <div className="mt-2 space-y-3">
                  <p className={`text-xs font-semibold ${statusTone(runResult.status)}`}>
                    {runResult.timed_out ? 'Timed out' : runResult.status.replace(/_/g, ' ')}
                    {runResult.duration_ms != null && (
                      <span className="font-normal text-slate-500"> · {runResult.duration_ms} ms</span>
                    )}
                  </p>
                  {runResult.stdout && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400">stdout</p>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-slate-900 p-2.5 text-[12px] text-slate-100">
                        {runResult.stdout}
                      </pre>
                    </div>
                  )}
                  {runResult.stderr && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-400">stderr</p>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-rose-950 p-2.5 text-[12px] text-rose-100">
                        {runResult.stderr}
                      </pre>
                    </div>
                  )}
                  {runResult.message && (
                    <p className="text-[11px] text-slate-500">{runResult.message}</p>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Latest submission
              </h2>
              {!latestSubmission ? (
                <p className="mt-2 text-xs text-slate-500">
                  You have not submitted a solution yet.
                </p>
              ) : (
                <SubmissionSummary submission={latestSubmission} totalMarks={problem.total_marks} />
              )}
            </section>
          </div>
        </div>
      )}

      {tab === 'test-cases' && isStaff && <TestCasesPanel problemId={problemId} />}
      {tab === 'submissions' && isStaff && <SubmissionsPanel problemId={problemId} />}
    </div>
  );
}

function SubmissionSummary({
  submission,
  totalMarks,
}: {
  submission: CodingSubmission;
  totalMarks: number;
}) {
  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${statusTone(submission.status)}`}>
          {submission.status.toUpperCase()}
        </span>
        <span className="text-sm font-semibold text-slate-800">
          {submission.score} / {totalMarks}
        </span>
      </div>
      <p className="text-[11px] text-slate-500">
        {submission.passed_tests} of {submission.total_tests} tests passed ·{' '}
        {new Date(submission.submitted_at).toLocaleString()}
      </p>
      <ul className="space-y-1.5">
        {submission.results.map((result) => (
          <li key={result.id} className="flex items-start gap-2 text-xs">
            {result.passed ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
            ) : (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
            )}
            <span className="text-slate-700">
              {result.name}
              {result.is_hidden && <span className="text-slate-400"> (hidden)</span>}
              <span className="block text-[11px] text-slate-500">
                {result.passed
                  ? 'Passed'
                  : result.status === 'timeout'
                  ? 'Timed out'
                  : result.stderr
                  ? result.stderr.split('\n')[0]
                  : 'Output did not match the expected result'}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {submission.diagnostics && (
        <pre className="max-h-32 overflow-auto rounded-md bg-slate-900 p-2.5 text-[11px] text-slate-100">
          {submission.diagnostics}
        </pre>
      )}
    </div>
  );
}

function TestCasesPanel({ problemId }: { problemId: string }) {
  const { data: cases, isLoading } = useTestCases(problemId);
  const addCase = useAddTestCase(problemId);
  const deleteCase = useDeleteTestCase(problemId);

  const [name, setName] = useState('');
  const [stdin, setStdin] = useState('');
  const [expected, setExpected] = useState('');
  const [isHidden, setIsHidden] = useState(true);
  const [formError, setFormError] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError('Give the test case a name.');
      return;
    }
    try {
      await addCase.mutateAsync({
        name: name.trim(),
        stdin,
        expected_output: expected,
        is_hidden: isHidden,
        comparison: 'trimmed',
      });
      setName('');
      setStdin('');
      setExpected('');
    } catch (err: any) {
      setFormError(apiError(err, 'Could not add the test case.'));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">Existing test cases</h2>
        {isLoading ? (
          <p className="mt-3 text-xs text-slate-400">Loading…</p>
        ) : !cases || cases.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            No test cases yet. A problem cannot be graded until at least one exists.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {cases.map((testCase) => (
              <li key={testCase.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    {testCase.name}
                    {testCase.is_hidden && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        hidden
                      </span>
                    )}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500 whitespace-pre-wrap">
                    in: {testCase.stdin || '(empty)'}
                  </p>
                  <p className="font-mono text-[11px] text-slate-500 whitespace-pre-wrap">
                    out: {testCase.expected_output || '(empty)'}
                  </p>
                </div>
                <button
                  onClick={() => deleteCase.mutate(testCase.id)}
                  aria-label={`Delete test case ${testCase.name}`}
                  className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleAdd} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Add a test case</h2>
        {formError && (
          <div role="alert" className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-800">
            {formError}
          </div>
        )}
        <div>
          <label htmlFor="tc-name" className="block text-[11px] font-semibold text-slate-600 mb-1">
            Name
          </label>
          <input
            id="tc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            placeholder="e.g. Sample input"
          />
        </div>
        <div>
          <label htmlFor="tc-stdin" className="block text-[11px] font-semibold text-slate-600 mb-1">
            Input (stdin)
          </label>
          <textarea
            id="tc-stdin"
            rows={3}
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs focus:border-blue-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="tc-expected" className="block text-[11px] font-semibold text-slate-600 mb-1">
            Expected output
          </label>
          <textarea
            id="tc-expected"
            rows={3}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs focus:border-blue-600 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={isHidden}
            onChange={(e) => setIsHidden(e.target.checked)}
            className="rounded text-blue-600"
          />
          Hide the expected output from students
        </label>
        <button
          type="submit"
          disabled={addCase.isPending}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {addCase.isPending ? 'Adding…' : 'Add test case'}
        </button>
      </form>
    </div>
  );
}

function SubmissionsPanel({ problemId }: { problemId: string }) {
  const { data: submissions, isLoading } = useProblemSubmissions(problemId);

  if (isLoading) return <PageLoading message="Loading submissions…" />;
  if (!submissions || submissions.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No submissions have been made for this problem yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-2.5 font-semibold">Student</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 font-semibold">Score</th>
            <th className="px-4 py-2.5 font-semibold">Tests</th>
            <th className="px-4 py-2.5 font-semibold">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {submissions.map((submission) => (
            <tr key={submission.id}>
              <td className="px-5 py-3">
                <p className="font-medium text-slate-900">{submission.student_name || 'Student'}</p>
                <p className="text-[11px] text-slate-500">{submission.student_email}</p>
              </td>
              <td className={`px-4 py-3 text-xs font-semibold ${statusTone(submission.status)}`}>
                {submission.status}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {submission.score} / {submission.max_score}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {submission.passed_tests} / {submission.total_tests}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {new Date(submission.submitted_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

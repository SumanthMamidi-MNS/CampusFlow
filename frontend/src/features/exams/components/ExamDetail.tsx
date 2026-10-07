import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/core/components/ui';
import { ExamAnalyticsView } from '@/features/analytics/components/ExamAnalyticsView';
import { useQuestionBanks, useQuestions } from '@/features/question-banks/api';
import {
  useAddQuestionsToExam,
  useAttemptResponses,
  useExam,
  useExamAttempts,
  useGradeExamResponse,
  useProctoringTimeline,
  usePublishExamResults,
  useRemoveQuestionFromExam,
  useUnlockExamAttempt,
} from '../api';
import type { ExamAttemptSummary } from '../types';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  KeyRound,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

type Tab = 'questions' | 'submissions' | 'analytics';

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'graded':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'submitted':
    case 'auto_submitted':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'in_progress':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

export function ExamDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const examId = id || '';

  const { data: exam, isLoading: isExamLoading } = useExam(examId);
  const { data: attempts } = useExamAttempts(examId);

  const [activeTab, setActiveTab] = useState<Tab>('questions');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{
    body: string;
    destructive?: boolean;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  // Add-questions modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const { data: questionBanks } = useQuestionBanks();
  const { data: bankQuestions } = useQuestions(selectedBankId);

  // Grading / review modals
  const [gradingAttemptId, setGradingAttemptId] = useState<string | null>(null);
  const [auditAttemptId, setAuditAttemptId] = useState<string | null>(null);

  const addQuestionsMutation = useAddQuestionsToExam(examId);
  const removeQuestionMutation = useRemoveQuestionFromExam(examId);
  const publishResultsMutation = usePublishExamResults(examId);
  const unlockAttemptMutation = useUnlockExamAttempt(examId);

  const notify = (text: string) => {
    setMessage(text);
    setError('');
    window.setTimeout(() => setMessage(''), 4000);
  };
  const fail = (text: string) => {
    setError(text);
    setMessage('');
  };

  if (isExamLoading) {
    return <div className="p-12 text-center text-sm text-slate-400">Loading examination…</div>;
  }

  if (!exam) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">Examination not found</h2>
        <button
          onClick={() => navigate('/exams')}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Examinations
        </button>
      </div>
    );
  }

  const handleToggleSelectQuestion = (qId: string) => {
    setSelectedQIds((prev) => (prev.includes(qId) ? prev.filter((x) => x !== qId) : [...prev, qId]));
  };

  const handleAddSelectedQuestions = async () => {
    if (selectedQIds.length === 0) return;
    try {
      await addQuestionsMutation.mutateAsync(selectedQIds.map((qId) => ({ question_id: qId })));
      setIsAddOpen(false);
      setSelectedQIds([]);
      notify('Questions added to the examination.');
    } catch (err: any) {
      fail(err?.response?.data?.error?.message || 'Could not add the selected questions.');
    }
  };

  const handlePublish = () => {
    setConfirm({
      body: 'Publish results for this examination? All enrolled students will be notified and results become visible to them.',
      onConfirm: async () => {
        try {
          await publishResultsMutation.mutateAsync();
          notify('Results published and students notified.');
        } catch (err: any) {
          fail(err?.response?.data?.error?.message || 'Could not publish results.');
        }
      },
    });
  };

  const handleUnlockAttempt = (attempt: ExamAttemptSummary) => {
    setConfirm({
      body: `Authorize ${attempt.student_name || 'this candidate'} to resume this assessment? This clears the recorded integrity count and permits a resumed attempt, and is recorded in the audit trail.`,
      onConfirm: async () => {
        try {
          await unlockAttemptMutation.mutateAsync({
            attemptId: attempt.id,
            reason: 'Faculty authorized a resumed attempt after integrity review',
            resetViolations: true,
          });
          notify('Attempt reopened for the candidate.');
        } catch (err: any) {
          fail(err?.response?.data?.error?.message || 'Could not reopen the attempt.');
        }
      },
    });
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'questions', label: 'Questions' },
    { key: 'submissions', label: 'Submissions & Grading' },
    { key: 'analytics', label: 'Performance' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <button
          onClick={() => navigate('/exams')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Examinations
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase ${statusBadgeClass(exam.status)}`}>
              {humanize(exam.status)}
            </span>
            {exam.course_code && (
              <span className="text-xs font-semibold text-slate-500">{exam.course_code}</span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-2">{exam.title}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {exam.questions_count} questions · {exam.total_marks} marks · {exam.duration_minutes} minutes
          </p>
        </div>
        <button
          onClick={handlePublish}
          disabled={publishResultsMutation.isPending || exam.status === 'published'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {exam.status === 'published' ? 'Results published' : 'Publish results'}
        </button>
      </div>

      {message && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            aria-current={activeTab === tab.key ? 'page' : undefined}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'questions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-900">Examination questions</h2>
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add from bank
            </button>
          </div>
          {exam.questions.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              No questions added yet. Add questions from a question bank to build this examination.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {exam.questions.map((question, idx) => (
                <li key={question.id} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-400">
                      Q{idx + 1} · {humanize(question.question_type)} · {question.marks} marks
                    </p>
                    <p className="text-sm text-slate-800 mt-1">{question.body}</p>
                  </div>
                  <button
                    onClick={() =>
                      setConfirm({
                        body: 'Remove this question from the examination?',
                        destructive: true,
                        confirmLabel: 'Remove question',
                        onConfirm: async () => {
                          try {
                            await removeQuestionMutation.mutateAsync(question.id);
                            notify('Question removed.');
                          } catch (err: any) {
                            fail(err?.response?.data?.error?.message || 'Could not remove the question.');
                          }
                        },
                      })
                    }
                    aria-label="Remove question"
                    className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'submissions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-900">Candidate attempts</h2>
          </div>
          {!attempts || attempts.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No attempts recorded for this examination yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Candidate</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Score</th>
                    <th className="px-4 py-2.5 font-semibold">Integrity events</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">
                          {attempt.student_name || 'Candidate'}
                        </p>
                        <p className="text-[11px] text-slate-500">{attempt.student_email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(attempt.status)}`}>
                          {humanize(attempt.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {attempt.total_score != null ? (
                          <>
                            {attempt.total_score}
                            {attempt.percentage != null && (
                              <span className="text-slate-400"> ({attempt.percentage}%)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            attempt.proctor_violations_count > 0
                              ? 'text-amber-700 font-medium'
                              : 'text-slate-500'
                          }
                        >
                          {attempt.proctor_violations_count} recorded
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setAuditAttemptId(attempt.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Integrity log
                          </button>
                          <button
                            onClick={() => setGradingAttemptId(attempt.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Review
                          </button>
                          {(attempt.status === 'auto_submitted' || attempt.proctor_violations_count > 0) && (
                            <button
                              onClick={() => handleUnlockAttempt(attempt)}
                              disabled={unlockAttemptMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Reopen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <ExamAnalyticsView examId={examId} examTitle={exam.title} totalMarks={exam.total_marks} />
      )}

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-questions-title"
            className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="add-questions-title" className="text-base font-bold text-slate-900">
                Add questions from a bank
              </h2>
              <button
                onClick={() => setIsAddOpen(false)}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="bank-select" className="block text-xs font-semibold text-slate-700 mb-1">
                  Question bank
                </label>
                <select
                  id="bank-select"
                  value={selectedBankId}
                  onChange={(e) => {
                    setSelectedBankId(e.target.value);
                    setSelectedQIds([]);
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Select a question bank…</option>
                  {(questionBanks || []).map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.title} ({bank.questions_count})
                    </option>
                  ))}
                </select>
              </div>

              {selectedBankId && (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {!bankQuestions || bankQuestions.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500">This bank has no questions.</p>
                  ) : (
                    bankQuestions.map((question) => (
                      <label
                        key={question.id}
                        className="flex items-start gap-3 p-3 text-sm hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded text-blue-600"
                          checked={selectedQIds.includes(question.id)}
                          onChange={() => handleToggleSelectQuestion(question.id)}
                        />
                        <span>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {humanize(question.question_type)} · {question.difficulty} · {question.marks} marks
                          </span>
                          <span className="block text-slate-800">{question.body}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => setIsAddOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSelectedQuestions}
                disabled={selectedQIds.length === 0 || addQuestionsMutation.isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {addQuestionsMutation.isPending ? 'Adding…' : `Add ${selectedQIds.length || ''} question(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {gradingAttemptId && (
        <GradingModal examId={examId} attemptId={gradingAttemptId} onClose={() => setGradingAttemptId(null)} onNotice={notify} onError={fail} />
      )}

      {auditAttemptId && (
        <IntegrityLogModal
          attemptId={auditAttemptId}
          studentName={attempts?.find((a) => a.id === auditAttemptId)?.student_name || 'Candidate'}
          onClose={() => setAuditAttemptId(null)}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        body={confirm?.body ?? ''}
        destructive={confirm?.destructive}
        confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const action = confirm?.onConfirm;
          setConfirm(null);
          await action?.();
        }}
      />
    </div>
  );
}

// ── Grading modal ────────────────────────────────────────────────────────────

function answerText(answerData: any): string {
  if (!answerData) return 'No answer submitted';
  if (Array.isArray(answerData.selected)) return answerData.selected.join(', ') || 'No answer submitted';
  if (answerData.selected !== undefined && answerData.selected !== null && answerData.selected !== '')
    return String(answerData.selected);
  if (answerData.value !== undefined && answerData.value !== null) return String(answerData.value);
  if (Array.isArray(answerData.blanks)) return answerData.blanks.join(', ') || 'No answer submitted';
  if (typeof answerData.text === 'string') return answerData.text || 'No answer submitted';
  return 'No answer submitted';
}

function GradingModal({
  examId,
  attemptId,
  onClose,
  onNotice,
  onError,
}: {
  examId: string;
  attemptId: string;
  onClose: () => void;
  onNotice: (text: string) => void;
  onError: (text: string) => void;
}) {
  const { data: responses, isLoading } = useAttemptResponses(attemptId);
  const gradeMutation = useGradeExamResponse(examId);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const save = async (responseId: string, maxMarks: number) => {
    const value = marks[responseId];
    if (value === undefined || value < 0 || value > maxMarks) {
      onError(`Enter a mark between 0 and ${maxMarks}.`);
      return;
    }
    try {
      await gradeMutation.mutateAsync({ responseId, marksAwarded: value, feedback: feedback[responseId] });
      onNotice('Mark saved.');
    } catch (err: any) {
      onError(err?.response?.data?.error?.message || 'Could not save the mark.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="grading-title"
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h2 id="grading-title" className="text-base font-bold text-slate-900">
            Review &amp; grade attempt
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading responses…</p>
          ) : !responses || responses.length === 0 ? (
            <p className="text-sm text-slate-500">No responses recorded for this attempt.</p>
          ) : (
            responses.map((response) => {
              const needsManual = !response.is_auto_graded && response.question_type !== 'mcq' && response.question_type !== 'msq' && response.question_type !== 'true_false' && response.question_type !== 'numerical' && response.question_type !== 'fill_blank';
              return (
                <div key={response.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">
                      {humanize(response.question_type)} · max {response.max_marks}
                    </span>
                    {response.is_auto_graded ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Auto-graded
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Needs grading
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-900">{response.question_body}</p>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs">
                    <p className="font-semibold uppercase text-[10px] text-slate-500">Candidate answer</p>
                    <p className="mt-0.5 text-slate-800 whitespace-pre-wrap">{answerText(response.answer_data)}</p>
                  </div>
                  {response.correct_answer_summary && (
                    <p className="text-xs text-slate-600">
                      Expected: <strong className="text-slate-800">{response.correct_answer_summary}</strong>
                    </p>
                  )}
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label
                        htmlFor={`marks-${response.id}`}
                        className="block text-[11px] font-semibold text-slate-600 mb-1"
                      >
                        Marks awarded
                      </label>
                      <input
                        id={`marks-${response.id}`}
                        type="number"
                        min={0}
                        max={response.max_marks}
                        step="any"
                        value={marks[response.id] ?? (response.marks_awarded ?? '')}
                        onChange={(e) => setMarks({ ...marks, [response.id]: Number(e.target.value) })}
                        className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1 min-w-[12rem]">
                      <label
                        htmlFor={`feedback-${response.id}`}
                        className="block text-[11px] font-semibold text-slate-600 mb-1"
                      >
                        Feedback (optional)
                      </label>
                      <input
                        id={`feedback-${response.id}`}
                        type="text"
                        value={feedback[response.id] ?? response.feedback ?? ''}
                        onChange={(e) => setFeedback({ ...feedback, [response.id]: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => save(response.id, response.max_marks)}
                      disabled={gradeMutation.isPending}
                      className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save mark
                    </button>
                  </div>
                  {needsManual && response.marks_awarded == null && (
                    <p className="text-[11px] text-amber-700">
                      This response is awaiting a manual mark for the attempt to be complete.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Integrity log modal ──────────────────────────────────────────────────────

function IntegrityLogModal({
  attemptId,
  studentName,
  onClose,
}: {
  attemptId: string;
  studentName: string;
  onClose: () => void;
}) {
  const { data: timeline, isLoading } = useProctoringTimeline(attemptId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="integrity-title"
        className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 id="integrity-title" className="text-base font-bold text-slate-900">
              Assessment integrity log
            </h2>
            <p className="text-xs text-slate-500">{studentName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-6">
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading log…</p>
          ) : !timeline || timeline.length === 0 ? (
            <p className="text-sm text-slate-500">
              No integrity events were recorded for this attempt.
            </p>
          ) : (
            <>
              <p className="mb-4 text-xs text-slate-500">
                These observable events are advisory and are provided to support your professional
                judgement. They do not by themselves determine a breach.
              </p>
              <ol className="space-y-3 border-l border-slate-200 pl-4">
                {timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      className={`absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full ${
                        event.severity === 'high'
                          ? 'bg-rose-500'
                          : event.severity === 'medium'
                          ? 'bg-amber-500'
                          : 'bg-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <p className="text-xs font-semibold text-slate-800">
                      {humanize(event.event_type)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(event.timestamp).toLocaleString()} · {event.severity} severity
                    </p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

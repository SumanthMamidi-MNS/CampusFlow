import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Send,
} from 'lucide-react';
import { useAuth } from '@/core/auth/hooks';
import { PageLoading } from '@/core/components/ui/loading';
import {
  useExamBrief,
  useRecordProctoringEvent,
  useSaveExamAnswers,
  useStartExam,
  useSubmitExam,
} from '../api';
import type { ExamDelivery as ExamDeliveryData, ExamDeliveryQuestion, SaveAnswerPayload } from '../types';

type AnswerState = Record<string, { answer_data: any; flagged_for_review: boolean }>;

const AUTOSAVE_INTERVAL_MS = 30_000;
const EVENT_THROTTLE_MS = 2_000;

function apiError(err: any, fallback: string): string {
  return err?.response?.data?.error?.message || err?.message || fallback;
}

function emptyAnswerFor(type: string): any {
  if (type === 'msq') return { selected: [] };
  if (type === 'numerical') return { value: null };
  if (type === 'fill_blank') return { blanks: [''] };
  if (type === 'short_answer' || type === 'essay') return { text: '' };
  return { selected: '' };
}

function isAnswered(answer: any): boolean {
  if (!answer) return false;
  if (Array.isArray(answer.selected)) return answer.selected.length > 0;
  if (answer.selected !== undefined && answer.selected !== null && answer.selected !== '') return true;
  if (answer.value !== undefined && answer.value !== null && answer.value !== '') return true;
  if (Array.isArray(answer.blanks)) return answer.blanks.some((b: string) => b && b.trim() !== '');
  if (typeof answer.text === 'string') return answer.text.trim() !== '';
  return false;
}

export function ExamDelivery() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const examId = id || '';

  // Candidate-safe metadata only: the staff exam definition (which contains
  // answer keys) is never fetched from the assessment-taking surface.
  const { data: examBrief } = useExamBrief(examId);
  const startMutation = useStartExam(examId);

  const [delivery, setDelivery] = useState<ExamDeliveryData | null>(null);
  const [hasBegun, setHasBegun] = useState(false);
  const [startError, setStartError] = useState('');
  const [blockedMessage, setBlockedMessage] = useState('');
  const [answers, setAnswers] = useState<AnswerState>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const attemptId = delivery?.attempt_id || '';
  const saveAnswers = useSaveExamAnswers(attemptId);
  const submitExam = useSubmitExam(attemptId);
  const recordEvent = useRecordProctoringEvent(attemptId);

  const answersRef = useRef<AnswerState>({});
  answersRef.current = answers;
  const submittedRef = useRef(false);
  const lastEventRef = useRef<Record<string, number>>({});

  const questions = delivery?.questions || [];

  // ── Begin / resume the attempt ─────────────────────────────────────────────
  const beginAttempt = useCallback(async () => {
    setStartError('');
    try {
      const data = await startMutation.mutateAsync(undefined);
      setDelivery(data);
      setRemainingSeconds(data.remaining_seconds);
      const restored: AnswerState = {};
      Object.entries(data.saved_answers || {}).forEach(([qid, saved]: [string, any]) => {
        restored[qid] = {
          answer_data: saved?.answer_data ?? emptyAnswerFor(''),
          flagged_for_review: Boolean(saved?.flagged_for_review),
        };
      });
      // Merge any locally cached draft that is newer than the server copy.
      const mirrorKey = `exam_answers_${data.attempt_id}`;
      const mirror = localStorage.getItem(mirrorKey);
      if (mirror) {
        try {
          const parsed = JSON.parse(mirror);
          Object.entries(parsed).forEach(([qid, value]: [string, any]) => {
            const existing = restored[qid];
            if (!existing || !isAnswered(existing.answer_data)) {
              restored[qid] = value;
            }
          });
        } catch {
          /* ignore corrupt draft */
        }
      }
      setAnswers(restored);
      setHasBegun(true);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = apiError(err, 'Unable to start this assessment.');
      if (status === 423 || status === 403) {
        setBlockedMessage(detail);
      } else {
        setStartError(detail);
      }
    }
  }, [startMutation]);

  // Mirror answers to localStorage so a refresh never loses work.
  useEffect(() => {
    if (!attemptId) return;
    localStorage.setItem(`exam_answers_${attemptId}`, JSON.stringify(answers));
  }, [answers, attemptId]);

  // ── Persist a batch of answers to the server ───────────────────────────────
  const persistAnswers = useCallback(
    async (toSave: SaveAnswerPayload[]) => {
      if (!attemptId || toSave.length === 0 || submittedRef.current) return;
      setSaveState('saving');
      try {
        await saveAnswers.mutateAsync(toSave);
        setSaveState('saved');
        setNotice(null);
      } catch (err: any) {
        setSaveState('error');
        if (err?.response?.status === 400) {
          // Server enforced the duration; the attempt was auto-submitted.
          setNotice(apiError(err, 'The assessment time has ended; your work was submitted.'));
        }
      }
    },
    [attemptId, saveAnswers]
  );

  const buildPayload = useCallback((): SaveAnswerPayload[] => {
    return Object.entries(answersRef.current)
      .filter(([, value]) => value && (isAnswered(value.answer_data) || value.flagged_for_review))
      .map(([examQuestionId, value]) => ({
        exam_question_id: examQuestionId,
        answer_data: value.answer_data,
        flagged_for_review: value.flagged_for_review,
      }));
  }, []);

  // ── Autosave cadence ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasBegun || !attemptId) return;
    const handle = setInterval(() => {
      persistAnswers(buildPayload());
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [hasBegun, attemptId, persistAnswers, buildPayload]);

  // ── Final submission ───────────────────────────────────────────────────────
  const finalize = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      try {
        await persistAnswers(buildPayload());
        await submitExam.mutateAsync();
        if (attemptId) localStorage.removeItem(`exam_answers_${attemptId}`);
        navigate(`/exams/${examId}/results`);
      } catch (err: any) {
        submittedRef.current = false;
        setNotice(
          apiError(
            err,
            auto
              ? 'The assessment time ended. Submission could not be confirmed — please retry.'
              : 'Submission failed. Please retry.'
          )
        );
      }
    },
    [persistAnswers, buildPayload, submitExam, attemptId, examId, navigate]
  );

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasBegun || submittedRef.current) return;
    const handle = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(handle);
          finalize(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(handle);
  }, [hasBegun, finalize]);

  // ── Observable proctoring telemetry ────────────────────────────────────────
  const reportEvent = useCallback(
    async (eventType: string, severity: 'low' | 'medium' | 'high') => {
      if (!attemptId || submittedRef.current) return;
      const now = Date.now();
      if (now - (lastEventRef.current[eventType] || 0) < EVENT_THROTTLE_MS) return;
      lastEventRef.current[eventType] = now;
      try {
        const res = await recordEvent.mutateAsync({ event_type: eventType, severity });
        if (res?.warning) setNotice(res.warning);
        if (res?.auto_submitted) {
          submittedRef.current = true;
          localStorage.removeItem(`exam_answers_${attemptId}`);
          navigate(`/exams/${examId}/results`);
        }
      } catch {
        /* Telemetry is best-effort; never interrupt the candidate for a sync failure. */
      }
    },
    [attemptId, recordEvent, navigate, examId]
  );

  // Integrity configuration is server-authoritative: once an attempt exists the
  // start response decides, and the brief only covers the pre-attempt screen.
  const proctoringEnabled =
    delivery?.proctoring_enabled ?? (examBrief?.config?.proctoring_enabled !== false);

  useEffect(() => {
    if (!hasBegun || !proctoringEnabled) return;

    const onVisibility = () => {
      if (document.hidden) reportEvent('tab_switch', 'medium');
    };
    const onBlur = () => reportEvent('window_blur', 'medium');
    const onCopy = () => reportEvent('copy_paste_attempt', 'medium');
    const onPaste = () => reportEvent('copy_paste_attempt', 'medium');
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      reportEvent('context_menu', 'low');
    };
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) reportEvent('fullscreen_exit', 'medium');
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [hasBegun, proctoringEnabled, reportEvent]);

  // Warn before an accidental refresh/close mid-attempt.
  useEffect(() => {
    if (!hasBegun) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasBegun]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* Browsers may require a user gesture or deny the request. */
    }
  };

  // ── Answer editing ─────────────────────────────────────────────────────────
  const setAnswer = (questionId: string, answerData: any) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        answer_data: answerData,
        flagged_for_review: prev[questionId]?.flagged_for_review || false,
      },
    }));
    setSaveState('idle');
  };

  const toggleFlag = (questionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        answer_data: prev[questionId]?.answer_data ?? emptyAnswerFor(''),
        flagged_for_review: !prev[questionId]?.flagged_for_review,
      },
    }));
  };

  const goTo = (index: number) => {
    persistAnswers(buildPayload());
    setCurrentIndex(index);
  };

  const answeredCount = questions.filter((q) => isAnswered(answers[q.id]?.answer_data)).length;

  const timeLabel = useMemo(() => {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [remainingSeconds]);

  // ── Render: blocked / error / loading states ───────────────────────────────
  if (blockedMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center shadow-xs">
          <Info className="h-10 w-10 text-slate-400 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-bold text-slate-900">Assessment Unavailable</h1>
          <p className="text-sm text-slate-600 mt-2">{blockedMessage}</p>
          <button
            onClick={() => navigate('/exams')}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Return to Examinations
          </button>
        </div>
      </div>
    );
  }

  if (startError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-rose-200 p-8 text-center shadow-xs">
          <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-bold text-slate-900">Cannot Begin Assessment</h1>
          <p className="text-sm text-slate-600 mt-2">{startError}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => navigate('/exams')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={beginAttempt}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasBegun) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-2xl w-full bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            Assessment brief
          </p>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {examBrief?.title || 'Examination'}
          </h1>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>
              Duration: <strong className="text-slate-900">{examBrief?.duration_minutes ?? '—'} minutes</strong>
              {' · '}
              Total marks: <strong className="text-slate-900">{examBrief?.total_marks ?? '—'}</strong>
            </p>
            {examBrief?.instructions && (
              <p className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-slate-700">
                {examBrief.instructions}
              </p>
            )}
            {proctoringEnabled && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1.5">
                <p className="font-semibold text-slate-800">Assessment integrity</p>
                <p>
                  This session records observable events such as leaving the assessment window or
                  full-screen mode, and clipboard activity. These records are provided to your
                  instructor for review. Please keep this window in focus for the duration of the
                  assessment. If you believe an event was recorded in error, contact your instructor.
                </p>
              </div>
            )}
          </div>
          <button
            onClick={beginAttempt}
            disabled={startMutation.isPending}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {startMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {startMutation.isPending ? 'Preparing…' : 'Begin assessment'}
          </button>
        </div>
      </div>
    );
  }

  if (!delivery) {
    return <PageLoading message="Preparing your assessment…" />;
  }

  const current = questions[currentIndex];
  const currentAnswer = current ? answers[current.id]?.answer_data ?? emptyAnswerFor(current.question_type) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Assessment in progress
            </p>
            <h1 className="truncate text-sm font-bold text-slate-900">{delivery.exam_title}</h1>
            <p className="text-[11px] text-slate-500">
              {user ? `${user.first_name} ${user.last_name}` : 'Candidate'} · {answeredCount} of{' '}
              {questions.length} answered
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {proctoringEnabled && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Integrity monitoring on
              </span>
            )}
            <div
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-bold tabular-nums ${
                remainingSeconds <= 300
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-white text-slate-800'
              }`}
              aria-live="off"
            >
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {timeLabel}
            </div>
            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {notice && (
          <div
            role="status"
            className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900"
          >
            <div className="mx-auto max-w-6xl">{notice}</div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          {current ? (
            <>
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    Question {currentIndex + 1} of {questions.length}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {current.marks} mark{current.marks === 1 ? '' : 's'}
                    {current.negative_marks > 0 && ` · −${current.negative_marks} on an incorrect answer`}
                  </p>
                </div>
                <button
                  onClick={() => toggleFlag(current.id)}
                  aria-pressed={Boolean(answers[current.id]?.flagged_for_review)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    answers[current.id]?.flagged_for_review
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  {answers[current.id]?.flagged_for_review ? 'Flagged' : 'Flag for review'}
                </button>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm font-medium text-slate-900">
                {current.body}
              </p>

              <div className="mt-5">
                <QuestionInput
                  question={current}
                  answer={currentAnswer}
                  onChange={(value) => setAnswer(current.id, value)}
                />
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => goTo(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                </button>
                {currentIndex < questions.length - 1 ? (
                  <button
                    onClick={() => goTo(currentIndex + 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      persistAnswers(buildPayload());
                      setConfirmOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" /> Submit assessment
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">This assessment has no questions.</p>
          )}
        </section>

        <aside className="lg:sticky lg:top-24 h-fit bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Navigator</h2>
            <span
              className={`text-[11px] font-medium ${
                saveState === 'error' ? 'text-rose-600' : 'text-slate-400'
              }`}
            >
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                ? 'Not saved'
                : 'Autosave on'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-6 gap-2">
            {questions.map((q, idx) => {
              const answered = isAnswered(answers[q.id]?.answer_data);
              const flagged = Boolean(answers[q.id]?.flagged_for_review);
              return (
                <button
                  key={q.id}
                  onClick={() => goTo(idx)}
                  aria-label={`Question ${idx + 1}${answered ? ', answered' : ', not answered'}${
                    flagged ? ', flagged' : ''
                  }`}
                  aria-current={idx === currentIndex ? 'true' : undefined}
                  className={`h-9 rounded-md border text-xs font-semibold transition ${
                    idx === currentIndex
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : answered
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {idx + 1}
                  {flagged && <span className="ml-0.5 text-amber-500">•</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-1 text-[11px] text-slate-500">
            <p className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-blue-50 border border-blue-200" /> Answered
            </p>
            <p className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-white border border-slate-200" /> Not answered
            </p>
          </div>
          <button
            onClick={() => {
              persistAnswers(buildPayload());
              setConfirmOpen(true);
            }}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Submit assessment
          </button>
        </aside>
      </main>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-exam-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h2 id="submit-exam-title" className="text-base font-bold text-slate-900">
              Submit assessment?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              You have answered {answeredCount} of {questions.length} questions.
              {answeredCount < questions.length && (
                <span className="text-amber-700">
                  {' '}
                  {questions.length - answeredCount} question(s) remain unanswered and will be
                  marked as such.
                </span>
              )}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Once submitted, your responses are final and are sent for evaluation.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Continue working
              </button>
              <button
                onClick={() => finalize(false)}
                disabled={submitExam.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitExam.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Submit and finish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Question input renderers ────────────────────────────────────────────────

function QuestionInput({
  question,
  answer,
  onChange,
}: {
  question: ExamDeliveryQuestion;
  answer: any;
  onChange: (value: any) => void;
}) {
  const type = question.question_type;

  if (type === 'mcq' || type === 'true_false') {
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">Select one option</legend>
        {question.options.map((option) => {
          const valueToStore = type === 'true_false' ? (option.body || option.label).toLowerCase() : option.label;
          const checked = answer?.selected === valueToStore;
          return (
            <label
              key={option.label}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name={question.id}
                className="mt-0.5 h-4 w-4 text-blue-600"
                checked={checked}
                onChange={() => onChange({ selected: valueToStore })}
              />
              <span className="text-slate-800">
                <span className="font-semibold text-slate-500 mr-2">{option.label}.</span>
                {option.body}
              </span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  if (type === 'msq') {
    const selected: string[] = Array.isArray(answer?.selected) ? answer.selected : [];
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">Select all that apply</legend>
        {question.options.map((option) => {
          const checked = selected.includes(option.label);
          return (
            <label
              key={option.label}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded text-blue-600"
                checked={checked}
                onChange={() =>
                  onChange({
                    selected: checked
                      ? selected.filter((l) => l !== option.label)
                      : [...selected, option.label],
                  })
                }
              />
              <span className="text-slate-800">
                <span className="font-semibold text-slate-500 mr-2">{option.label}.</span>
                {option.body}
              </span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  if (type === 'numerical') {
    return (
      <div>
        <label htmlFor={`q-${question.id}`} className="block text-xs font-medium text-slate-600 mb-1.5">
          Your answer
        </label>
        <input
          id={`q-${question.id}`}
          type="number"
          inputMode="decimal"
          step="any"
          value={answer?.value ?? ''}
          onChange={(e) => onChange({ value: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
        />
      </div>
    );
  }

  if (type === 'fill_blank') {
    const blanks: string[] = Array.isArray(answer?.blanks) && answer.blanks.length ? answer.blanks : [''];
    return (
      <div className="space-y-2">
        {blanks.map((value, idx) => (
          <div key={idx}>
            <label
              htmlFor={`q-${question.id}-${idx}`}
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Blank {idx + 1}
            </label>
            <input
              id={`q-${question.id}-${idx}`}
              type="text"
              value={value}
              onChange={(e) => {
                const next = [...blanks];
                next[idx] = e.target.value;
                onChange({ blanks: next });
              }}
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ blanks: [...blanks, ''] })}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          Add another blank
        </button>
      </div>
    );
  }

  // short_answer / essay / anything else
  const rows = type === 'essay' ? 10 : 5;
  return (
    <div>
      <label htmlFor={`q-${question.id}`} className="block text-xs font-medium text-slate-600 mb-1.5">
        Your answer
      </label>
      <textarea
        id={`q-${question.id}`}
        rows={rows}
        value={answer?.text || ''}
        onChange={(e) => onChange({ text: e.target.value })}
        className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-600 focus:outline-none"
        placeholder="Type your response…"
      />
    </div>
  );
}

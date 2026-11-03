import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/core/auth/hooks';
import { startDemoSitting } from '../demo';
import { useCourseOfferings } from '@/features/courses/api';
import { useQuestionBanks } from '@/features/question-banks/api';
import { useCreateExam, useExams, useGenerateExamQuestionsAfterCreate } from '../api';
import { RandomPaperFields } from './RandomPaperFields';
import {
  EMPTY_RANDOM_PAPER,
  toGeneratePayload,
  type RandomPaperValue,
} from '../random-paper';
import {
  INTEGRITY_DWELL_MS,
  SENSITIVITY_LABEL,
} from '../types';
import type {
  ExamCreateInput,
  ExamIntegritySensitivity,
  ExamStatus,
  ExamType,
  ExamWarningPolicy,
} from '../types';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  HelpCircle,
  Plus,
  ShieldAlert,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';

/** Format a Date for a datetime-local input, honouring the local timezone. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExamsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isFacultyOrAdmin = user && ['admin', 'super_admin', 'faculty', 'exam_controller'].some((r) => user.roles.includes(r));

  // The demo router is mounted only in a DEBUG backend (see main.py); a
  // production build must not offer a button that would answer 404. `DEV` is
  // the Vite build-time flag, so the production bundle carries neither the
  // control nor the illusion that the endpoint exists.
  const demoAvailable = import.meta.env.DEV;

  // One-click demo: provisions/uses only purpose-built demo objects, signs the
  // caller in as the dedicated demo student, and starts a clean sitting. The
  // launcher performs a full navigation so the previous identity never lingers
  // in this tab's auth or query state.
  const [isDemoStarting, setIsDemoStarting] = useState(false);
  const startDemoExam = async () => {
    // The button is disabled while starting, but React's state update is not
    // synchronous: a double click in the same tick must not mint two sessions.
    if (isDemoStarting) return;
    setIsDemoStarting(true);
    setListError(null);
    try {
      await startDemoSitting();
    } catch (err: any) {
      setListError(
        err.response?.data?.error?.message ||
          err.message ||
          'Could not start the demo examination. Please try again.'
      );
      setIsDemoStarting(false);
    }
  };

  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data: exams, isLoading } = useExams(undefined, statusFilter || undefined);
  const { data: offerings } = useCourseOfferings();

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [offeringId, setOfferingId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [examType, setExamType] = useState<ExamType>('quiz');
  const [totalMarks, setTotalMarks] = useState<number>(100);
  const [passingMarks, setPassingMarks] = useState<number>(40);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [startWindow, setStartWindow] = useState('');
  const [endWindow, setEndWindow] = useState('');
  const [instructions, setInstructions] = useState('');
  const [proctoringEnabled, setProctoringEnabled] = useState(true);
  const [faceMonitoring, setFaceMonitoring] = useState(true);
  const [maxViolations, setMaxViolations] = useState<number>(10);
  // What reaching the tolerance does. Removal stays the default so a new exam
  // behaves exactly like the ones already on the platform.
  const [warningPolicy, setWarningPolicy] = useState<ExamWarningPolicy>('remove');
  // On-device device check is offered on by default for new assessments, because
  // a lecturer scheduling a proctored paper expects it; existing exams keep the
  // behaviour they were authored with, since the server default is off.
  const [deviceDetection, setDeviceDetection] = useState(true);
  const [obstructionSeconds, setObstructionSeconds] = useState(4);
  // The per-exam integrity profile (ADR-029). `standard` is what every paper
  // authored before the setting existed already ran at, so the default never
  // tightens an assessment silently; hand and voice default off because each
  // analyses more of the candidate's own room than a face count does.
  const [integritySensitivity, setIntegritySensitivity] =
    useState<ExamIntegritySensitivity>('standard');
  const [handMonitoring, setHandMonitoring] = useState(false);
  const [audioMonitoring, setAudioMonitoring] = useState(false);
  // Off by default (ADR-039): the pixel heuristic false-fired on still faces and
  // spent warnings the candidate had not earned. It stays available as an
  // explicit experiment; the voice check is the supported talking signal.
  const [mouthMonitoring, setMouthMonitoring] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [showResultsImmediately, setShowResultsImmediately] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Question paper source: hand-pick later, or draw a random paper from the
  // syllabus scope as part of scheduling.
  const [questionSource, setQuestionSource] = useState<'manual' | 'random'>('manual');
  const [randomValue, setRandomValue] = useState<RandomPaperValue>(EMPTY_RANDOM_PAPER);

  // ── Scheduling ergonomics: presets, auto end-window, live summary ──────
  // Typing two raw datetime pickers is error-prone; the end window defaults to
  // start + duration (extended by 15 minutes of grace for late joiners), can
  // be nudged with one-tap presets, and always shows the resolved window in
  // plain words before scheduling.
  const applyWindowPreset = (days: number) => {
    const start = new Date();
    start.setMinutes(start.getMinutes() + 5); // just ahead: schedulers get time to inform the room
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + Math.max(15, durationMinutes) * 60_000 + 15 * 60_000 + days * 86_400_000);
    setStartWindow(toLocalInput(start));
    setEndWindow(toLocalInput(end));
  };

  const windowSummary = useMemo(() => {
    if (!startWindow || !endWindow) return null;
    const start = new Date(startWindow);
    const end = new Date(endWindow);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end <= start) {
      return { ok: false as const, text: 'End window must come after the start window.' };
    }
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    return {
      ok: true as const,
      text: `Open ${start.toLocaleString()} → ${end.toLocaleString()} (${hours < 1 ? `${Math.round(hours * 60)} min` : `${Math.round(hours * 10) / 10} h`} availability).` ,
    };
  }, [startWindow, endWindow]);

  const selectedOffering = offerings?.find((o) => o.id === offeringId);
  // The list only feeds the staff-only scheduling form, so a candidate's view
  // must not request it: the endpoint is correctly forbidden to them and the
  // failed request would surface as a console error on the exams page.
  const { data: syllabusBanks } = useQuestionBanks(
    selectedOffering?.course_id ? { course_id: selectedOffering.course_id } : undefined,
    { enabled: Boolean(isFacultyOrAdmin) }
  );

  const createExamMutation = useCreateExam();
  const generateMutation = useGenerateExamQuestionsAfterCreate();

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!offeringId) {
      setFormError('Please select a course offering.');
      return;
    }
    if (!title.trim()) {
      setFormError('Exam title is required.');
      return;
    }
    if (!startWindow || !endWindow) {
      setFormError('Please configure both start and end availability windows.');
      return;
    }
    if (questionSource === 'random' && randomValue.questionCount < 0) {
      setFormError('Question count must be zero (all matching) or a positive number.');
      return;
    }

    const payload: ExamCreateInput = {
      course_offering_id: offeringId,
      title: title.trim(),
      description: description.trim() || undefined,
      exam_type: examType,
      total_marks: Number(totalMarks),
      passing_marks: passingMarks ? Number(passingMarks) : undefined,
      duration_minutes: Number(durationMinutes),
      start_window: new Date(startWindow).toISOString(),
      end_window: new Date(endWindow).toISOString(),
      instructions: instructions.trim() || undefined,
      config: {
        proctoring_enabled: proctoringEnabled,
        max_violations: Number(maxViolations) || 10,
        warning_policy: warningPolicy,
        device_detection_enabled: deviceDetection,
        obstruction_threshold_seconds: Number(obstructionSeconds) || 4,
        integrity_sensitivity: integritySensitivity,
        face_monitoring_enabled: faceMonitoring,
        hand_monitoring_enabled: handMonitoring,
        audio_monitoring_enabled: audioMonitoring,
        mouth_monitoring_enabled: mouthMonitoring,
        shuffle_questions: shuffleQuestions,
        show_results_immediately: showResultsImmediately,
        max_attempts: 1,
      },
      status: 'scheduled',
    };

    try {
      const created = await createExamMutation.mutateAsync(payload);
      if (questionSource === 'random') {
        try {
          await generateMutation.mutateAsync({
            examId: created.id,
            payload: toGeneratePayload(randomValue, true),
          });
        } catch (genErr: any) {
          // The exam itself exists now; never let the paper draw hide that.
          setListError(
            `Exam “${payload.title}” was scheduled, but its random paper could not be drawn: ${
              genErr?.response?.data?.error?.message || genErr?.message || 'unknown error'
            } Open the examination and use “Randomise from syllabus”.`
          );
          setIsCreateOpen(false);
          setTitle('');
          setDescription('');
          return;
        }
      }
      setIsCreateOpen(false);
      setTitle('');
      setDescription('');
      setRandomValue(EMPTY_RANDOM_PAPER);
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || err.message || 'Failed to schedule exam.');
    }
  };

  const getStatusBadge = (status: ExamStatus) => {
    switch (status) {
      case 'published':
        return <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Results Published</span>;
      case 'graded':
        return <span className="rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">Graded</span>;
      case 'live':
        return <span className="rounded-md bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white animate-pulse">Live</span>;
      case 'scheduled':
        return <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">Scheduled</span>;
      default:
        return <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 capitalize">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {listError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">{listError}</div>
          <button
            onClick={() => setListError(null)}
            aria-label="Dismiss"
            className="rounded p-1 text-rose-500 hover:bg-rose-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {/* Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Examinations & Assessments</h1>
              <p className="text-xs text-slate-500">
                Institutional examination management, automated grading, and proctoring review
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-hidden"
          >
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="graded">Graded</option>
            <option value="published">Results Published</option>
          </select>

          {isFacultyOrAdmin && (          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs transition-colors shrink-0"
          >
              <Plus className="h-4 w-4" /> Schedule Exam
            </button>
          )}
          {demoAvailable && (
            <button
              onClick={startDemoExam}
              disabled={isDemoStarting}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 shadow-xs transition-colors shrink-0 disabled:opacity-50"
              title="Signs you into the demo student account and opens a ready practice paper"
            >
              {isDemoStarting ? 'Preparing…' : (
                <>
                  <Sparkles className="h-4 w-4" /> Take demo exam
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Exams Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading examinations...</div>
      ) : !exams || exams.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center bg-white">
          <HelpCircle className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No examinations found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {isFacultyOrAdmin
              ? 'Schedule your first quiz, midterm, or final examination for your course.'
              : 'You have no scheduled examinations at this time.'}
          </p>
          {isFacultyOrAdmin && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs"
            >
              <Plus className="h-4 w-4" /> Schedule Exam
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {exams.map((exam) => {
            const now = new Date();
            const start = new Date(exam.start_window);
            const end = new Date(exam.end_window);
            const isWindowOpen = now >= start && now <= end;

            const attemptStatus = (exam.latest_attempt_status || '').toString();
            const concludedStatuses = new Set(['submitted', 'auto_submitted', 'graded']);
            const lockedStatuses = new Set(['locked_violation']);
            const hasAttempt = attemptStatus && attemptStatus !== 'null';

            const maxAttempts = Math.max(1, Number(exam.config?.max_attempts ?? 1));
            const attemptsUsed = Number(exam.attempts_used ?? 0);
            const retakeAllowed = attemptsUsed < maxAttempts;

            const studentAction = (() => {
              const takeExamAction = {
                label: attemptsUsed > 0 ? 'Retake Exam' : 'Take Exam',
                onClick: () => navigate(`/exams/${exam.id}/take`),
                className:
                  'w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs transition-colors',
                icon: <Clock className="h-4 w-4" />,
              };
              const viewResultsAction = {
                label: 'View Results',
                onClick: () => navigate(`/exams/${exam.id}/results`),
                className:
                  'w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors',
                icon: <CheckCircle2 className="h-4 w-4" />,
              };

              if (lockedStatuses.has(attemptStatus)) {
                // The locked candidate needs the red instructions screen, not
                // results: it explains who reopens the attempt and re-checks
                // for them automatically.
                return {
                  label: 'Locked — Contact Lecturer',
                  onClick: () => navigate(`/exams/${exam.id}/take`),
                  className:
                    'w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors',
                  icon: <HelpCircle className="h-4 w-4" />,
                };
              }
              if (attemptStatus === 'in_progress') {
                return {
                  label: 'Continue Attempt',
                  onClick: () => navigate(`/exams/${exam.id}/take`),
                  className:
                    'w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 shadow-xs transition-colors',
                  icon: <Clock className="h-4 w-4" />,
                };
              }
              if (hasAttempt && concludedStatuses.has(attemptStatus)) {
                // "Take Exam" means *a permitted attempt*, not merely an open
                // window: a concluded attempt stays a results link unless the
                // examination still allows another sitting.
                if (retakeAllowed && isWindowOpen) return takeExamAction;
                return viewResultsAction;
              }
              if (isWindowOpen) return takeExamAction;
              return {
                label: (now < start ? 'Testing window not open yet' : 'Testing window closed') as string,
                onClick: undefined,
                className: 'text-xs text-slate-400 italic',
                icon: null as null,
              };
            })();

            return (
              <div
                key={exam.id}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 uppercase">
                      {exam.exam_type}
                    </span>
                    {getStatusBadge(exam.status)}
                  </div>

                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {exam.title}
                  </h3>

                  {exam.course_title && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-700 font-medium mt-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{exam.course_code ? `${exam.course_code} — ` : ''}{exam.course_title}</span>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 line-clamp-2 my-3 h-8">
                    {exam.description || 'No description provided.'}
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-4">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>{exam.duration_minutes} mins</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-slate-400" />
                      <span>{exam.total_marks} marks</span>
                    </div>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-500 mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      <span>Opens: {start.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      <span>Closes: {end.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {isFacultyOrAdmin ? (
                    <>
                      <span className="text-xs font-medium text-slate-400">
                        {exam.questions_count} questions
                      </span>
                      <button
                        onClick={() => navigate(`/exams/${exam.id}`)}
                        className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition-colors"
                      >
                        Manage Exam
                      </button>
                    </>
                  ) : (
                    <>
                      {studentAction.icon && (
                        <span className="shrink-0">{studentAction.icon}</span>
                      )}
                      {studentAction.onClick ? (
                        <button
                          onClick={studentAction.onClick}
                          className={studentAction.className}
                        >
                          {studentAction.label}
                        </button>
                      ) : (
                        <span className={studentAction.className}>
                          {studentAction.label}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule Exam Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl my-8 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">Schedule Examination</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Course Offering <span className="text-rose-500">*</span>
                </label>
                <select
                  value={offeringId}
                  onChange={(e) => setOfferingId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  required
                >
                  <option value="">Select course offering...</option>
                  {offerings?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.course_code ? `${o.course_code} — ` : ''}{o.course_title || 'Course'} ({o.section})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Exam Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Midterm Examination 1"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Exam Type
                  </label>
                  <select
                    value={examType}
                    onChange={(e) => setExamType(e.target.value as ExamType)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="quiz">Quiz</option>
                    <option value="midterm">Midterm Exam</option>
                    <option value="final">Final Exam</option>
                    <option value="practice">Practice Assessment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Total Marks
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Passing Marks
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={passingMarks}
                    onChange={(e) => setPassingMarks(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Start Window <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={startWindow}
                    onChange={(e) => setStartWindow(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    End Window <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={endWindow}
                    onChange={(e) => setEndWindow(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              {/* Quick presets + derived summary. Enter inside the form still
                  submits; this makes the primary action discoverable too. */}
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Quick windows
                  </span>
                  <button
                    type="button"
                    onClick={() => applyWindowPreset(0)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Right away
                  </button>
                  <button
                    type="button"
                    onClick={() => applyWindowPreset(1)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => applyWindowPreset(7)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Next week
                  </button>
                  <span className="ml-auto text-[11px] text-slate-400">
                    End window defaults to start + duration + 15 min grace.
                  </span>
                </div>
                {windowSummary && (
                  <p
                    className={`mt-2 text-[11px] font-medium ${
                      windowSummary.ok ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {windowSummary.text}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Instructions / Exam Notes
                </label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Scientific calculators allowed. No external tabs."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Question paper source */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Question paper
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs ${
                      questionSource === 'manual'
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="question-source"
                      className="mt-0.5 h-4 w-4 text-blue-600"
                      checked={questionSource === 'manual'}
                      onChange={() => setQuestionSource('manual')}
                    />
                    <span>
                      <span className="block font-semibold text-slate-800">Pick questions myself</span>
                      <span className="block text-slate-500">
                        Schedule now, then choose every question explicitly from a bank.
                      </span>
                    </span>
                  </label>
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs ${
                      questionSource === 'random'
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="question-source"
                      className="mt-0.5 h-4 w-4 text-blue-600"
                      checked={questionSource === 'random'}
                      onChange={() => setQuestionSource('random')}
                    />
                    <span>
                      <span className="block font-semibold text-slate-800">
                        <span className="inline-flex items-center gap-1">
                          <Shuffle className="h-3.5 w-3.5" aria-hidden="true" /> Randomise from
                          syllabus
                        </span>
                      </span>
                      <span className="block text-slate-500">
                        Select the syllabus scope and the server draws a shuffled paper for you.
                      </span>
                    </span>
                  </label>
                </div>
                {questionSource === 'random' && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <RandomPaperFields
                      banks={syllabusBanks || []}
                      value={randomValue}
                      onChange={setRandomValue}
                      idPrefix="schedule"
                    />
                  </div>
                )}
              </div>

              {/* Proctoring & Security Toggles */}
              <div className="space-y-2 rounded-xl bg-slate-50 p-4 border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-amber-600" /> Integrity Configuration
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={proctoringEnabled}
                      onChange={(e) => setProctoringEnabled(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Observable Proctoring</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Shuffle Questions</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={showResultsImmediately}
                      onChange={(e) => setShowResultsImmediately(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Instant Result Release</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={deviceDetection}
                      onChange={(e) => setDeviceDetection(e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      On-device device check (phones, earbuds, watches)
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Analyses the candidate’s camera picture inside their own browser. A
                        confirmed device raises a warning the candidate sees and spends one of
                        their warnings; it never fails them by itself, and the observation is
                        recorded for your review. A watch is read from a close-up of the wrist,
                        so this check also runs the hand landmarker; it does not report hands
                        unless the hand-at-face check below is on.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={faceMonitoring}
                      onChange={(e) => setFaceMonitoring(e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      Face and head-direction check
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Presence, a head turned away and a second face. This is the baseline
                        check on every proctored paper; turning it off is disclosed to the
                        candidate as “camera on, no presence check”.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={handMonitoring}
                      onChange={(e) => setHandMonitoring(e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      Hand-at-face check
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Catches the pattern of reading from a phone held below the shot or a
                        sheet raised to eye level. It is recorded for your review with its
                        measurement and never counted against the candidate's allowance.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={audioMonitoring}
                      onChange={(e) => setAudioMonitoring(e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      Second-voice check (microphone)
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                      Sees a second person who never enters the frame. Only loudness and shape
                      are measured on the candidate’s own device — <strong>no audio is
                      recorded, stored or transmitted</strong>. A confirmed cue is recorded
                      for your review and never counted against the candidate's allowance.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={mouthMonitoring}
                      onChange={(e) => setMouthMonitoring(e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      Talking / mouth-movement check (experimental — off by default)
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        An opt-in experiment: it measures movement in the camera picture —
                        <strong>no speech is recognised and no audio is captured</strong>. The
                        pixel heuristic can mistake a jaw, a cheek or camera noise for speech,
                        and a misfire would put a wrong observation in front of you, so it is
                        off in the demo and for new papers. The second-voice check is the
                        supported talking signal.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="grid gap-4 pt-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor="max-violations" className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Recorded events tolerated before action
                    </label>
                    <input
                      id="max-violations"
                      type="number"
                      min={1}
                      max={20}
                      value={maxViolations}
                      onChange={(e) => setMaxViolations(Number(e.target.value))}
                      className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Between 1 and 20 events. After the candidate acknowledges a warning,
                      the next cannot be counted for 5 seconds; signals inside that gap are
                      recorded without spending another warning.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="obstruction-seconds" className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Report camera obstruction after (seconds)
                    </label>
                    <input
                      id="obstruction-seconds"
                      type="number"
                      min={2}
                      max={30}
                      value={obstructionSeconds}
                      onChange={(e) => setObstructionSeconds(Number(e.target.value))}
                      className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Continuous stillness before the candidate is warned. Between 2 and 30
                      seconds; disclosed to them before they start.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="integrity-sensitivity"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Integrity sensitivity
                    </label>
                    <select
                      id="integrity-sensitivity"
                      value={integritySensitivity}
                      onChange={(e) =>
                        setIntegritySensitivity(e.target.value as ExamIntegritySensitivity)
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
                    >
                      {(['relaxed', 'standard', 'strict'] as ExamIntegritySensitivity[]).map(
                        (tier) => (
                          <option key={tier} value={tier}>
                            {SENSITIVITY_LABEL[tier]}
                          </option>
                        )
                      )}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {SENSITIVITY_LABEL[integritySensitivity]} — head turned away for{' '}
                      {INTEGRITY_DWELL_MS[integritySensitivity].turn / 1000}s, out of frame for{' '}
                      {INTEGRITY_DWELL_MS[integritySensitivity].absence / 1000}s, a hand at the
                      face for {INTEGRITY_DWELL_MS[integritySensitivity].hand / 1000}s, a second
                      voice for {INTEGRITY_DWELL_MS[integritySensitivity].voice / 1000}s. These
                      exact figures are shown to the candidate before they start.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="warning-policy" className="block text-[11px] font-semibold text-slate-600 mb-1">
                      When the candidate reaches that limit
                    </label>
                    <select
                      id="warning-policy"
                      value={warningPolicy}
                      onChange={(e) => setWarningPolicy(e.target.value as ExamWarningPolicy)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
                    >
                      <option value="remove">Remove them until I reopen the attempt</option>
                      <option value="review">Flag the attempt for my review; they keep working</option>
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {warningPolicy === 'remove'
                        ? 'Reaching the limit locks the candidate out; only you can reopen the attempt. Disclosed to them before they start.'
                        : 'Reaching the limit flags the attempt in your review queue. The candidate keeps working and is never failed automatically.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    createExamMutation.isPending ||
                    (questionSource === 'random' && generateMutation.isPending) ||
                    !(startWindow && endWindow && title.trim() && offeringId)
                  }
                  title="Press Enter anywhere in the form to schedule"
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createExamMutation.isPending ||
                  (questionSource === 'random' && generateMutation.isPending)
                    ? 'Scheduling...'
                    : 'Schedule Exam ⏎'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

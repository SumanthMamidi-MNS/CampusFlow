import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExamAnalyticsView } from '@/features/analytics/components/ExamAnalyticsView';
import { useQuestionBanks, useQuestions } from '@/features/question-banks/api';
import {
  useAddQuestionsToExam,
  useExam,
  useExamAttempts,
  useGradeExamResponse,
  useProctoringTimeline,
  usePublishExamResults,
  useRemoveQuestionFromExam,
  useUnlockExamAttempt,
} from '../api';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  HelpCircle,
  KeyRound,
  Lock,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';

export function ExamDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const examId = id || '';

  const { data: exam, isLoading: isExamLoading } = useExam(examId);
  const { data: attempts } = useExamAttempts(examId);

  const [activeTab, setActiveTab] = useState<'questions' | 'grading' | 'live-proctoring' | 'analytics'>('questions');

  // Live Invigilator Hub & Multi-Candidate Webcam Grid State
  const [proctorFilter, setProctorFilter] = useState<'all' | 'normal' | 'flagged' | 'locked'>('all');
  const [inspectingCandidate, setInspectingCandidate] = useState<any | null>(null);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('Attention all candidates: Please maintain strict centered gaze on the examination canvas. Mobile phones are strictly prohibited.');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [issuedWarningCandidate, setIssuedWarningCandidate] = useState<string | null>(null);

  // Add questions modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const { data: questionBanks } = useQuestionBanks();
  const { data: bankQuestions } = useQuestions(selectedBankId);

  // Grading modal state
  const [gradingAttemptId, setGradingAttemptId] = useState<string | null>(null);
  const [manualMarks, setManualMarks] = useState<Record<string, number>>({});
  const [manualFeedback, setManualFeedback] = useState<Record<string, string>>({});
  const [auditAttemptId, setAuditAttemptId] = useState<string | null>(null);

  const addQuestionsMutation = useAddQuestionsToExam(examId);
  const removeQuestionMutation = useRemoveQuestionFromExam(examId);
  const publishResultsMutation = usePublishExamResults(examId);
  const gradeResponseMutation = useGradeExamResponse(examId);
  const unlockAttemptMutation = useUnlockExamAttempt(examId);

  const handleUnlockAttempt = async (attemptId: string) => {
    if (window.confirm('Authorize student to resume the examination? This will reset the integrity breach status and permit re-entry.')) {
      try {
        await unlockAttemptMutation.mutateAsync({
          attemptId,
          reason: 'Faculty authorized re-entry after proctoring review',
          resetViolations: true,
        });
        alert('Student attempt has been successfully unlocked and authorized to resume.');
      } catch (err: any) {
        alert(err.response?.data?.error?.message || err.message || 'Failed to unlock exam attempt.');
      }
    }
  };

  if (isExamLoading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Loading examination...</div>;
  }

  if (!exam) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">Examination not found</h2>
        <button
          onClick={() => navigate('/exams')}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Exams
        </button>
      </div>
    );
  }

  const handleToggleSelectQuestion = (qId: string) => {
    if (selectedQIds.includes(qId)) {
      setSelectedQIds(selectedQIds.filter((id) => id !== qId));
    } else {
      setSelectedQIds([...selectedQIds, qId]);
    }
  };

  const handleAddSelectedQuestions = async () => {
    if (selectedQIds.length === 0) return;
    const questionsPayload = selectedQIds.map((qId) => ({
      question_id: qId,
    }));
    await addQuestionsMutation.mutateAsync(questionsPayload);
    setIsAddOpen(false);
    setSelectedQIds([]);
  };

  const handleRemoveQuestion = async (eqId: string) => {
    if (window.confirm('Remove this question from the examination?')) {
      await removeQuestionMutation.mutateAsync(eqId);
    }
  };

  const handlePublish = async () => {
    if (window.confirm('Are you sure you want to publish the results? All enrolled students will be notified.')) {
      await publishResultsMutation.mutateAsync();
    }
  };

  const handleSaveGrade = async (responseId: string) => {
    const marks = manualMarks[responseId];
    if (marks === undefined || marks < 0) {
      alert('Please enter valid marks.');
      return;
    }
    await gradeResponseMutation.mutateAsync({
      responseId,
      marksAwarded: marks,
      feedback: manualFeedback[responseId] || undefined,
    });
    alert('Grade saved successfully.');
  };

  const activeAttemptForGrading = attempts?.find((a) => a.id === gradingAttemptId);

  // Candidate data for Live Invigilator Hub & Multi-Candidate Webcam Grid
  const primaryAttempt = attempts?.[0];
  const isPrimaryAttemptLocked =
    primaryAttempt?.status === 'locked_violation' ||
    localStorage.getItem(`exam_locked_${examId}`) === 'true';
  const primaryViolations =
    Number(localStorage.getItem(`exam_violations_${primaryAttempt?.id || ''}`) || '') ||
    primaryAttempt?.proctor_violations_count ||
    (isPrimaryAttemptLocked ? 6 : 0);

  const activeCandidates = [
    {
      id: 'cand-alex-rivera',
      attemptId: primaryAttempt?.id || 'demo-attempt-alex-rivera',
      name: primaryAttempt?.student_name || 'Alex Rivera',
      email: primaryAttempt?.student_email || 'student1@campusflow.edu',
      rollNumber: 'CS2026-081',
      station: 'Station A-01',
      ipAddress: '192.168.1.104',
      browser: 'Chrome 128 (Lockdown)',
      questionsAnswered: 4,
      totalQuestions: exam.questions_count || 5,
      status: isPrimaryAttemptLocked ? 'locked' : primaryViolations > 0 ? 'warning' : 'normal',
      violationsCount: primaryViolations,
      isPhoneLocked: isPrimaryAttemptLocked && (localStorage.getItem(`exam_violations_${primaryAttempt?.id || ''}`) === '6' || primaryViolations >= 6),
      lastEvent: isPrimaryAttemptLocked
        ? 'Session Locked: Integrity Violations Exceeded'
        : primaryViolations > 0
        ? `Integrity Warning [${primaryViolations}/6] Flagged`
        : 'Gaze Centered (Optimal Focus)',
      gazeAngle: isPrimaryAttemptLocked ? 'OFFLINE (LOCKED)' : primaryViolations > 0 ? '+14.2° Deflection' : '0.0° Centered',
      audioDb: isPrimaryAttemptLocked ? -60 : -38,
      avatarSeed: 'alex',
    },
    {
      id: 'cand-elena-rostova',
      attemptId: 'demo-attempt-elena',
      name: 'Elena Rostova',
      email: 'elena.rostova@campusflow.edu',
      rollNumber: 'CS2026-042',
      station: 'Station A-02',
      ipAddress: '192.168.1.105',
      browser: 'Chrome 128 (Lockdown)',
      questionsAnswered: 3,
      totalQuestions: exam.questions_count || 5,
      status: 'normal',
      violationsCount: 0,
      isPhoneLocked: false,
      lastEvent: 'Gaze Centered (Optimal)',
      gazeAngle: '-0.2° Centered',
      audioDb: -42,
      avatarSeed: 'elena',
    },
    {
      id: 'cand-priya-sharma',
      attemptId: 'demo-attempt-priya',
      name: 'Priya Sharma',
      email: 'priya.sharma@campusflow.edu',
      rollNumber: 'CS2026-049',
      station: 'Station A-03',
      ipAddress: '192.168.1.108',
      browser: 'Edge 128 (Lockdown)',
      questionsAnswered: 4,
      totalQuestions: exam.questions_count || 5,
      status: 'warning',
      violationsCount: 2,
      isPhoneLocked: false,
      lastEvent: 'Gaze Anomaly: Side Viewing (Right)',
      gazeAngle: '+24.5° Right Deflection',
      audioDb: -32,
      avatarSeed: 'priya',
    },
    {
      id: 'cand-marcus-vance',
      attemptId: 'demo-attempt-marcus',
      name: 'Marcus Vance',
      email: 'marcus.vance@campusflow.edu',
      rollNumber: 'CS2026-045',
      station: 'Station A-04',
      ipAddress: '192.168.1.112',
      browser: 'Chrome 128 (Lockdown)',
      questionsAnswered: 5,
      totalQuestions: exam.questions_count || 5,
      status: 'normal',
      violationsCount: 0,
      isPhoneLocked: false,
      lastEvent: 'Gaze Centered (Optimal)',
      gazeAngle: '+0.1° Centered',
      audioDb: -40,
      avatarSeed: 'marcus',
    },
    {
      id: 'cand-jordan-lee',
      attemptId: 'demo-attempt-jordan',
      name: 'Jordan Lee',
      email: 'jordan.lee@campusflow.edu',
      rollNumber: 'CS2026-052',
      station: 'Station B-01',
      ipAddress: '192.168.1.115',
      browser: 'Chrome 128 (Lockdown)',
      questionsAnswered: 2,
      totalQuestions: exam.questions_count || 5,
      status: 'normal',
      violationsCount: 0,
      isPhoneLocked: false,
      lastEvent: 'Gaze Centered (Optimal)',
      gazeAngle: '0.0° Centered',
      audioDb: -45,
      avatarSeed: 'jordan',
    },
    {
      id: 'cand-sophia-taylor',
      attemptId: 'demo-attempt-sophia',
      name: 'Sophia Taylor',
      email: 'sophia.taylor@campusflow.edu',
      rollNumber: 'CS2026-058',
      station: 'Station B-02',
      ipAddress: '192.168.1.120',
      browser: 'Chrome 128 (Lockdown)',
      questionsAnswered: 3,
      totalQuestions: exam.questions_count || 5,
      status: 'warning',
      violationsCount: 1,
      isPhoneLocked: false,
      lastEvent: 'Downward Gaze Anomaly: Desk viewing',
      gazeAngle: '-18.2° Downward Tilt',
      audioDb: -36,
      avatarSeed: 'sophia',
    },
    {
      id: 'cand-lucas-gomez',
      attemptId: 'demo-attempt-lucas',
      name: 'Lucas Gomez',
      email: 'lucas.gomez@campusflow.edu',
      rollNumber: 'CS2026-061',
      station: 'Station B-03',
      ipAddress: '192.168.1.122',
      browser: 'Firefox 130 (Lockdown)',
      questionsAnswered: 4,
      totalQuestions: exam.questions_count || 5,
      status: 'normal',
      violationsCount: 0,
      isPhoneLocked: false,
      lastEvent: 'Gaze Centered (Optimal)',
      gazeAngle: '+0.3° Centered',
      audioDb: -41,
      avatarSeed: 'lucas',
    },
    {
      id: 'cand-daniel-kim',
      attemptId: 'demo-attempt-daniel',
      name: 'Daniel Kim',
      email: 'daniel.kim@campusflow.edu',
      rollNumber: 'CS2026-067',
      station: 'Station B-04',
      ipAddress: '192.168.1.129',
      browser: 'Chrome 128 (Lockdown)',
      questionsAnswered: 4,
      totalQuestions: exam.questions_count || 5,
      status: 'normal',
      violationsCount: 0,
      isPhoneLocked: false,
      lastEvent: 'Gaze Centered (Optimal)',
      gazeAngle: '-0.1° Centered',
      audioDb: -44,
      avatarSeed: 'daniel',
    },
  ];

  const filteredCandidates = activeCandidates.filter((c) => {
    if (proctorFilter === 'normal') return c.status === 'normal';
    if (proctorFilter === 'flagged') return c.status === 'warning';
    if (proctorFilter === 'locked') return c.status === 'locked';
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Back button */}
      <div>
        <button
          onClick={() => navigate('/exams')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Examinations
        </button>
      </div>

      {/* Exam Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 uppercase">
              {exam.exam_type}
            </span>
            {exam.course_title && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                <BookOpen className="h-3.5 w-3.5" /> {exam.course_title}
              </span>
            )}
            <span
              className={`rounded-md px-2.5 py-0.5 text-xs font-semibold uppercase ${
                exam.status === 'published'
                  ? 'bg-emerald-100 text-emerald-800'
                  : exam.status === 'graded'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-indigo-50 text-indigo-700'
              }`}
            >
              {exam.status}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{exam.title}</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            {exam.description || 'Secure examination definition with automated timing and grading.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {exam.status !== 'published' && (
            <button
              onClick={handlePublish}
              disabled={publishResultsMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Publish Results
            </button>
          )}
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" /> Add from Question Bank
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</p>
          <p className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-blue-500" /> {exam.duration_minutes} mins
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Marks</p>
          <p className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-amber-500" /> {exam.total_marks} pts
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Questions</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{exam.questions_count}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Student Attempts</p>
          <p className="text-xl font-bold text-indigo-600 mt-1 flex items-center gap-1.5">
            <Users className="h-4 w-4" /> {attempts?.length || 0}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('questions')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'questions'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Exam Questions ({exam.questions.length})
        </button>
        <button
          onClick={() => setActiveTab('grading')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'grading'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Student Submissions & Proctoring ({attempts?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('live-proctoring')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'live-proctoring'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          <Video className="h-4 w-4 text-rose-600" />
          <span>Live Invigilator Hub & Webcams</span>
          <span className="rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5">
            LIVE
          </span>
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'analytics'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Analytics & Performance
        </button>
      </div>


      {/* Tab Content: Questions */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          {exam.questions.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center bg-white">
              <HelpCircle className="mx-auto h-10 w-10 text-slate-300 mb-3" />
              <h3 className="text-base font-semibold text-slate-800">No questions added yet</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Populate this exam by pulling pre-authored items from your Question Banks.
              </p>
              <button
                onClick={() => setIsAddOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Add from Question Bank
              </button>
            </div>
          ) : (
            exam.questions.map((q, idx) => (
              <div
                key={q.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-400">Q{idx + 1}.</span>
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 uppercase">
                      {q.question_type.replace('_', ' ')}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      +{q.marks} {q.negative_marks > 0 ? `(-${q.negative_marks})` : ''} marks
                    </span>
                  </div>

                  <button
                    onClick={() => handleRemoveQuestion(q.id)}
                    className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    title="Remove Question from Exam"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-sm font-medium text-slate-900 py-3 whitespace-pre-wrap">{q.body}</p>

                {q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {q.options.map((opt) => (
                      <div
                        key={opt.label}
                        className={`flex items-start gap-2 rounded-xl border p-2 text-xs ${
                          opt.is_correct
                            ? 'border-emerald-300 bg-emerald-50/60 font-medium text-emerald-900'
                            : 'border-slate-200 bg-slate-50/50 text-slate-700'
                        }`}
                      >
                        <span
                          className={`h-5 w-5 rounded-md flex items-center justify-center font-bold text-[11px] shrink-0 ${
                            opt.is_correct ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span className="flex-1 break-words">{opt.body}</span>
                        {opt.is_correct && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content: Grading */}
      {activeTab === 'grading' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          {!attempts || attempts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              No students have attempted or submitted this examination yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase font-semibold">
                  <th className="p-3 pl-5">Student</th>
                  <th className="p-3">Started</th>
                  <th className="p-3">Submitted</th>
                  <th className="p-3">Score</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Proctoring Log</th>
                  <th className="p-3 pr-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attempts.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50/80">
                    <td className="p-3 pl-5">
                      <p className="font-semibold text-slate-900">{att.student_name || 'Student'}</p>
                      <p className="text-[11px] text-slate-400">{att.student_email}</p>
                    </td>
                    <td className="p-3 text-slate-600">
                      {new Date(att.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-slate-600">
                      {att.submitted_at
                        ? new Date(att.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'In Progress'}
                    </td>
                    <td className="p-3">
                      {att.total_score !== null ? (
                        <div>
                          <span className="font-bold text-slate-900">{att.total_score}</span>
                          <span className="text-slate-400"> / {exam.total_marks}</span>
                          <span className="text-[11px] text-emerald-600 ml-1.5 font-semibold">
                            ({att.percentage}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not graded</span>
                      )}
                    </td>
                    <td className="p-3">
                      {att.status === 'locked_violation' || att.proctor_violations_count >= 6 ? (
                        <span className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-300">
                          LOCKED (6/6 BREACHES)
                        </span>
                      ) : (
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${
                            att.status === 'graded'
                              ? 'bg-emerald-100 text-emerald-800'
                              : att.status === 'submitted'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {att.status.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {att.proctor_violations_count > 0 ? (
                        <button
                          onClick={() => setAuditAttemptId(att.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                            att.proctor_violations_count >= 6 || att.status === 'locked_violation'
                              ? 'bg-rose-100 text-rose-800 hover:bg-rose-200 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          }`}
                          title="Click to view full proctoring violation timeline"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>{att.proctor_violations_count} breaches</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => setAuditAttemptId(att.id)}
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium text-[11px] cursor-pointer bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100"
                          title="Click to view proctoring timeline"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Integrity Audit</span>
                        </button>
                      )}
                    </td>
                    <td className="p-3 pr-5 text-right space-x-2">
                      {(att.status === 'locked_violation' || att.proctor_violations_count >= 6) && (
                        <button
                          onClick={() => handleUnlockAttempt(att.id)}
                          disabled={unlockAttemptMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs"
                          title="Authorize candidate to resume examination"
                        >
                          <KeyRound className="h-3 w-3" />
                          <span>Authorize Re-Entry</span>
                        </button>
                      )}
                      <button
                        onClick={() => setGradingAttemptId(att.id)}
                        className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Review & Grade
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab Content: Live Invigilator Hub & Multi-Candidate Webcam Grid ── */}
      {activeTab === 'live-proctoring' && (
        <div className="space-y-6">
          {/* Invigilator Hub Header Bar */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-md">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Live Invigilator Hub • Real-Time AI Proctor Stream
                  </span>
                </div>
                <h2 className="text-xl font-bold tracking-tight">Active Candidate Video Monitoring Wall</h2>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                  Simultaneous 1080p encrypted video feeds with automated gaze telemetry, facial landmark mesh, and zero-tolerance prohibited device detection.
                </p>
              </div>

              {/* Hub Quick Actions */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsBroadcastOpen(true);
                    setBroadcastSent(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors"
                >
                  <Radio className="h-4 w-4" /> Broadcast Announcement
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors"
                  title="Refresh Video Feeds"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Sync Streams
                </button>
              </div>
            </div>

            {/* Hub Metrics & Filter Ribbon */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Filter:</span>
                {(
                  [
                    { id: 'all', label: 'All Candidates', count: activeCandidates.length },
                    { id: 'normal', label: 'Normal & Centered', count: activeCandidates.filter((c) => c.status === 'normal').length },
                    { id: 'flagged', label: 'Flagged / Warnings', count: activeCandidates.filter((c) => c.status === 'warning').length },
                    { id: 'locked', label: 'Locked Sessions', count: activeCandidates.filter((c) => c.status === 'locked').length },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setProctorFilter(f.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                      proctorFilter === f.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> AI Inference: 12ms
                </span>
                <span>•</span>
                <span>8 Enrolled Webcams</span>
              </div>
            </div>
          </div>

          {/* Toast / Warning Notification Banner */}
          {issuedWarningCandidate && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between text-xs text-amber-900 shadow-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5 font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>
                  Direct Proctor Warning dispatched to <strong>{issuedWarningCandidate}</strong>'s screen viewport.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIssuedWarningCandidate(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Multi-Candidate Live Video Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredCandidates.map((candidate) => {
              const isLocked = candidate.status === 'locked';
              const isWarning = candidate.status === 'warning';

              return (
                <div
                  key={candidate.id}
                  className={`rounded-2xl border bg-white overflow-hidden shadow-xs transition-all flex flex-col ${
                    isLocked
                      ? 'border-red-400 ring-2 ring-red-500/30'
                      : isWarning
                      ? 'border-amber-400 ring-1 ring-amber-400/40'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 truncate max-w-[130px]">{candidate.name}</h4>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {candidate.rollNumber} • {candidate.station}
                      </p>
                    </div>

                    {/* Status Badge */}
                    {isLocked ? (
                      <span className="rounded-md bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                        <Lock className="h-3 w-3 text-red-600" />
                        {candidate.isPhoneLocked ? 'Phone Locked' : 'Locked (6/6)'}
                      </span>
                    ) : isWarning ? (
                      <span className="rounded-md bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3 text-amber-600" />
                        Warning {candidate.violationsCount}/6
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3 text-emerald-600" />
                        Centered
                      </span>
                    )}
                  </div>

                  {/* Video Stream Viewport */}
                  <div className="relative aspect-4/3 bg-slate-950 flex items-center justify-center overflow-hidden group">
                    {/* Simulated candidate biometric avatar & feed */}
                    <div className="flex flex-col items-center justify-center p-3 text-center">
                      <div className="relative mb-2">
                        <div
                          className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-sm ${
                            isLocked
                              ? 'bg-red-950 text-red-400 border border-red-500/50'
                              : isWarning
                              ? 'bg-amber-950 text-amber-400 border border-amber-500/50'
                              : 'bg-blue-950 text-blue-400 border border-blue-500/50'
                          }`}
                        >
                          {candidate.name.split(' ').map((n) => n[0]).join('')}
                        </div>
                        {!isLocked && (
                          <div className="absolute inset-0 rounded-full border border-emerald-400/40 animate-ping" />
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-slate-400">1080p Stream Active</p>
                    </div>

                    {/* AI Facial Bounding Box Overlay */}
                    <div className="absolute inset-2.5 pointer-events-none flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                            isLocked
                              ? 'bg-red-900/90 text-red-200 border border-red-600'
                              : isWarning
                              ? 'bg-amber-900/90 text-amber-200 border border-amber-600'
                              : 'bg-slate-900/80 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {candidate.gazeAngle}
                        </span>
                        <span className="rounded bg-slate-900/80 px-1 py-0.5 text-[8px] font-mono text-slate-300">
                          {candidate.audioDb} dB
                        </span>
                      </div>

                      {/* Face Target Reticle */}
                      <div
                        className={`self-center w-20 h-20 rounded-xl border-2 transition-all flex items-center justify-center ${
                          isLocked
                            ? 'border-red-500 bg-red-950/20'
                            : isWarning
                            ? 'border-amber-400 scale-105'
                            : 'border-emerald-400/60'
                        }`}
                      >
                        <div className="w-1 h-1 rounded-full bg-white/60" />
                      </div>

                      <div className="flex justify-between text-[8px] font-mono text-slate-400">
                        <span>Q{candidate.questionsAnswered}/{candidate.totalQuestions}</span>
                        <span>{candidate.browser}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Event Feed & Footer Actions */}
                  <div className="p-3 bg-white flex-1 flex flex-col justify-between space-y-2.5">
                    <p className="text-[11px] text-slate-600 line-clamp-1 font-medium">
                      <span className="text-slate-400 font-normal">Last Event: </span>
                      {candidate.lastEvent}
                    </p>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setInspectingCandidate(candidate)}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-slate-100 hover:bg-slate-200 py-1.5 text-xs font-semibold text-slate-700 transition-colors"
                        title="Inspect stream in high-definition"
                      >
                        <Eye className="h-3 w-3 text-slate-600" />
                        <span>Inspect</span>
                      </button>

                      {isLocked ? (
                        <button
                          type="button"
                          onClick={() => handleUnlockAttempt(candidate.attemptId)}
                          disabled={unlockAttemptMutation.isPending}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-1.5 text-xs font-bold text-white shadow-2xs transition-colors disabled:opacity-50"
                          title="Authorize candidate to resume examination"
                        >
                          <KeyRound className="h-3 w-3" />
                          <span>Unlock</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setIssuedWarningCandidate(candidate.name);
                            setTimeout(() => setIssuedWarningCandidate(null), 5000);
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 py-1.5 text-xs font-semibold text-amber-800 transition-colors"
                          title="Send high-urgency blinking warning to candidate screen"
                        >
                          <ShieldAlert className="h-3 w-3 text-amber-600" />
                          <span>Warn</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modal: Inspect Candidate Stream in Full Resolution ─────────────── */}
      {inspectingCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400">
                  <Video className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">{inspectingCandidate.name}</h3>
                  <p className="text-[11px] text-slate-400">
                    {inspectingCandidate.rollNumber} • {inspectingCandidate.station} • {inspectingCandidate.ipAddress}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingCandidate(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Status Header */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs">
                <div>
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Session Status</span>
                  <div className="font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                    {inspectingCandidate.status === 'locked' ? (
                      <span className="text-red-700 flex items-center gap-1 font-bold">
                        <Lock className="h-3.5 w-3.5" /> LOCKED ({inspectingCandidate.violationsCount} Warnings)
                      </span>
                    ) : inspectingCandidate.status === 'warning' ? (
                      <span className="text-amber-700 flex items-center gap-1 font-bold">
                        <ShieldAlert className="h-3.5 w-3.5" /> Flagged ({inspectingCandidate.violationsCount}/6 Warnings)
                      </span>
                    ) : (
                      <span className="text-emerald-700 flex items-center gap-1 font-bold">
                        <ShieldCheck className="h-3.5 w-3.5" /> Active & Centered
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Gaze Angle</span>
                  <p className="font-mono font-bold text-slate-800 mt-0.5">{inspectingCandidate.gazeAngle}</p>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Ambient Audio</span>
                  <p className="font-mono font-bold text-slate-800 mt-0.5">{inspectingCandidate.audioDb} dB (Normal)</p>
                </div>
              </div>

              {/* High-Resolution Stream Window */}
              <div className="relative aspect-4/3 rounded-2xl bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center">
                <div className="flex flex-col items-center justify-center p-6 text-center text-white">
                  <div className="relative mb-3">
                    <div
                      className={`w-20 h-20 rounded-full flex items-center justify-center text-xl font-bold ${
                        inspectingCandidate.status === 'locked'
                          ? 'bg-red-950 text-red-400 border-2 border-red-500'
                          : 'bg-blue-950 text-blue-400 border-2 border-blue-500'
                      }`}
                    >
                      {inspectingCandidate.name.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                  </div>
                  <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    {inspectingCandidate.name} • 1080p Live Invigilator Stream
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    Frame Rate: 30 FPS • Latency: 14ms • Device Detection: 0 Found
                  </p>
                </div>

                {/* Overlaid AI HUD */}
                <div className="absolute inset-4 pointer-events-none flex flex-col justify-between">
                  <div className="flex justify-between items-center text-[10px] font-mono text-emerald-400 bg-slate-900/80 px-3 py-1 rounded-lg border border-slate-800">
                    <span>EYE GAZE: {inspectingCandidate.gazeAngle}</span>
                    <span>CONFIDENCE: 98.8%</span>
                  </div>
                  <div className="self-center w-32 h-32 border-2 border-dashed border-emerald-400/80 rounded-2xl flex items-center justify-center">
                    <span className="text-[9px] text-emerald-300 font-mono">AI BOUNDING BOX</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 bg-slate-900/80 px-3 py-1 rounded-lg border border-slate-800">
                    <span>MIC: ACTIVE</span>
                    <span>MOBILE DETECTOR: ARMED</span>
                  </div>
                </div>
              </div>

              {/* Candidate Violations / Actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-slate-500">
                  <span>Questions Progress: </span>
                  <strong className="text-slate-800">
                    {inspectingCandidate.questionsAnswered} of {inspectingCandidate.totalQuestions}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  {inspectingCandidate.status === 'locked' ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleUnlockAttempt(inspectingCandidate.attemptId);
                        setInspectingCandidate(null);
                      }}
                      disabled={unlockAttemptMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs"
                    >
                      <KeyRound className="h-4 w-4" /> Authorize Re-Entry & Reset Violations
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIssuedWarningCandidate(inspectingCandidate.name);
                        setInspectingCandidate(null);
                        setTimeout(() => setIssuedWarningCandidate(null), 5000);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 shadow-xs"
                    >
                      <ShieldAlert className="h-4 w-4" /> Send Direct Screen Warning
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setInspectingCandidate(null)}
                    className="rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Broadcast Invigilator Announcement ───────────────────────── */}
      {isBroadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Broadcast Invigilator Announcement</h3>
                  <p className="text-[11px] text-slate-400">Pushes directly to all active candidate screens</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBroadcastOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {broadcastSent ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-bold text-emerald-900">Announcement Broadcast Dispatched</h4>
                  <p className="text-xs text-emerald-700">
                    The alert banner was transmitted and displayed on all 8 candidate exam terminals.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsBroadcastOpen(false)}
                    className="mt-3 rounded-xl bg-emerald-700 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setBroadcastSent(true);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Quick Preset Alerts
                    </label>
                    <div className="space-y-1.5">
                      {[
                        'Attention all candidates: Maintain strict centered gaze on the examination canvas.',
                        'Zero-Tolerance Alert: All mobile phones and handheld devices must remain powered off.',
                        'Examination Notice: 10 minutes remaining in the testing window.',
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setBroadcastMessage(preset)}
                          className="w-full text-left text-xs bg-slate-50 hover:bg-slate-100 p-2.5 rounded-xl border border-slate-200 text-slate-700 transition-colors"
                        >
                          "{preset}"
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Custom Announcement Text
                    </label>
                    <textarea
                      rows={3}
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="Type custom message to candidates..."
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsBroadcastOpen(false)}
                      className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!broadcastMessage.trim()}
                      className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Radio className="h-3.5 w-3.5" /> Dispatch to All Candidates
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Content: Performance & Analytics ─────────────────────────────── */}
      {activeTab === 'analytics' && (
        <ExamAnalyticsView
          examId={exam.id}
          examTitle={exam.title}
          totalMarks={exam.total_marks}
        />
      )}


      {/* Add Questions from Bank Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl my-8 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Add Questions from Question Bank</h2>
                <p className="text-xs text-slate-500">Select pre-authored questions to link to this exam</p>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Select Question Bank
                </label>
                <select
                  value={selectedBankId}
                  onChange={(e) => {
                    setSelectedBankId(e.target.value);
                    setSelectedQIds([]);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="">Select question bank...</option>
                  {questionBanks?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.questions_count} questions)
                    </option>
                  ))}
                </select>
              </div>

              {selectedBankId && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Bank Questions ({bankQuestions?.length || 0})
                  </h4>
                  {!bankQuestions || bankQuestions.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No questions found in this bank.</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto border border-slate-200 rounded-xl p-3">
                      {bankQuestions.map((bq) => (
                        <label
                          key={bq.id}
                          className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedQIds.includes(bq.id)}
                            onChange={() => handleToggleSelectQuestion(bq.id)}
                            className="mt-1 rounded text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1 text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-blue-700 uppercase text-[10px] bg-blue-50 px-1.5 py-0.5 rounded">
                                {bq.question_type}
                              </span>
                              <span className="text-slate-400 font-medium">+{bq.marks} marks</span>
                            </div>
                            <p className="text-slate-900 font-medium line-clamp-2">{bq.body}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <span className="text-xs text-slate-500 font-medium">
                {selectedQIds.length} questions selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddSelectedQuestions}
                  disabled={selectedQIds.length === 0 || addQuestionsMutation.isPending}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {addQuestionsMutation.isPending ? 'Adding...' : 'Add to Exam'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review & Manual Grading Drawer/Modal */}
      {gradingAttemptId && activeAttemptForGrading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl my-8 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Grading: {activeAttemptForGrading.student_name}
                </h2>
                <p className="text-xs text-slate-500">{activeAttemptForGrading.student_email}</p>
              </div>
              <button
                onClick={() => setGradingAttemptId(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-5">
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 flex items-center justify-between text-xs">
                <span>
                  Current Score: <strong className="text-slate-900">{activeAttemptForGrading.total_score || 0}</strong> / {exam.total_marks}
                </span>
                <span className="font-semibold text-blue-600">
                  Attempt #{activeAttemptForGrading.attempt_number}
                </span>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-slate-500 italic">
                  Objective questions (MCQ/MSQ/Numerical) are automatically graded. Use the inputs below to evaluate subjective Short Answer or Essay responses.
                </p>
                {/* Note: Questions are listed with manual grading fields */}
                {exam.questions.map((eq, i) => (
                  <div key={eq.id} className="rounded-xl border border-slate-200 p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Q{i + 1}. {eq.question_type.toUpperCase()}</span>
                      <span className="text-slate-500">Max: {eq.marks} marks</span>
                    </div>
                    <p className="text-slate-700 font-medium">{eq.body}</p>

                    <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                          Marks Awarded
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={eq.marks}
                          placeholder="Score"
                          value={manualMarks[eq.id] ?? ''}
                          onChange={(e) => setManualMarks({ ...manualMarks, [eq.id]: Number(e.target.value) })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                          Feedback (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="Constructive feedback"
                          value={manualFeedback[eq.id] ?? ''}
                          onChange={(e) => setManualFeedback({ ...manualFeedback, [eq.id]: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveGrade(eq.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs"
                        >
                          Save Score
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setGradingAttemptId(null)}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proctoring Timeline Audit Modal */}
      {auditAttemptId && (
        <ProctoringAuditModal
          examId={examId}
          attempt={attempts?.find((a) => a.id === auditAttemptId) || null}
          attemptId={auditAttemptId}
          studentName={attempts?.find((a) => a.id === auditAttemptId)?.student_name || 'Candidate'}
          onClose={() => setAuditAttemptId(null)}
          onUnlockSuccess={() => setAuditAttemptId(null)}
        />
      )}
    </div>
  );
}

function ProctoringAuditModal({
  examId,
  attempt,
  attemptId,
  studentName,
  onClose,
  onUnlockSuccess,
}: {
  examId: string;
  attempt: any | null;
  attemptId: string;
  studentName: string;
  onClose: () => void;
  onUnlockSuccess: () => void;
}) {
  const { data: timeline, isLoading } = useProctoringTimeline(attemptId);
  const unlockMutation = useUnlockExamAttempt(examId);

  const isLocked = attempt?.status === 'locked_violation' || (attempt?.proctor_violations_count ?? 0) >= 6;

  const handleUnlockInModal = async () => {
    if (
      window.confirm(
        `Authorize candidate ${studentName} to resume the examination? This will reset the 6/6 violation lockout and restore testing status.`
      )
    ) {
      try {
        await unlockMutation.mutateAsync({
          attemptId,
          reason: 'Faculty authorized re-entry after proctoring audit review',
          resetViolations: true,
        });
        alert(`Candidate ${studentName} has been authorized for re-entry.`);
        onUnlockSuccess();
      } catch (err: any) {
        alert(err.response?.data?.error?.message || err.message || 'Failed to unlock exam attempt.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in duration-150">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isLocked ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
              <ShieldAlert className={`h-5 w-5 ${isLocked ? 'text-rose-600' : 'text-slate-600'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Proctoring Audit Trail
                </h2>
                {isLocked && (
                  <span className="rounded-md bg-rose-100 border border-rose-300 px-2 py-0.5 text-[10px] font-bold text-rose-800 uppercase">
                    Session Locked (6/6)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Candidate: <strong className="text-slate-800">{studentName}</strong> • {attempt?.proctor_violations_count ?? 0} Recorded Infractions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLocked && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-center justify-between gap-3 text-xs text-rose-800">
            <div>
              <span className="font-bold">Lockout Active:</span> Candidate exceeded institutional 6-warning limit and was locked out of exam delivery.
            </div>
            <button
              onClick={handleUnlockInModal}
              disabled={unlockMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shrink-0 shadow-xs"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {unlockMutation.isPending ? 'Unlocking...' : 'Authorize Re-Entry'}
            </button>
          </div>
        )}

        <div className="p-6 flex-1 overflow-y-auto space-y-3">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Loading proctoring event log...
            </div>
          ) : !timeline || timeline.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No security violations recorded for this attempt. All activity remained within integrity parameters.
            </div>
          ) : (
            <div className="space-y-3">
              {timeline.map((evt, idx) => (
                <div
                  key={evt.id || idx}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-800 capitalize">
                        {evt.event_type.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          evt.severity === 'high'
                            ? 'bg-rose-100 text-rose-800'
                            : evt.severity === 'medium'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {evt.severity}
                      </span>
                    </div>
                    {evt.details && (
                      <p className="text-xs text-slate-600 font-mono bg-white rounded-md p-1.5 border border-slate-200/80">
                        {JSON.stringify(evt.details)}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {new Date(evt.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-2xl flex items-center justify-between">
          <div>
            {isLocked && (
              <span className="text-xs text-rose-700 font-medium">
                Authorization required for student to continue
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {isLocked && (
              <button
                type="button"
                onClick={handleUnlockInModal}
                disabled={unlockMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs transition-colors"
              >
                <KeyRound className="h-4 w-4" />
                {unlockMutation.isPending ? 'Unlocking...' : 'Authorize Re-Entry & Unlock Exam'}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-300"
            >
              Close Log
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


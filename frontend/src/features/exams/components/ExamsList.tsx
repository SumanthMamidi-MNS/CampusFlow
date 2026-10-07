import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/core/auth/hooks';
import { useCourseOfferings } from '@/features/courses/api';
import { useCreateExam, useExams } from '../api';
import type { ExamCreateInput, ExamStatus, ExamType } from '../types';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  HelpCircle,
  Plus,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';

export function ExamsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isFacultyOrAdmin = user && ['admin', 'super_admin', 'faculty', 'exam_controller'].some((r) => user.roles.includes(r));

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
  const [maxViolations, setMaxViolations] = useState<number>(5);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [showResultsImmediately, setShowResultsImmediately] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createExamMutation = useCreateExam();

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
        max_violations: Number(maxViolations) || 5,
        shuffle_questions: shuffleQuestions,
        show_results_immediately: showResultsImmediately,
        max_attempts: 1,
      },
      status: 'scheduled',
    };

    try {
      await createExamMutation.mutateAsync(payload);
      setIsCreateOpen(false);
      setTitle('');
      setDescription('');
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

          {isFacultyOrAdmin && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" /> Schedule Exam
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
                      {exam.status === 'published' ? (
                        <button
                          onClick={() => navigate(`/exams/${exam.id}/results`)}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" /> View Results
                        </button>
                      ) : isWindowOpen ? (
                        <button
                          onClick={() => navigate(`/exams/${exam.id}/take`)}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs transition-colors"
                        >
                          <Clock className="h-4 w-4" /> Take Exam
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          {now < start ? 'Testing window not open yet' : 'Testing window closed'}
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
                </div>
                <div className="pt-2 max-w-[16rem]">
                  <label htmlFor="max-violations" className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Recorded events tolerated before automatic submission
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
                    Events are advisory; reaching this limit submits the attempt automatically.
                  </p>
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
                  disabled={createExamMutation.isPending}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createExamMutation.isPending ? 'Scheduling...' : 'Schedule Exam'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

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
} from '../api';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  HelpCircle,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';

export function ExamDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const examId = id || '';

  const { data: exam, isLoading: isExamLoading } = useExam(examId);
  const { data: attempts } = useExamAttempts(examId);

  const [activeTab, setActiveTab] = useState<'questions' | 'grading' | 'analytics'>('questions');


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
          Student Submissions & Grading ({attempts?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'analytics'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Performance & Analytics
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
                    </td>
                    <td className="p-3">
                      {att.proctor_violations_count > 0 ? (
                        <button
                          onClick={() => setAuditAttemptId(att.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                            att.proctor_violations_count >= 5
                              ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
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
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium text-[11px] cursor-pointer"
                          title="Click to view proctoring timeline"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Clean (0)</span>
                        </button>
                      )}
                    </td>
                    <td className="p-3 pr-5 text-right">
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

      {/* Tab Content: Performance & Analytics */}
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
          attemptId={auditAttemptId}
          studentName={attempts?.find((a) => a.id === auditAttemptId)?.student_name || 'Candidate'}
          onClose={() => setAuditAttemptId(null)}
        />
      )}
    </div>
  );
}

function ProctoringAuditModal({
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in duration-150">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Proctoring Audit Trail
              </h2>
              <p className="text-xs text-slate-500">
                Candidate: <strong className="text-slate-800">{studentName}</strong>
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

        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-300"
          >
            Close Log
          </button>
        </div>
      </div>
    </div>
  );
}


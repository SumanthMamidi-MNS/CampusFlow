import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSaveExamAnswers, useStartExam, useSubmitExam } from '../api';
import type { ExamDelivery as ExamDeliveryType } from '../types';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  Flag,
  Save,
  Send,
  X,
} from 'lucide-react';

export function ExamDelivery() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const examId = id || '';

  const [delivery, setDelivery] = useState<ExamDeliveryType | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startExamMutation = useStartExam(examId);
  const saveAnswersMutation = useSaveExamAnswers(delivery?.attempt_id || '');
  const submitExamMutation = useSubmitExam(delivery?.attempt_id || '');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Initial Load / Start Attempt
  useEffect(() => {
    let isMounted = true;
    async function initExam() {
      try {
        const data = await startExamMutation.mutateAsync();
        if (!isMounted) return;
        setDelivery(data);
        setRemainingSeconds(data.remaining_seconds);

        // Preload answers from server & localStorage
        const initialAnswers: Record<string, any> = {};
        const initialFlags: Record<string, boolean> = {};

        if (data.saved_answers) {
          Object.entries(data.saved_answers).forEach(([qId, val]) => {
            if (val.answer_data) initialAnswers[qId] = val.answer_data;
            if (val.flagged_for_review) initialFlags[qId] = true;
          });
        }

        // Check local storage backup
        const localBackup = localStorage.getItem(`exam_answers_${data.attempt_id}`);
        if (localBackup) {
          try {
            const parsed = JSON.parse(localBackup);
            Object.assign(initialAnswers, parsed);
          } catch {
            // ignore JSON error
          }
        }

        setAnswers(initialAnswers);
        setFlagged(initialFlags);
      } catch (err: any) {
        setErrorMessage(err.response?.data?.error?.message || err.message || 'Failed to start exam session.');
      }
    }
    initExam();
    return () => {
      isMounted = false;
    };
  }, [examId]);

  // 2. Countdown Timer
  useEffect(() => {
    if (!delivery || remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [delivery, remainingSeconds]);

  // 3. Debounced Auto-save to Server & LocalStorage
  const triggerAutoSave = (updatedAnswers: Record<string, any>, updatedFlags: Record<string, boolean>) => {
    if (!delivery) return;

    // Save immediately to localStorage
    localStorage.setItem(`exam_answers_${delivery.attempt_id}`, JSON.stringify(updatedAnswers));

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaveStatus('saving');
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const payload = Object.entries(updatedAnswers).map(([eqId, ansData]) => ({
          exam_question_id: eqId,
          answer_data: ansData,
          flagged_for_review: Boolean(updatedFlags[eqId]),
        }));

        if (payload.length > 0) {
          await saveAnswersMutation.mutateAsync(payload);
        }
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 1500);
  };

  const handleAutoSubmit = async () => {
    if (!delivery) return;
    try {
      await submitExamMutation.mutateAsync();
      localStorage.removeItem(`exam_answers_${delivery.attempt_id}`);
      navigate(`/exams/${examId}/results`);
    } catch {
      alert('Your time expired and the exam has been submitted automatically.');
      navigate(`/exams/${examId}/results`);
    }
  };

  const handleFinalSubmit = async () => {
    if (!delivery) return;
    try {
      await submitExamMutation.mutateAsync();
      localStorage.removeItem(`exam_answers_${delivery.attempt_id}`);
      navigate(`/exams/${examId}/results`);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to submit exam.');
    }
  };

  if (errorMessage) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Cannot Access Exam</h2>
        <p className="text-xs text-slate-500 mt-2 mb-6">{errorMessage}</p>
        <button
          onClick={() => navigate('/exams')}
          className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Return to Examinations
        </button>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 text-xs">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-3" />
        Initializing secure exam environment...
      </div>
    );
  }

  const currentQ = delivery.questions[currentIndex];
  const currentAnswer = currentQ ? answers[currentQ.id] : null;
  const isCurrentFlagged = currentQ ? Boolean(flagged[currentQ.id]) : false;

  // Answer formatting helper
  const handleSelectAnswer = (ans: any) => {
    if (!currentQ) return;
    const updated = { ...answers, [currentQ.id]: ans };
    setAnswers(updated);
    triggerAutoSave(updated, flagged);
  };

  const handleToggleFlag = () => {
    if (!currentQ) return;
    const updated = { ...flagged, [currentQ.id]: !flagged[currentQ.id] };
    setFlagged(updated);
    triggerAutoSave(answers, updated);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = remainingSeconds <= 300; // less than 5 minutes

  // Summary counts
  const answeredCount = Object.keys(answers).length;
  const flaggedCount = Object.values(flagged).filter(Boolean).length;
  const totalQuestions = delivery.questions.length;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div>
          <h1 className="text-base font-bold text-slate-900">{delivery.exam_title}</h1>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
            <span>
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Save className="h-3 w-3 text-slate-400" />
              <span>
                {saveStatus === 'saving'
                  ? 'Saving...'
                  : saveStatus === 'error'
                  ? 'Network offline (cached locally)'
                  : 'All changes saved'}
              </span>
            </div>
          </div>
        </div>

        {/* Center Timer */}
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-1.5 font-mono text-sm font-bold border transition-colors ${
            isLowTime
              ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
              : 'bg-slate-100 border-slate-200 text-slate-800'
          }`}
        >
          <Clock className={`h-4 w-4 ${isLowTime ? 'text-rose-600' : 'text-slate-500'}`} />
          <span>{formatTimer(remainingSeconds)}</span>
        </div>

        {/* Submit Action */}
        <div>
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs transition-colors"
          >
            <Send className="h-3.5 w-3.5" /> Submit Exam
          </button>
        </div>
      </header>

      {/* Main Examination Workspace */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto p-4 md:p-6 gap-6">
        {/* Left Side: Question Navigator Palette */}
        <aside className="w-full md:w-64 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between shrink-0 h-fit">
          <div>
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
              Questions Palette
            </h3>
            <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
              {delivery.questions.map((q, idx) => {
                const isAnswered = answers[q.id] !== undefined;
                const isFlagged = flagged[q.id];
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-xl font-bold text-xs flex items-center justify-center relative transition-all ${
                      isCurrent
                        ? 'ring-2 ring-blue-600 ring-offset-1 font-extrabold'
                        : ''
                    } ${
                      isAnswered
                        ? 'bg-emerald-600 text-white'
                        : isFlagged
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-1 ring-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Palette Legend */}
          <div className="pt-4 mt-4 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-600" />
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span>Flagged for review ({flaggedCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-200" />
              <span>Unanswered ({totalQuestions - answeredCount})</span>
            </div>
          </div>
        </aside>

        {/* Center: Question Interaction Canvas */}
        <main className="flex-1 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          {currentQ ? (
            <div className="space-y-6">
              {/* Question Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">Question {currentIndex + 1}</span>
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 uppercase">
                    {currentQ.question_type.replace('_', ' ')}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    +{currentQ.marks} {currentQ.negative_marks > 0 ? `(-${currentQ.negative_marks})` : ''} marks
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleToggleFlag}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    isCurrentFlagged
                      ? 'bg-amber-100 text-amber-800'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>{isCurrentFlagged ? 'Flagged' : 'Flag for review'}</span>
                </button>
              </div>

              {/* Question Prompt */}
              <div className="py-2">
                <p className="text-sm font-medium text-slate-900 leading-relaxed whitespace-pre-wrap">
                  {currentQ.body}
                </p>
              </div>

              {/* Answer Input Controls */}
              <div className="pt-2">
                {/* MCQ Options */}
                {currentQ.question_type === 'mcq' && (
                  <div className="space-y-2.5">
                    {currentQ.options.map((opt) => {
                      const isSelected = currentAnswer?.selected === opt.label;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => handleSelectAnswer({ selected: opt.label })}
                          className={`w-full text-left flex items-start gap-3 rounded-xl border p-3 text-xs transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/60 font-medium text-blue-900 shadow-xs ring-1 ring-blue-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span
                            className={`h-5 w-5 rounded-md flex items-center justify-center font-bold text-[11px] shrink-0 ${
                              isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {opt.label}
                          </span>
                          <span className="flex-1 break-words leading-relaxed">{opt.body}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* MSQ Options (Multiple Correct) */}
                {currentQ.question_type === 'msq' && (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-slate-400 italic mb-2">Select all choices that apply.</p>
                    {currentQ.options.map((opt) => {
                      const selectedList: string[] = currentAnswer?.selected || [];
                      const isSelected = selectedList.includes(opt.label);

                      const toggleSelection = () => {
                        const updatedList = isSelected
                          ? selectedList.filter((x) => x !== opt.label)
                          : [...selectedList, opt.label];
                        handleSelectAnswer({ selected: updatedList });
                      };

                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={toggleSelection}
                          className={`w-full text-left flex items-start gap-3 rounded-xl border p-3 text-xs transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/60 font-medium text-blue-900 shadow-xs ring-1 ring-blue-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="mt-0.5 rounded text-blue-600"
                          />
                          <span className="font-bold text-slate-800">{opt.label}.</span>
                          <span className="flex-1 break-words">{opt.body}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* True / False */}
                {currentQ.question_type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-3 max-w-sm">
                    {['true', 'false'].map((val) => {
                      const isSelected = String(currentAnswer?.selected).toLowerCase() === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleSelectAnswer({ selected: val })}
                          className={`rounded-xl border p-3 text-xs font-semibold capitalize transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Numerical Input */}
                {currentQ.question_type === 'numerical' && (
                  <div className="max-w-xs space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-600 uppercase">
                      Enter Calculated Value
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 42.5"
                      value={currentAnswer?.value ?? ''}
                      onChange={(e) => handleSelectAnswer({ value: e.target.value ? Number(e.target.value) : null })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                )}

                {/* Short Answer / Essay */}
                {['short_answer', 'essay'].includes(currentQ.question_type) && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-600 uppercase">
                      Written Response
                    </label>
                    <textarea
                      rows={currentQ.question_type === 'essay' ? 8 : 4}
                      placeholder="Type your response here..."
                      value={currentAnswer?.text ?? ''}
                      onChange={(e) => handleSelectAnswer({ text: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">No questions loaded.</div>
          )}

          {/* Bottom Navigation Buttons */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-8">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-colors shadow-xs"
            >
              <ArrowLeft className="h-4 w-4" /> Previous
            </button>

            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
              disabled={currentIndex === totalQuestions - 1}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-30 transition-colors shadow-xs"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </main>
      </div>

      {/* Final Submission Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Confirm Exam Submission</h3>
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>Are you sure you want to finish and submit your exam?</p>
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-1">
                <p>
                  • Answered: <strong className="text-emerald-700">{answeredCount}</strong> of {totalQuestions}
                </p>
                <p>
                  • Unanswered: <strong className="text-rose-600">{totalQuestions - answeredCount}</strong>
                </p>
                {flaggedCount > 0 && (
                  <p>
                    • Flagged for review: <strong className="text-amber-600">{flaggedCount}</strong>
                  </p>
                )}
              </div>
              <p className="text-[11px] text-slate-400 italic">
                Once submitted, responses cannot be modified and will be processed by the grading engine.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Continue Exam
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitExamMutation.isPending}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitExamMutation.isPending ? 'Submitting...' : 'Yes, Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

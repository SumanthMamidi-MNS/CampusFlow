import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/core/auth/hooks';
import { useStudentExamResult } from '../api';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  HelpCircle,
  Sparkles,
  XCircle,
} from 'lucide-react';

export function ExamResult() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const examId = id || '';

  const { data: result, isLoading, error } = useStudentExamResult(examId);

  if (isLoading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Loading examination results...</div>;
  }

  if (error || !result) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
        <HelpCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Results Unavailable</h2>
        <p className="text-xs text-slate-500 mt-2 mb-6">
          {(error as any)?.response?.data?.error?.message ||
            'Examination results have not been published by the instructor yet.'}
        </p>
        <button
          onClick={() => navigate('/exams')}
          className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Return to Examinations
        </button>
      </div>
    );
  }

  const isPassing = (result.percentage || 0) >= 40;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back button */}
      <div>
        <button
          onClick={() => navigate('/exams')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Examinations
        </button>
      </div>

      {/* Score Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 uppercase">
            Official Exam Scorecard
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{result.exam_title}</h1>
          <p className="text-sm font-medium text-slate-700 mt-1">
            {user ? `${user.first_name} ${user.last_name}` : 'Student'}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Submitted on {result.submitted_at ? new Date(result.submitted_at).toLocaleString() : 'N/A'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-center sm:text-right">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Score Achieved</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-0.5">
              {result.total_score} <span className="text-lg text-slate-400 font-normal">/ {result.total_marks}</span>
            </p>
          </div>
          <div
            className={`p-4 rounded-2xl flex flex-col items-center justify-center min-w-20 ${
              isPassing ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            <Award className="h-6 w-6 mb-1" />
            <span className="text-base font-extrabold">{result.percentage}%</span>
            <span className="text-[10px] font-semibold uppercase">{isPassing ? 'Passed' : 'Failed'}</span>
          </div>
        </div>
      </div>

      {/* Responses Breakdown */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">Performance Breakdown ({result.responses.length} Items)</h2>

        {result.responses.map((resp, idx) => {
          const isCorrect = resp.marks_awarded != null && resp.marks_awarded > 0;
          return (
            <div
              key={resp.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-400">Q{idx + 1}.</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 uppercase">
                    {resp.question_type.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {resp.marks_awarded != null ? (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold ${
                        isCorrect ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {isCorrect ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {resp.marks_awarded} / {resp.max_marks} marks
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Pending evaluation</span>
                  )}
                </div>
              </div>

              <p className="text-xs font-medium text-slate-900">{resp.question_body}</p>

              {/* Student's submitted response */}
              <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1 border border-slate-100">
                <p className="font-semibold text-slate-600 uppercase text-[10px]">Your Answer:</p>
                <p className="text-slate-800 font-mono">
                  {resp.answer_data?.selected !== undefined
                    ? Array.isArray(resp.answer_data.selected)
                      ? resp.answer_data.selected.join(', ')
                      : String(resp.answer_data.selected)
                    : resp.answer_data?.value !== undefined
                    ? String(resp.answer_data.value)
                    : Array.isArray(resp.answer_data?.blanks) && resp.answer_data.blanks.length > 0
                    ? resp.answer_data.blanks.join(', ')
                    : resp.answer_data?.text || <span className="text-slate-400 italic">No answer submitted</span>}
                </p>
              </div>

              {/* Correct answer summary if released */}
              {resp.correct_answer_summary && (
                <div className="text-xs text-emerald-800 flex items-center gap-1.5 font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Correct Key: <strong>{resp.correct_answer_summary}</strong></span>
                </div>
              )}

              {/* Instructor feedback */}
              {resp.feedback && (
                <div className="rounded-xl bg-blue-50/60 border border-blue-200 p-2.5 text-xs text-blue-900">
                  <p className="font-semibold text-[10px] uppercase text-blue-700">Instructor Evaluation:</p>
                  <p className="italic">{resp.feedback}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

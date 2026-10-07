import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  downloadQuestionsCsv,
  useApproveQuestion,
  useDeleteQuestion,
  useQuestionBank,
  useQuestions,
} from '../api';
import { BulkImportModal } from './BulkImportModal';
import { CreateQuestionModal } from './CreateQuestionModal';
import { ConfirmDialog } from '@/core/components/ui';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  Download,
  FileUp,
  HelpCircle,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';

export function QuestionBankDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const bankId = id || '';

  const { data: bank, isLoading: isBankLoading } = useQuestionBank(bankId);

  // Filters
  const [search, setSearch] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState('');

  const { data: questions, isLoading: isQuestionsLoading } = useQuestions(bankId, {
    search: search.trim() || undefined,
    question_type: questionType || undefined,
    difficulty: difficulty || undefined,
    status: status || undefined,
  });

  const approveMutation = useApproveQuestion(bankId);
  const deleteMutation = useDeleteQuestion(bankId);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const errorMessage = (err: any, fallback: string) =>
    err?.response?.data?.error?.message || err?.message || fallback;

  const handleExportCsv = async () => {
    setActionError(null);
    try {
      setIsExporting(true);
      await downloadQuestionsCsv(bankId, bank?.title);
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to export questions CSV.'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleApprove = async (qId: string) => {
    setActionError(null);
    try {
      await approveMutation.mutateAsync(qId);
    } catch (err: any) {
      setActionError(errorMessage(err, 'Failed to approve question.'));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(deleteTargetId);
    } catch (err: any) {
      setActionError(errorMessage(err, 'Failed to delete question.'));
    } finally {
      setDeleteTargetId(null);
    }
  };

  if (isBankLoading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Loading question bank...</div>;
  }

  if (!bank) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">Question bank not found</h2>
        <button
          onClick={() => navigate('/question-banks')}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Question Banks
        </button>
      </div>
    );
  }

  // Summary Metrics
  const totalQuestions = questions?.length || 0;
  const approvedCount = questions?.filter((q) => q.status === 'approved').length || 0;
  const draftCount = questions?.filter((q) => q.status === 'draft').length || 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {actionError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
          {actionError}
        </div>
      )}

      {/* Back button */}
      <div>
        <button
          onClick={() => navigate('/question-banks')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Question Banks
        </button>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {bank.department_name && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                <Building2 className="h-3.5 w-3.5" /> {bank.department_name}
              </span>
            )}
            {bank.course_title && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                <BookOpen className="h-3.5 w-3.5" /> {bank.course_title}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{bank.title}</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            {bank.description || 'Assessment questions collection for examinations and quizzes.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <FileUp className="h-4 w-4 text-slate-500" /> Bulk Import
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-slate-500" /> Export CSV
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" /> Add Question
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Questions</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalQuestions}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved for Exams</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{approvedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Draft / Review</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{draftCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions by text or prompt..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
          >
            <option value="">All Question Types</option>
            <option value="mcq">Single Choice (MCQ)</option>
            <option value="msq">Multiple Select (MSQ)</option>
            <option value="true_false">True / False</option>
            <option value="numerical">Numerical</option>
            <option value="short_answer">Short Answer</option>
            <option value="essay">Essay</option>
          </select>

          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
          >
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
          </select>
        </div>
      </div>

      {/* Questions List */}
      {isQuestionsLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">Loading questions...</div>
      ) : !questions || questions.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center bg-white">
          <HelpCircle className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No questions match your criteria</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Try adjusting your search filters or author a new question.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Add Question
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-colors"
            >
              {/* Question Card Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-xs text-slate-400">Q{idx + 1}.</span>
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 uppercase">
                    {q.question_type.replace('_', ' ')}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${
                      q.difficulty === 'easy'
                        ? 'bg-emerald-50 text-emerald-700'
                        : q.difficulty === 'medium'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {q.difficulty}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    +{q.marks} {q.negative_marks > 0 ? `(-${q.negative_marks})` : ''} marks
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${
                      q.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {q.status}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  {q.status === 'draft' && (
                    <button
                      onClick={() => handleApprove(q.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                      title="Approve Question for Exams"
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTargetId(q.id)}
                    className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    title="Delete Question"
                    aria-label={`Delete question: ${q.body.slice(0, 60)}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Question Prompt */}
              <div className="py-3">
                <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap">{q.body}</p>
              </div>

              {/* Options Section */}
              {q.options && q.options.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-2">
                  {q.options.map((opt) => (
                    <div
                      key={opt.label}
                      className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-xs transition-colors ${
                        opt.is_correct
                          ? 'border-emerald-300 bg-emerald-50/60 font-medium text-emerald-900'
                          : 'border-slate-200 bg-slate-50/50 text-slate-700'
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded-md flex items-center justify-center font-bold text-[11px] shrink-0 ${
                          opt.is_correct
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="flex-1 break-words">{opt.body}</span>
                      {opt.is_correct && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 ml-1" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Numerical metadata if applicable */}
              {q.question_type === 'numerical' && q.metadata_info && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 my-2 text-xs flex items-center gap-4 text-slate-700">
                  <span>
                    Answer: <strong className="text-slate-900">{q.metadata_info.answer}</strong>
                  </span>
                  <span>
                    Tolerance: <strong className="text-slate-900">+/- {q.metadata_info.tolerance || 0}</strong>
                  </span>
                </div>
              )}

              {/* Explanation & Tags Footer */}
              {(q.explanation || (q.tags && q.tags.length > 0)) && (
                <div className="pt-3 mt-1 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  {q.explanation ? (
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span className="line-clamp-1 italic">{q.explanation}</span>
                    </div>
                  ) : (
                    <div />
                  )}

                  {q.tags && q.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <Tag className="h-3 w-3 text-slate-400" />
                      {q.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateQuestionModal
        bankId={bankId}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <BulkImportModal
        bankId={bankId}
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Delete question"
        body="Are you sure you want to delete this question? This cannot be undone."
        confirmLabel="Delete question"
        destructive
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

import { useState } from 'react';
import { useCreateQuestion } from '../api';
import type { DifficultyLevel, QuestionCreateInput, QuestionType } from '../types';
import { Plus, Trash2, X } from 'lucide-react';

interface CreateQuestionModalProps {
  bankId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CreateQuestionModal({ bankId, isOpen, onClose }: CreateQuestionModalProps) {
  const [questionType, setQuestionType] = useState<QuestionType>('mcq');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [marks, setMarks] = useState<number>(1.0);
  const [negativeMarks, setNegativeMarks] = useState<number>(0.0);
  const [body, setBody] = useState('');
  const [explanation, setExplanation] = useState('');
  const [tags, setTags] = useState('');

  // Options for MCQ / MSQ / True-False
  const [options, setOptions] = useState([
    { label: 'A', body: '', is_correct: true },
    { label: 'B', body: '', is_correct: false },
    { label: 'C', body: '', is_correct: false },
    { label: 'D', body: '', is_correct: false },
  ]);

  // Numerical question metadata
  const [numericalAnswer, setNumericalAnswer] = useState<number>(0);
  const [numericalTolerance, setNumericalTolerance] = useState<number>(0);

  const [formError, setFormError] = useState<string | null>(null);

  const createQuestionMutation = useCreateQuestion(bankId);

  if (!isOpen) return null;

  const handleTypeChange = (newType: QuestionType) => {
    setQuestionType(newType);
    setFormError(null);
    if (newType === 'true_false') {
      setOptions([
        { label: 'A', body: 'True', is_correct: true },
        { label: 'B', body: 'False', is_correct: false },
      ]);
    } else if (newType === 'mcq' || newType === 'msq') {
      if (options.length < 2) {
        setOptions([
          { label: 'A', body: '', is_correct: true },
          { label: 'B', body: '', is_correct: false },
        ]);
      }
    }
  };

  const handleOptionChange = (index: number, text: string) => {
    const updated = [...options];
    updated[index].body = text;
    setOptions(updated);
  };

  const handleCorrectToggle = (index: number) => {
    if (questionType === 'mcq' || questionType === 'true_false') {
      const updated = options.map((opt, i) => ({
        ...opt,
        is_correct: i === index,
      }));
      setOptions(updated);
    } else if (questionType === 'msq') {
      const updated = [...options];
      updated[index].is_correct = !updated[index].is_correct;
      setOptions(updated);
    }
  };

  const addOption = () => {
    if (options.length >= 8) return;
    const nextLabel = String.fromCharCode(65 + options.length);
    setOptions([...options, { label: nextLabel, body: '', is_correct: false }]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) {
      setFormError('Multiple choice questions require at least two options.');
      return;
    }
    const updated = options
      .filter((_, i) => i !== index)
      .map((opt, i) => ({
        ...opt,
        label: String.fromCharCode(65 + i),
      }));
    setOptions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!body.trim()) {
      setFormError('Question text is required.');
      return;
    }

    const payload: QuestionCreateInput = {
      question_type: questionType,
      difficulty,
      marks: Number(marks),
      negative_marks: Number(negativeMarks),
      body: body.trim(),
      explanation: explanation.trim() || undefined,
      tags: tags
        ? tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    };

    if (['mcq', 'msq', 'true_false'].includes(questionType)) {
      for (const opt of options) {
        if (!opt.body.trim()) {
          setFormError('All options must have content.');
          return;
        }
      }
      const correctCount = options.filter((o) => o.is_correct).length;
      if (questionType === 'mcq' && correctCount !== 1) {
        setFormError('Please select exactly one correct option for MCQ.');
        return;
      }
      if (questionType === 'true_false' && correctCount !== 1) {
        setFormError('Please select whether True or False is the correct answer.');
        return;
      }
      if (questionType === 'msq' && correctCount < 1) {
        setFormError('Please select at least one correct option for MSQ.');
        return;
      }

      payload.options = options.map((opt, i) => ({
        label: opt.label,
        body: opt.body.trim(),
        is_correct: opt.is_correct,
        sort_order: i,
      }));
    } else if (questionType === 'numerical') {
      payload.metadata_info = {
        answer: Number(numericalAnswer),
        tolerance: Number(numericalTolerance),
      };
    }

    try {
      await createQuestionMutation.mutateAsync(payload);
      onClose();
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || err.message || 'Failed to create question');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Add New Question</h2>
            <p className="text-xs text-slate-500">Create an item for this question bank</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {formError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
              {formError}
            </div>
          )}

          {/* Type & Difficulty Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Question Type
              </label>
              <select
                value={questionType}
                onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="mcq">Single Choice (MCQ)</option>
                <option value="msq">Multiple Select (MSQ)</option>
                <option value="true_false">True / False</option>
                <option value="numerical">Numerical</option>
                <option value="short_answer">Short Answer</option>
                <option value="essay">Essay</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Marks
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={marks}
                  onChange={(e) => setMarks(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Penalty
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={negativeMarks}
                  onChange={(e) => setNegativeMarks(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Question Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Question Statement / Prompt <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter the question text or problem statement..."
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              required
            />
          </div>

          {/* Options Section for MCQ / MSQ / True-False */}
          {['mcq', 'msq', 'true_false'].includes(questionType) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Options & Correct Answer
                </label>
                {questionType !== 'true_false' && options.length < 8 && (
                  <button
                    type="button"
                    onClick={addOption}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Option
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCorrectToggle(idx)}
                      className={`h-7 w-7 rounded-lg font-bold text-xs flex items-center justify-center transition-colors ${
                        opt.is_correct
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={opt.is_correct ? 'Correct answer' : 'Click to mark as correct'}
                    >
                      {opt.label}
                    </button>
                    <input
                      type="text"
                      value={opt.body}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${opt.label} text`}
                      disabled={questionType === 'true_false'}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden disabled:bg-slate-50"
                      required
                    />
                    {questionType !== 'true_false' && options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(idx)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Remove option"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                {questionType === 'mcq' && 'Click the option label (A, B, C...) to mark the single correct answer.'}
                {questionType === 'msq' && 'Click labels to select all applicable correct options.'}
                {questionType === 'true_false' && 'Select whether True or False is correct.'}
              </p>
            </div>
          )}

          {/* Numerical answer input */}
          {questionType === 'numerical' && (
            <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Expected Numerical Answer
                </label>
                <input
                  type="number"
                  step="any"
                  value={numericalAnswer}
                  onChange={(e) => setNumericalAnswer(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Allowed Tolerance (+/-)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={numericalTolerance}
                  onChange={(e) => setNumericalTolerance(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {/* Explanation */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Explanation & Solution Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Provide solution rationale displayed after grading or results release..."
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Topic Tags (Comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. data-structures, sorting, trees"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createQuestionMutation.isPending}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createQuestionMutation.isPending ? 'Saving...' : 'Add Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

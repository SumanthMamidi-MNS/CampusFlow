import { useMemo } from 'react';
import { useQuestions } from '@/features/question-banks/api';
import type { QuestionBank } from '@/features/question-banks/types';
import type { RandomPaperValue } from '../random-paper';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Fields shared by the scheduling dialog and the exam builder: pick a bank (or
 * the whole course syllabus), narrow by syllabus topic and difficulty, and say
 * how many questions the random draw should return.
 */
export function RandomPaperFields({
  banks,
  value,
  onChange,
  idPrefix,
}: {
  banks: QuestionBank[];
  value: RandomPaperValue;
  onChange: (next: RandomPaperValue) => void;
  idPrefix: string;
}) {
  const { data: bankQuestions, isFetching } = useQuestions(value.bankId);

  // Syllabus topics = the distinct tags the questions in scope carry.
  const topics = useMemo(() => {
    const set = new Set<string>();
    (bankQuestions || []).forEach((q) => (q.tags || []).forEach((t) => t && set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bankQuestions]);

  const toggleTag = (tag: string) =>
    onChange({
      ...value,
      tags: value.tags.includes(tag) ? value.tags.filter((t) => t !== tag) : [...value.tags, tag],
    });

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={`${idPrefix}-bank`}
          className="block text-xs font-semibold text-slate-700 mb-1"
        >
          Syllabus scope
        </label>
        <select
          id={`${idPrefix}-bank`}
          value={value.bankId}
          onChange={(e) => onChange({ ...value, bankId: e.target.value, tags: [] })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
        >
          <option value="">All banks for this course &amp; department</option>
          {banks.map((bank) => (
            <option key={bank.id} value={bank.id}>
              {bank.title} ({bank.questions_count})
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">
          Leave on the full syllabus to draw from every bank of this course, or name one bank to
          restrict the pool.
        </p>
      </div>

      <div>
        <span className="block text-xs font-semibold text-slate-700 mb-1.5">
          Syllabus topics
        </span>
        {!value.bankId ? (
          <p className="text-[11px] text-slate-500">
            Select a specific bank to filter by its syllabus topics (tags).
          </p>
        ) : isFetching ? (
          <p className="text-[11px] text-slate-400">Loading topics…</p>
        ) : topics.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            This bank has no topic tags yet — the draw will use every question in it.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => {
              const active = value.tags.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => toggleTag(topic)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        )}
        {value.tags.length > 0 && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Drawing only from: {value.tags.join(', ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`${idPrefix}-difficulty`}
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Difficulty
          </label>
          <select
            id={`${idPrefix}-difficulty`}
            value={value.difficulty}
            onChange={(e) => onChange({ ...value, difficulty: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          >
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`${idPrefix}-count`}
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Questions to draw
          </label>
          <input
            id={`${idPrefix}-count`}
            type="number"
            min={1}
            max={200}
            value={value.questionCount || ''}
            placeholder="All matching"
            onChange={(e) =>
              onChange({ ...value, questionCount: e.target.value === '' ? 0 : Number(e.target.value) })
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-slate-500">Blank = every matching question.</p>
        </div>
      </div>
    </div>
  );
}

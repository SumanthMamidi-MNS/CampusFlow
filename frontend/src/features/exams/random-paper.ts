/**
 * The examiner's syllabus scope for a randomly drawn paper.
 *
 * `bankId` empty means "every bank for this offering's course or department",
 * which is what the server treats as the syllabus when no bank is named.
 * `tags` are the syllabus topics carried by the questions.
 */
export interface RandomPaperValue {
  bankId: string;
  tags: string[];
  difficulty: string;
  questionCount: number;
}

export const EMPTY_RANDOM_PAPER: RandomPaperValue = {
  bankId: '',
  tags: [],
  difficulty: '',
  questionCount: 0,
};

/** Translate the field values into the server's generation payload. */
export function toGeneratePayload(
  value: RandomPaperValue,
  replaceExisting: boolean
): {
  question_bank_ids?: string[];
  tags?: string[];
  difficulties?: string[];
  question_count?: number;
  replace_existing: boolean;
  shuffle: boolean;
} {
  return {
    ...(value.bankId ? { question_bank_ids: [value.bankId] } : {}),
    ...(value.tags.length ? { tags: value.tags } : {}),
    ...(value.difficulty ? { difficulties: [value.difficulty] } : {}),
    ...(value.questionCount > 0 ? { question_count: value.questionCount } : {}),
    replace_existing: replaceExisting,
    shuffle: true,
  };
}

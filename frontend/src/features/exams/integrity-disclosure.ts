/**
 * Candidate-facing sentences for the disclosed integrity vocabulary (ADR-040).
 *
 * The server owns the split. `counted_event_types` are the signals that can
 * spend the disclosed allowance; `review_only_event_types` are recorded for the
 * lecturer's review and never counted. This module turns those ids into the
 * sentences the brief shows, and nothing else: it must not decide a disposition
 * or hold a copy of the sets, because a frontend list that drifts from the server
 * is exactly how a candidate ends up told the wrong price.
 *
 * `scripts/check-integrity-signals.ts` reads the server's sets out of
 * `backend/campusflow/domain/exams/service.py` and fails if an id the server
 * discloses has no sentence here, or if a sentence outlives its id.
 */

export const INTEGRITY_SIGNAL_LABELS: Record<string, string> = {
  // Deliberate acts against the paper: these can spend the allowance.
  tab_switch: 'Switching to another tab',
  window_blur: 'Another application taking the focus',
  fullscreen_exit: 'Leaving full-screen',
  clipboard_copy_attempt: 'Copying from the paper',
  clipboard_paste_attempt: 'Pasting into the paper',
  copy_paste_attempt: 'Copying or pasting in the paper',
  context_menu: 'Opening the right-click menu',
  window_resized: 'Resizing the assessment window',
  ip_change: 'The sitting moving to a different network',
  camera_off: 'Stopping the camera',
  camera_obstructed: 'Covering or freezing the camera picture',
  second_device_detected: 'A phone, earbuds or a smartwatch in the camera picture',
  // Inference about the candidate: recorded for review, never counted.
  looking_away: 'Turning your head away from the paper past the disclosed time',
  face_not_visible: 'No face in frame past the disclosed time',
  multiple_faces_detected: 'A second face at the desk',
  hand_near_face: 'A hand held at the face past the disclosed time',
  voice_detected: 'A sustained second voice in the room',
  mouth_movement_detected: 'Sustained talking-shaped mouth movement, when the paper authors it',
  // Passive evidence: recorded, never a finding.
  camera_snapshot: 'A periodic evidence frame',
  quick_tab_return: 'Returning to the paper inside the grace period',
};

/** The sentence for one disclosed signal id. */
export function signalLabel(eventType: string): string {
  return INTEGRITY_SIGNAL_LABELS[eventType] ?? eventType.replace(/_/g, ' ');
}

/** The disclosed list as sentences, in the order the server sent it. */
export function signalSentences(eventTypes: string[] | undefined): string[] {
  return (eventTypes ?? []).map(signalLabel);
}

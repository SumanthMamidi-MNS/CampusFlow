/**
 * On-device mouth-movement monitoring for assessment integrity (ADR-030).
 *
 * The gap this closes: a candidate can keep their face forward, their hands
 * clear, their phone out of view and their microphone silent — and still read
 * the answer aloud for someone standing behind the camera, or repeat an answer
 * that is being dictated to them. Every other visual signal here is a position
 * measurement (where the head is, where a hand is, whether a device is in the
 * shot); none of them notices that the candidate is *speaking*, because speaking
 * barely moves anything except the mouth.
 *
 * Why this is measured as motion and not as speech:
 *
 *   - BlazeFace returns six points. There is no lip contour to measure, so
 *     "mouth open" is not observable. `@mediapipe/tasks-vision` would give one,
 *     at the cost of a second model download on every proctored paper for a cue
 *     whose benign causes are constant.
 *   - Moving pixels are already available: the assessment draws the camera into
 *     a canvas for the obstruction probe. Two small crops of that frame — a
 *     mouth band and a forehead band — cost a few hundred bytes of arithmetic.
 *   - Nothing is recognised, transcribed or kept. No audio is touched at all.
 *
 * The measurement, in one paragraph. For each sample, the mouth band and the
 * reference band are reduced to mean luminance per pixel, and the change since
 * the previous sample is the mean absolute difference between them. Talking
 * moves the mouth band much more than the forehead; a head turn, a lean or a
 * nod moves both about equally. So the signal is *dominance*, not raw motion:
 *
 *     talking = mouthMotion >= MIN and mouthMotion >= DOMINANCE * referenceMotion
 *
 * That is what keeps a candidate who shifts in their chair from looking like one
 * who is talking. It is a heuristic with named failure modes, not a classifier:
 * chewing, drinking, yawning, laughing and a sneeze all move the mouth band, and
 * a hand across the face moves both bands. The server records the event as a
 * review observation that never spends the candidate's allowance and never
 * changes attempt state (ADR-029/030); a human decides what it means.
 *
 * What this cannot do, stated plainly:
 *   - It cannot tell talking from chewing, yawning or drinking — the reviewer
 *     sees the numbers and the attached frame, and judges.
 *   - A candidate who speaks without moving their lips much, or who is off to
 *     the side of the frame, is not detected.
 *   - Heavy video compression smears small motion; the thresholds are set above
 *     the noise floor of a webcam at exam distance, which also means quiet,
 *     small movements can fall below them.
 */
import type { DetectedFace } from './face-monitoring';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MouthRegions {
  /** The lips/chin band: where talking shows. */
  mouth: Rect;
  /** The forehead band: the control for head movement. */
  reference: Rect;
}

/** Smallest face box this can measure; below it a band is a few pixels. */
export const MIN_FACE_BOX_PX = 40;

/** Smallest usable band edge, in analysed-frame pixels. */
export const MIN_BAND_PX = 6;

/**
 * Band geometry, as fractions of the face box.
 *
 * The mouth band is centred a little below the mouth landmark so it covers lips
 * and chin (a jaw drop moves both) and is wide enough to survive a few pixels of
 * landmark jitter. The reference band sits on the forehead, which a speaking
 * mouth does not move.
 */
export const MOUTH_BAND = { width: 0.6, height: 0.34, centreY: 0.7 } as const;
export const REFERENCE_BAND = { width: 0.6, height: 0.22, centreY: 0.14 } as const;

/**
 * Mean luma change that counts as movement, in [0, 1].
 *
 * This was 0.02 and a talking mouth routinely sat under it: the band is a
 * thumbnail at exam distance and a jaw drop changes only a fifth of it, so 1.2%
 * of mean luma is still an order of magnitude above sensor noise on a still face
 * while being reachable by ordinary speech.
 */
export const MOUTH_MOTION_MIN = 0.012;

/**
 * How much more the mouth band must move than the forehead band. Two independent
 * bands of the same face share head motion, so a turn produces a ratio near 1;
 * speech adds mouth motion on top of that shared motion.
 *
 * 1.35 rather than 1.8: speaking while gesturing or nodding is the normal case,
 * and the old factor only fired for a perfectly still head. Head bobbing still
 * moves both bands together, so a nod stays below this.
 */
export const MOUTH_DOMINANCE = 1.35;

/** Luma image the caller samples from (a canvas ImageData, or a synthetic one). */
export interface LumaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/**
 * How much of a band must survive clipping before it is still worth measuring.
 * A face at the very edge of the frame legitimately loses a sliver to the
 * boundary; a face that is mostly out of shot would leave a band made of
 * background, and differencing background is not evidence about a mouth.
 */
export const MIN_BAND_RETAINED = 0.7;

function clampRect(rect: Rect, width: number, height: number): Rect | null {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const right = Math.min(width, Math.round(rect.x + rect.width));
  const bottom = Math.min(height, Math.round(rect.y + rect.height));
  const clampedWidth = right - x;
  const clampedHeight = bottom - y;
  if (clampedWidth < MIN_BAND_PX || clampedHeight < MIN_BAND_PX) return null;
  if (clampedWidth < rect.width * MIN_BAND_RETAINED) return null;
  if (clampedHeight < rect.height * MIN_BAND_RETAINED) return null;
  return { x, y, width: clampedWidth, height: clampedHeight };
}

/**
 * The two bands for one face, or `null` when the face is too small, partly
 * outside the frame, or carries no usable box. Pure geometry.
 *
 * The horizontal centre follows the mouth landmark when the detector supplied
 * one (BlazeFace names it `mouthCenter`), so a head turned a little keeps both
 * bands on the face rather than on the background.
 */
export function mouthRegions(
  face: DetectedFace | null | undefined,
  frameWidth: number,
  frameHeight: number
): MouthRegions | null {
  if (!face || !Number.isFinite(frameWidth) || !Number.isFinite(frameHeight)) return null;
  if (frameWidth <= 0 || frameHeight <= 0) return null;

  const box = face.box;
  const boxWidth = box?.width ?? 0;
  const boxHeight = box?.height ?? 0;
  if (!Number.isFinite(boxWidth) || !Number.isFinite(boxHeight)) return null;
  if (boxWidth < MIN_FACE_BOX_PX || boxHeight < MIN_FACE_BOX_PX) return null;

  const boxLeft = box?.xMin ?? 0;
  const boxTop = box?.yMin ?? 0;
  const mouthPoint = face.keypoints?.find(
    (point) => point.name === 'mouthCenter' && Number.isFinite(point.x) && Number.isFinite(point.y)
  );
  const centreX =
    mouthPoint && Number.isFinite(mouthPoint.x)
      ? mouthPoint.x
      : boxLeft + boxWidth / 2;

  const mouthWidth = boxWidth * MOUTH_BAND.width;
  const mouthHeight = boxHeight * MOUTH_BAND.height;
  const referenceHeight = boxHeight * REFERENCE_BAND.height;

  const mouth = clampRect(
    {
      x: centreX - mouthWidth / 2,
      y: boxTop + boxHeight * MOUTH_BAND.centreY - mouthHeight / 2,
      width: mouthWidth,
      height: mouthHeight,
    },
    frameWidth,
    frameHeight
  );
  const reference = clampRect(
    {
      x: centreX - (boxWidth * REFERENCE_BAND.width) / 2,
      y: boxTop + boxHeight * REFERENCE_BAND.centreY - referenceHeight / 2,
      width: boxWidth * REFERENCE_BAND.width,
      height: referenceHeight,
    },
    frameWidth,
    frameHeight
  );

  if (!mouth || !reference) return null;
  return { mouth, reference };
}

/**
 * Mean luminance of every pixel in a rect, row-major. Luma is the usual
 * Rec. 601 weighting: talking changes the mouth's shading, and weighting green
 * most heavily follows how a camera's sensor and the eye both see it.
 *
 * Returns `null` when the rect does not fit the image, so a caller can never
 * read outside the buffer.
 */
export function extractRegion(image: LumaImage, rect: Rect): Float32Array | null {
  const { data, width, height } = image;
  if (!data || width <= 0 || height <= 0) return null;
  if (rect.x < 0 || rect.y < 0) return null;
  if (rect.x + rect.width > width || rect.y + rect.height > height) return null;

  const values = new Float32Array(rect.width * rect.height);
  let index = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    const row = y * width;
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (row + x) * 4;
      values[index] =
        0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
      index += 1;
    }
  }
  return values;
}

/**
 * Mean absolute difference between two same-sized regions, normalised by the
 * luma range so the result is in [0, 1] and independent of the camera's
 * brightness. `null` when the regions cannot be compared (different sizes,
 * empty), which the caller treats as "unmeasurable", never as movement.
 */
export function regionMotion(previous: Float32Array, current: Float32Array): number | null {
  if (previous.length === 0 || previous.length !== current.length) return null;
  let total = 0;
  for (let index = 0; index < previous.length; index += 1) {
    total += Math.abs(current[index] - previous[index]);
  }
  return total / previous.length / 255;
}

export type MouthState = 'still' | 'moving' | 'unmeasurable';

export interface MouthReading {
  state: MouthState;
  mouthMotion: number | null;
  referenceMotion: number | null;
  /** mouthMotion / referenceMotion; `null` when the reference did not move. */
  dominance: number | null;
}

/**
 * Classify one pair of samples. Pure: no clock, no history, no state.
 *
 * A reference band that is completely still would divide by zero, so the
 * dominance test uses `max(reference, MIN_MOTION_FLOOR)` as the denominator —
 * which means a still face needs the full absolute threshold, exactly as
 * intended, and a moving one must beat it by the dominance factor.
 */
export const MIN_MOTION_FLOOR = 0.002;

export function classifyMouthFrame(
  previousMouth: Float32Array | null,
  currentMouth: Float32Array | null,
  previousReference: Float32Array | null,
  currentReference: Float32Array | null
): MouthReading {
  if (!previousMouth || !currentMouth || !previousReference || !currentReference) {
    return { state: 'unmeasurable', mouthMotion: null, referenceMotion: null, dominance: null };
  }
  const mouthMotion = regionMotion(previousMouth, currentMouth);
  const referenceMotion = regionMotion(previousReference, currentReference);
  if (mouthMotion === null || referenceMotion === null) {
    return { state: 'unmeasurable', mouthMotion: null, referenceMotion: null, dominance: null };
  }
  const denominator = Math.max(referenceMotion, MIN_MOTION_FLOOR);
  const dominance = mouthMotion / denominator;
  const talking = mouthMotion >= MOUTH_MOTION_MIN && dominance >= MOUTH_DOMINANCE;
  return {
    state: talking ? 'moving' : 'still',
    mouthMotion,
    referenceMotion,
    dominance,
  };
}

export interface MouthMonitorConfig {
  /** How long talking-shaped motion must be sustained before it is recorded. */
  dwellMs: number;
  /** A continuing episode is recorded again no more often than this. */
  escalationMs: number;
  /** How long the mouth must be still before the episode ends. */
  recoveryMs: number;
  /** A gap longer than this is not counted as observed time. */
  maxSampleGapMs: number;
}

export const MOUTH_MONITOR_CONFIG: MouthMonitorConfig = {
  // Derived from the exam's disclosed `dwell_ms.mouth` at runtime; this is the
  // `standard` tier and the fallback when a server sends none. A sentence and a
  // half is enough to be speech rather than a cough.
  dwellMs: 1_500,
  escalationMs: 20_000,
  // Stillness ends the episode after a pause longer than a breath, but short
  // enough that two spoken answers are two warnings rather than one episode.
  recoveryMs: 1_800,
  // Samples arrive every 200 ms; a longer gap is a throttled tab, not speech.
  maxSampleGapMs: 600,
};

export interface MouthSignal {
  eventType: 'mouth_movement_detected';
  severity: 'medium';
  details: Record<string, unknown>;
}

/**
 * The decision layer, shaped like `FaceMonitor` and `HandMonitor`: sustained
 * motion accumulates, a return must hold before the episode ends, and a
 * continuing episode escalates slowly instead of filling the timeline.
 *
 * Accumulating rather than requiring one contiguous block matters here: speech
 * is *made* of pauses, so a contiguous-dwell rule would never fire. A candidate
 * who talks for two seconds, stops for one, talks for two more is talking for
 * five seconds, and this counts it that way.
 *
 * `unmeasurable` samples neither add time nor end the episode: a face that
 * drifted out of the readable range says nothing about whether the candidate was
 * speaking, and a detector gap must not be spent as evidence either way.
 */
export class MouthMonitor {
  private readonly config: MouthMonitorConfig;
  private state: MouthState = 'unmeasurable';
  private lastReading: MouthReading = {
    state: 'unmeasurable',
    mouthMotion: null,
    referenceMotion: null,
    dominance: null,
  };
  private lastObservedAt: number | null = null;
  private movingMs = 0;
  private lastMovingAt: number | null = null;
  private lastReportedAt: number | null = null;
  private peak = { mouth: 0, reference: 0, dominance: 0, audioActive: false };

  constructor(config: Partial<MouthMonitorConfig> = {}) {
    this.config = { ...MOUTH_MONITOR_CONFIG, ...config };
  }

  get elapsedMs(): number {
    return this.movingMs;
  }

  get stateValue(): MouthState {
    return this.state;
  }

  get reading(): MouthReading {
    return this.lastReading;
  }

  setDwell(dwellMs: number): void {
    if (Number.isFinite(dwellMs) && dwellMs > 0) this.config.dwellMs = dwellMs;
  }

  /**
   * Feed one sample at `now` (ms). `context.audioActive` records whether the
   * voice check also heard something at this moment: it strengthens the evidence
   * for a reviewer (two independent cues agreeing) and changes nothing about the
   * decision, because a silent second person off-camera still has to be caught
   * by the camera alone.
   */
  observe(
    reading: MouthReading,
    now: number,
    context: { audioActive?: boolean } = {}
  ): MouthSignal | null {
    this.lastReading = reading;
    this.state = reading.state;

    const delta =
      this.lastObservedAt === null
        ? 0
        : Math.min(this.config.maxSampleGapMs, Math.max(0, now - this.lastObservedAt));
    this.lastObservedAt = now;

    if (reading.state === 'unmeasurable') return null;

    if (reading.state === 'moving') {
      if (this.lastMovingAt === null) {
        this.movingMs = 0;
        this.lastReportedAt = null;
        this.peak = { mouth: 0, reference: 0, dominance: 0, audioActive: false };
      }
      this.movingMs += delta;
      this.lastMovingAt = now;
      this.peak = {
        mouth: Math.max(this.peak.mouth, reading.mouthMotion ?? 0),
        reference: Math.max(this.peak.reference, reading.referenceMotion ?? 0),
        dominance: Math.max(this.peak.dominance, reading.dominance ?? 0),
        audioActive: this.peak.audioActive || context.audioActive === true,
      };

      if (this.movingMs < this.config.dwellMs) return null;
      if (this.lastReportedAt !== null && now - this.lastReportedAt < this.config.escalationMs) {
        return null;
      }
      this.lastReportedAt = now;
      return {
        eventType: 'mouth_movement_detected',
        severity: 'medium',
        details: {
          dwell_ms: Math.round(this.movingMs),
          // Two motion numbers and a duration. There is no audio, no clip and no
          // transcript anywhere in this path, and this payload says so.
          mouth_motion: Number(this.peak.mouth.toFixed(4)),
          reference_motion: Number(this.peak.reference.toFixed(4)),
          dominance: Number(this.peak.dominance.toFixed(2)),
          threshold: MOUTH_MOTION_MIN,
          audio_active: this.peak.audioActive,
        },
      };
    }

    // Still: a return must hold for the recovery window before the episode ends,
    // so a breath between sentences does not restart the clock.
    if (this.lastMovingAt !== null && now - this.lastMovingAt >= this.config.recoveryMs) {
      this.movingMs = 0;
      this.lastMovingAt = null;
      this.lastReportedAt = null;
      this.peak = { mouth: 0, reference: 0, dominance: 0, audioActive: false };
    }
    return null;
  }

  reset(): void {
    this.state = 'unmeasurable';
    this.lastReading = {
      state: 'unmeasurable',
      mouthMotion: null,
      referenceMotion: null,
      dominance: null,
    };
    this.lastObservedAt = null;
    this.movingMs = 0;
    this.lastMovingAt = null;
    this.lastReportedAt = null;
    this.peak = { mouth: 0, reference: 0, dominance: 0, audioActive: false };
  }
}

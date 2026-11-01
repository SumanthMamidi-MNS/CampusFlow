/**
 * On-device hand-near-face detection for assessment integrity (ADR-029).
 *
 * The gap this closes: face monitoring answers "is someone at the desk?" and
 * device detection answers "is a phone visible?" — but the most common way to
 * read an answer from a phone held below the shot, or from a crib sheet raised
 * to eye level, looks like a *compliant* candidate. The face is present, the
 * head is mostly forward, the camera is alive. What is different is that a hand
 * spends a sustained period at the face, which is what this module measures.
 *
 * Three layers, deliberately separate — the same shape as `face-monitoring.ts`:
 *
 *   1. `handNearFace` — pure geometry. Two landmark sets in, one ratio out.
 *      No model, no clock, no state. Testable with synthetic points.
 *   2. `HandMonitor` — the decision layer: dwell, escalation and recovery. It
 *      owns the clock and emits the server's `hand_near_face` vocabulary.
 *   3. The caller (ExamDelivery) — runs the landmarker and reports.
 *
 * Why this is observation tier and not a violation. Hand proximity has been
 * measured on ordinary webcams but has **no published per-signal false-positive
 * rate**, and its benign causes are constant: scratching, adjusting glasses,
 * resting a chin, holding a tissue, an accessibility need. The matter of drawing
 * attention to the face is also culturally ordinary. Charging a candidate's
 * allowance for that would be indefensible, so
 * `HAND_AUDIO_OBSERVATION_EVENT_TYPES` on the server records it and raises a
 * review while leaving the allowance untouched.
 *
 * What this cannot do, stated plainly:
 *   - It sees only hands that are in the frame. A phone below the desk edge or
 *     behind the laptop is invisible, and so is a crib sheet on a knee.
 *   - It cannot tell a hand from a mug, a phone, a pen or a page, and it does not
 *     try: the event says "a hand was at the face for N seconds", which is what
 *     a reviewer can verify from the attached frame.
 *   - It runs in the candidate's browser, so it is a deterrent and an evidence
 *     trail, never a tamper-proof observer.
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface HandLandmarkSet {
  points: Landmark[];
  /** Detector confidence in [0, 1] when the runtime provides one. */
  score?: number;
}

export interface HandScene {
  /** One entry per detected hand. */
  hands: HandLandmarkSet[];
  /** The candidate's face, as the face detector reported it. */
  face: {
    keypoints: Landmark[];
    box?: { width: number; height: number };
  } | null;
  frameWidth: number;
  frameHeight: number;
}

export type HandCondition =
  /** No hand is in the frame. */
  | 'none'
  /** A hand is visible but not at the face. */
  | 'away'
  /** A hand is at or over the face. */
  | 'at_face'
  /** No usable face reference, so proximity cannot be judged. */
  | 'unmeasurable';

export interface HandReading {
  condition: HandCondition;
  hands: number;
  /** Closest hand-centre distance to the face, as a fraction of face width. */
  proximity: number | null;
}

/**
 * A hand centre this close to the face centre counts as "at the face", in units
 * of face width.
 *
 * One face width is roughly the distance from the chin to the crown, so a hand
 * centred within about half of that is over the mouth/chin/cheek area — the
 * geometry of holding something up to read. Resting a chin on a fist measures
 * near the boundary, which is exactly why the dwell is long and the event is
 * never a violation.
 */
export const HAND_AT_FACE_RATIO = 0.55;

/** Below this many points a hand landmark set is not usable. */
const MIN_HAND_POINTS = 5;

/** Fallback face extent when the detector did not report a box. */
const FACE_WIDTH_FROM_EYE_SPAN = 2.6;

function meanPoint(points: Landmark[]): Landmark | null {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * Estimate the face's extent and centre from the landmarks the face detector
 * already returns. Pure and tolerant: a keypoint set shaped like either the six
 * named BlazeFace points or a bare mesh both reduce to the same measurement.
 */
export function faceExtent(face: HandScene['face']): { centre: Landmark; width: number } | null {
  if (!face) return null;
  if (face.box && face.box.width > 0) {
    const points = face.keypoints.filter(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
    );
    const centre = points.length > 0 ? meanPoint(points) : null;
    if (!centre) return null;
    return { centre, width: face.box.width };
  }

  const points = face.keypoints.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 2) return null;
  const centre = meanPoint(points);
  if (!centre) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  // A six-point face yields a small intra-feature span (eyes and nose only), so
  // it is widened by the known eye-span-to-face-width constant. A mesh yields a
  // span close to the real face, which the same constant slightly over-estimates;
  // both land in the right order of magnitude, and the threshold is coarse on
  // purpose.
  const span = Math.max(maxX - minX, maxY - minY);
  const width = span > 0 ? span * FACE_WIDTH_FROM_EYE_SPAN : 0;
  if (!Number.isFinite(width) || width <= 0) return null;
  return { centre, width };
}

/**
 * Classify one frame. Exported because the delivery surface renders the same
 * condition as status text, and because classification is the part worth
 * testing without a webcam.
 */
export function classifyHands(scene: HandScene, atFaceRatio = HAND_AT_FACE_RATIO): HandReading {
  const hands = (scene.hands ?? []).filter((hand) => hand.points?.length >= MIN_HAND_POINTS);
  const extent = faceExtent(scene.face);

  if (hands.length === 0) return { condition: 'none', hands: 0, proximity: null };
  if (!extent) return { condition: 'unmeasurable', hands: hands.length, proximity: null };

  let closest = Infinity;
  for (const hand of hands) {
    const centre = meanPoint(hand.points);
    if (!centre) continue;
    const distance = Math.hypot(centre.x - extent.centre.x, centre.y - extent.centre.y) / extent.width;
    if (distance < closest) closest = distance;
  }

  if (!Number.isFinite(closest)) return { condition: 'unmeasurable', hands: hands.length, proximity: null };
  return {
    condition: closest <= atFaceRatio ? 'at_face' : 'away',
    hands: hands.length,
    proximity: Number(closest.toFixed(3)),
  };
}

export interface HandMonitorConfig {
  /** How long a hand must stay at the face before it is recorded. */
  dwellMs: number;
  /** A continuing episode is recorded again no more often than this. */
  escalationMs: number;
  /** How long the hand must be away before the episode ends. */
  recoveryMs: number;
  /** A gap longer than this is not counted as observed time. */
  maxSampleGapMs: number;
}

export const HAND_MONITOR_CONFIG: HandMonitorConfig = {
  // Derived from the exam's disclosed `dwell_ms.hand` at runtime; this is the
  // `standard` tier, and the fallback when a server sends none.
  dwellMs: 3_500,
  escalationMs: 20_000,
  recoveryMs: 1_600,
  maxSampleGapMs: 2_000,
};

/**
 * The decision layer, shaped exactly like `FaceMonitor` so the two cannot drift:
 * away time accumulates across a brief blink of the detector, the dwell gates
 * the report, a continuation escalates on a slow cadence, and only a return that
 * holds for `recoveryMs` ends the episode.
 */
export class HandMonitor {
  private readonly config: HandMonitorConfig;
  private condition: HandCondition = 'none';
  private lastReading: HandReading = { condition: 'none', hands: 0, proximity: null };
  private lastObservedAt: number | null = null;
  private awayMs = 0;
  private lastAtFaceAt: number | null = null;
  private lastReportedAt: number | null = null;
  private peak = { proximity: Infinity, hands: 0 };

  constructor(config: Partial<HandMonitorConfig> = {}) {
    this.config = { ...HAND_MONITOR_CONFIG, ...config };
  }

  /** Live dwell, for the status strip's copy. */
  get elapsedMs(): number {
    return this.awayMs;
  }

  get state(): HandCondition {
    return this.condition;
  }

  setDwell(dwellMs: number): void {
    if (Number.isFinite(dwellMs) && dwellMs > 0) this.config.dwellMs = dwellMs;
  }

  /**
   * Feed one frame at `now` (ms). Returns the signal that became due, if any.
   */
  observe(scene: HandScene, now: number): HandSignal | null {
    const reading = classifyHands(scene, HAND_AT_FACE_RATIO);
    this.lastReading = reading;
    this.condition = reading.condition;

    const delta =
      this.lastObservedAt === null
        ? 0
        : Math.min(this.config.maxSampleGapMs, Math.max(0, now - this.lastObservedAt));
    this.lastObservedAt = now;

    // `unmeasurable` is not evidence either way: no face reference, so the
    // geometry says nothing about the hand. It is treated as neither a hand at
    // the face nor a return, so a candidate cannot clear the episode by hiding
    // the reference the measurement depends on.
    if (reading.condition === 'at_face') {
      if (this.lastAtFaceAt === null) {
        this.awayMs = 0;
        this.lastReportedAt = null;
        this.peak = { proximity: reading.proximity ?? Infinity, hands: reading.hands };
      }
      this.awayMs += delta;
      this.lastAtFaceAt = now;
      if (reading.proximity !== null && reading.proximity < this.peak.proximity) {
        this.peak = { proximity: reading.proximity, hands: reading.hands };
      }

      if (this.awayMs < this.config.dwellMs) return null;
      if (this.lastReportedAt !== null && now - this.lastReportedAt < this.config.escalationMs) {
        return null;
      }
      this.lastReportedAt = now;
      return {
        eventType: 'hand_near_face',
        severity: 'medium',
        details: {
          dwell_ms: Math.round(this.awayMs),
          proximity: Number.isFinite(this.peak.proximity) ? this.peak.proximity : null,
          hands: this.peak.hands,
          threshold: HAND_AT_FACE_RATIO,
        },
      };
    }

    if (reading.condition === 'unmeasurable') return null;

    // `none` or `away`: a return must hold for the recovery window.
    if (this.lastAtFaceAt !== null && now - this.lastAtFaceAt >= this.config.recoveryMs) {
      this.awayMs = 0;
      this.lastAtFaceAt = null;
      this.lastReportedAt = null;
      this.peak = { proximity: Infinity, hands: 0 };
    }
    return null;
  }

  /** Latest reading, for the status copy and diagnostics. */
  get reading(): HandReading {
    return this.lastReading;
  }

  reset(): void {
    this.condition = 'none';
    this.lastReading = { condition: 'none', hands: 0, proximity: null };
    this.lastObservedAt = null;
    this.awayMs = 0;
    this.lastAtFaceAt = null;
    this.lastReportedAt = null;
    this.peak = { proximity: Infinity, hands: 0 };
  }
}

export interface HandSignal {
  eventType: 'hand_near_face';
  severity: 'medium';
  details: Record<string, unknown>;
}

/** 
 * The minimum a hand landmarker must provide, so the caller can be handed either
 * the MediaPipe task or a stand-in without this module importing it eagerly.
 */
export interface HandLandmarker {
  /** Returns hands in analysed-frame pixels, with the frame it measured. */
  detect(input: CanvasImageSource): Promise<{ hands: HandLandmarkSet[]; width: number; height: number }>;
  dispose?: () => void;
}

/** Longest edge handed to the landmarker; it resizes internally anyway. */
const HAND_MAX_EDGE = 480;

/**
 * Load MediaPipe's hand landmarker lazily.
 *
 * The WASM bundle and the model both come from the package/CDN at first use, so
 * a blocked network is a normal institutional outcome: the caller reports the
 * check as unavailable rather than pretending it is running. `numHands: 2`
 * because a second hand at the face is as interesting as the first.
 */
export async function loadHandLandmarker(): Promise<HandLandmarker> {
  const vision = await import('@mediapipe/tasks-vision');
  const fileset = await vision.FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm'
  );
  const task = await vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  let lastTimestamp = 0;
  // One private canvas: MediaPipe returns normalised coordinates, and the
  // classifier compares hands against face landmarks measured in pixels, so the
  // coordinates have to be rescaled to something the two share.
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  return {
    async detect(input) {
      const source = input as HTMLVideoElement;
      const width = source.videoWidth || source.width;
      const height = source.videoHeight || source.height;
      if (!width || !height || !context) return { hands: [], width: 0, height: 0 };

      const scale = Math.min(1, HAND_MAX_EDGE / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      // The task requires a monotonic timestamp; a repeated one throws.
      lastTimestamp = Math.max(lastTimestamp + 1, Math.round(performance.now()));
      const result = task.detectForVideo(canvas, lastTimestamp);
      return {
        hands: (result.landmarks ?? []).map((points) => ({
          points: points.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height })),
        })),
        width: canvas.width,
        height: canvas.height,
      };
    },
    dispose: () => task.close(),
  };
}

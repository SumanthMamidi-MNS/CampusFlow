/**
 * On-device face and head-direction monitoring for assessment integrity.
 *
 * The gap this closes: every other integrity signal in the pipeline answers
 * "did you leave the paper?" (tab, window, full-screen) or "is the camera
 * alive?" (track lost, lens covered). None of them answer "are you still
 * looking at your own paper?" — which is what a candidate does when they turn
 * to someone else's screen or a sheet of notes beside them with the camera
 * still running.
 *
 * Two layers, deliberately separate:
 *
 *   1. `estimateHeadPose` — pure geometry over face landmarks.
 *      No model, no thresholds, no state: given a face it returns an angle.
 *   2. `FaceMonitor` — the decision layer. It owns dwell and escalation and
 *      emits the same event vocabulary the server already validates.
 *
 * The split matters because the model cannot be exercised in CI (it needs a
 * webcam and a 6 MB weight download) but both layers' *decisions* can be, with
 * synthetic landmark sets and a synthetic clock. See the verification harness
 * noted in `docs/development.md`.
 *
 * How the angle is derived. The detector gives the nose tip and both eye
 * centres. Take the nose tip's horizontal offset from the midpoint of the two
 * eyes, in units of the eye distance — a
 * ratio that is invariant to how far the candidate sits from the lens and to
 * the analysed frame's resolution. For a head yawed by θ, that ratio is
 * approximately (nose depth / eye span) · tan θ, so the angle inverts cleanly:
 *
 *     yaw = atan(ratio / NOSE_DEPTH_RATIO)
 *
 * The ratio also self-corrects for foreshortening: the eye span shrinks with
 * cos θ exactly as the nose offset grows with tan θ. `NOSE_DEPTH_RATIO` is the
 * one empirical constant (nose prominence ~30 mm against a ~90 mm eye span);
 * it sets the angle's scale, not the direction, and the enforcement threshold
 * sits far enough out that the constant's error cannot flip a verdict at the
 * boundary.
 *
 * What this cannot do, stated plainly:
 *   - It sees the face, not the room. A candidate who turns their whole body
 *     and screen keeps a frontal face and is not detected here; that needs the
 *     invigilator or a second camera.
 *   - It runs in the candidate's browser, so it is a deterrent and an evidence
 *     trail, not a tamper-proof observer. A modified client can suppress its
 *     own reports. The server never treats one signal as a verdict.
 *   - Glasses glare, backlighting and extreme skin-tone/lighting contrasts can
 *     cost detection. Dwell times and the "unreadable" state exist so a bad
 *     frame is not a punishment.
 */
import type * as faceDetection from '@tensorflow-models/face-detection';

export interface FaceKeypoint {
  x: number;
  y: number;
  z?: number;
  name?: string;
}

export interface FaceBox {
  xMin: number;
  yMin: number;
  xMax?: number;
  yMax?: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  keypoints: FaceKeypoint[];
  box?: FaceBox;
}

/**
 * The three landmarks this module reads, by the names the detector returns.
 *
 * `rightEye` is the candidate's own right eye, which appears on the image's
 * left because the integrity frame is deliberately not mirrored — that is what
 * makes the direction below the candidate's left/right rather than the
 * viewer's.
 *
 * The mesh indices are the fallback for a detector that returns a bare 468-point
 * mesh (nose tip, right eye corner, left eye corner) instead of the six named
 * points BlazeFace produces. Supporting both keeps the calibration below honest:
 * whichever source is installed, the landmarks mean the same thing.
 */
export const FACE_KEYPOINTS = {
  nose: { name: 'noseTip', meshIndex: 1 },
  rightEye: { name: 'rightEye', meshIndex: 33 },
  leftEye: { name: 'leftEye', meshIndex: 263 },
} as const;

/**
 * Nose prominence divided by the full eye span: roughly 32 mm of nose ahead of
 * the eye plane against a ~63 mm pupillary distance. Only the *scale* of the
 * angle depends on it; direction does not. A different landmark pair (outer eye
 * corners instead of eye centres) moves this towards 1/3, which is why it is
 * one named constant rather than a literal in the geometry.
 */
export const NOSE_DEPTH_RATIO = 0.5;

/** Below this the eyes are too few pixels apart to measure an angle. */
export const MIN_EYE_SPAN_PX = 8;

/** A face narrower than this fraction of the frame is not trackable. */
export const MIN_FACE_WIDTH_RATIO = 0.08;

export type HeadDirection = 'left' | 'right';

export interface HeadPose {
  /** Absolute yaw in degrees, 0 = facing the lens. */
  yawDegrees: number;
  /** Which way the candidate is facing, in their own terms. */
  direction: HeadDirection;
  /** Eye-corner distance in analysed-frame pixels (diagnostics). */
  eyeSpan: number;
  /** Face width as a fraction of the frame width (diagnostics). */
  faceWidthRatio: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Yaw for one detected face, or `null` when the face is not measurable — no
 * box, too small, or a landmark set that does not carry the mesh indices.
 *
 * Pure: same input, same output, no clock, no config, no side effects.
 */
function pickKeypoint(
  keypoints: FaceKeypoint[],
  spec: { name: string; meshIndex: number }
): FaceKeypoint | undefined {
  const named = keypoints.find((point) => point.name === spec.name);
  if (named) return named;
  return keypoints.length > spec.meshIndex ? keypoints[spec.meshIndex] : undefined;
}

export function estimateHeadPose(face: DetectedFace, frameWidth: number): HeadPose | null {
  const keypoints = face.keypoints;
  if (!keypoints || keypoints.length < 3) return null;
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) return null;

  const nose = pickKeypoint(keypoints, FACE_KEYPOINTS.nose);
  const rightEye = pickKeypoint(keypoints, FACE_KEYPOINTS.rightEye);
  const leftEye = pickKeypoint(keypoints, FACE_KEYPOINTS.leftEye);
  if (!nose || !rightEye || !leftEye) return null;
  if (![nose.x, nose.y, rightEye.x, rightEye.y, leftEye.x, leftEye.y].every(Number.isFinite)) {
    return null;
  }

  const eyeSpan = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  const faceWidthRatio = face.box?.width ? face.box.width / frameWidth : 1;
  if (eyeSpan < MIN_EYE_SPAN_PX || faceWidthRatio < MIN_FACE_WIDTH_RATIO) return null;

  // Horizontal offset of the nose tip from the eye midpoint, in eye spans.
  const offset = (nose.x - (rightEye.x + leftEye.x) / 2) / eyeSpan;
  // tan θ is unbounded; clamp well before the profile so a nonsense landmark
  // pair reports "fully turned" instead of 89.9°/-89.9° oscillation.
  const tanYaw = clamp(offset / NOSE_DEPTH_RATIO, -6, 6);
  const yawDegrees = (Math.atan(tanYaw) * 180) / Math.PI;

  return {
    yawDegrees,
    // Negative offset = nose moved toward the image's left = the candidate
    // turned to their own right.
    direction: yawDegrees < 0 ? 'right' : 'left',
    eyeSpan,
    faceWidthRatio,
  };
}

export type FaceCondition =
  /** One measurable face, looking at the paper. */
  | 'ok'
  /** Head yawed past the threshold, sustained. */
  | 'turned_left'
  | 'turned_right'
  /** No face in the frame at all: left the seat, or the lens is blocked. */
  | 'no_face'
  /** Two or more faces: someone else is at the desk. */
  | 'multiple_faces'
  /** A face is present but not measurable (too far, glare, partial view). */
  | 'unreadable';

export type FaceIntegrityEvent =
  | 'looking_away'
  | 'face_not_visible'
  | 'multiple_faces_detected';

export interface FaceScene {
  faces: DetectedFace[];
  frameWidth: number;
  frameHeight: number;
}

export interface FaceSignal {
  eventType: FaceIntegrityEvent;
  severity: 'medium' | 'high';
  details: Record<string, unknown>;
}

export interface FaceMonitorConfig {
  /** Sustained yaw at or beyond this angle counts as looking away. */
  turnThresholdDegrees: number;
  /** How long the head must stay turned before it is reported. */
  turnDwellMs: number;
  /** How long no face must be visible before it is reported. */
  absenceDwellMs: number;
  /** How long a second face must be visible before it is reported. */
  multipleDwellMs: number;
  /**
   * While a condition persists, it is reported again on this cadence. Without
   * it, a candidate could turn away for the rest of the paper for the price of
   * one event; with it, every twenty seconds of not being observed costs one.
   */
  escalationMs: number;
  /**
   * How long the candidate must be back at the paper before the episode ends.
   * A single good frame between two turns is not a return: the away time keeps
   * accumulating, so flickering between "turned" and "no face" (or glancing
   * back for a fraction of a second) cannot reset the dwell and evade it.
   */
  recoveryMs: number;
  /**
   * A gap longer than this between two observations is not counted as observed
   * time. A backgrounded tab throttles its timers to a crawl; without the cap a
   * single late frame would manufacture minutes of "away" time at once.
   */
  maxSampleGapMs: number;
  /** Minimum faces the model is asked for; two is what makes "someone else" detectable. */
  maxFaces: number;
}

export const FACE_MONITOR_CONFIG: FaceMonitorConfig = {
  // 50° is a genuine profile turn, not a glance at a second monitor. The nose
  // has clearly crossed the eye line at this angle, which the geometry above
  // measures unambiguously.
  turnThresholdDegrees: 50,
  // Two seconds: long enough to ignore scratching an ear or glancing at a
  // clock, short enough that copying a sentence from a neighbouring screen is
  // reported while it is happening.
  turnDwellMs: 2_000,
  // Three seconds: a candidate reaching for paper may leave the frame briefly.
  absenceDwellMs: 3_000,
  multipleDwellMs: 1_500,
  escalationMs: 20_000,
  // More than two scan intervals: one intervening good frame between two turns
  // is not a return, so the away tally survives it. Short enough that a real
  // return still ends the episode within a couple of scans.
  recoveryMs: 1_600,
  // Comfortably above the 700 ms scan cadence and below the 3 s absence dwell.
  maxSampleGapMs: 2_000,
  maxFaces: 3,
};

/** Dwell before a condition is reported; `ok` and `unreadable` never report. */
function dwellFor(condition: FaceCondition, config: FaceMonitorConfig): number {
  switch (condition) {
    case 'turned_left':
    case 'turned_right':
      return config.turnDwellMs;
    case 'no_face':
      return config.absenceDwellMs;
    case 'multiple_faces':
      return config.multipleDwellMs;
    default:
      return 0;
  }
}

export interface FaceReading {
  condition: FaceCondition;
  faces: number;
  pose: HeadPose | null;
}

/**
 * Classify one frame. Exported because the component renders the same
 * condition as status text, and because classification is the part worth
 * testing on its own.
 */
export function classifyScene(scene: FaceScene, config = FACE_MONITOR_CONFIG): FaceReading {
  const faces = scene.faces ?? [];
  if (faces.length >= 2) {
    const poses = faces
      .map((face) => estimateHeadPose(face, scene.frameWidth))
      .filter((pose): pose is HeadPose => pose !== null);
    // The most turned face is the one worth naming in the evidence.
    const pose = poses.sort((a, b) => Math.abs(b.yawDegrees) - Math.abs(a.yawDegrees))[0] ?? null;
    return { condition: 'multiple_faces', faces: faces.length, pose };
  }

  if (faces.length === 0) return { condition: 'no_face', faces: 0, pose: null };

  const pose = estimateHeadPose(faces[0], scene.frameWidth);
  if (!pose) return { condition: 'unreadable', faces: 1, pose: null };
  if (pose.yawDegrees <= -config.turnThresholdDegrees) {
    return { condition: 'turned_right', faces: 1, pose };
  }
  if (pose.yawDegrees >= config.turnThresholdDegrees) {
    return { condition: 'turned_left', faces: 1, pose };
  }
  return { condition: 'ok', faces: 1, pose };
}

function signalFor(reading: FaceReading, dwellMs: number): FaceSignal | null {
  switch (reading.condition) {
    case 'turned_left':
    case 'turned_right':
      return {
        eventType: 'looking_away',
        severity: 'medium',
        details: {
          direction: reading.condition === 'turned_left' ? 'left' : 'right',
          yaw_degrees: reading.pose ? Math.round(Math.abs(reading.pose.yawDegrees)) : null,
          eye_span_px: reading.pose ? Math.round(reading.pose.eyeSpan) : null,
          dwell_ms: dwellMs,
        },
      };
    case 'no_face':
      return {
        eventType: 'face_not_visible',
        severity: 'high',
        details: { reason: 'no_face_in_view', dwell_ms: dwellMs },
      };
    case 'multiple_faces':
      return {
        eventType: 'multiple_faces_detected',
        severity: 'high',
        details: { faces: reading.faces, dwell_ms: dwellMs },
      };
    default:
      return null;
  }
}

function isBadCondition(condition: FaceCondition): boolean {
  return (
    condition === 'turned_left' ||
    condition === 'turned_right' ||
    condition === 'no_face' ||
    condition === 'multiple_faces'
  );
}

/**
 * The decision layer: turns a stream of per-frame readings into the small
 * number of events worth recording.
 *
 * Rules, in one place so the behaviour cannot drift between surfaces:
 *   - away time **accumulates** across a brief return. A flicker to "ok" (or a
 *     switch between "turned" and "no face") does not reset the clock; only a
 *     return that holds for `recoveryMs` ends the episode. This is what stops a
 *     candidate from turning for 1.9 s, glancing back for a frame, and turning
 *     again — the classic way a contiguous-dwell detector is defeated;
 *   - a condition must reach its dwell before it is reported or covers the
 *     paper, so a blink, a dropped frame or a head scratch is not an event;
 *   - after the dwell it is reported again only on the escalation cadence, so
 *     ten minutes turned away is a handful of events rather than thousands;
 *   - `unreadable` (a face present but too small, glaring or partly hidden) is
 *     never counted as away time: a bad frame must not punish anyone. Once the
 *     paper is covered it lifts only after the candidate has faced it for the
 *     recovery window, so a one-frame glance cannot dismiss it either;
 *   - the class holds no timers of its own: `observe(scene, now)` takes the
 *     clock, which is what makes the escalation testable without waiting.
 */
export class FaceMonitor {
  private readonly config: FaceMonitorConfig;
  private condition: FaceCondition = 'unreadable';
  private lastReading: FaceReading = { condition: 'unreadable', faces: 0, pose: null };
  /** Previous observation time, for the accumulated-dwell delta. */
  private lastObservedAt: number | null = null;
  /** Away time accumulated in the current episode, in milliseconds. */
  private awayMs = 0;
  /** When the candidate was last actually seen away from the paper. */
  private lastAwayAt: number | null = null;
  /** The condition the candidate must return from, for the gate copy. */
  private coveredAs: FaceCondition | null = null;
  private lastReportedAt: number | null = null;

  constructor(config: FaceMonitorConfig = FACE_MONITOR_CONFIG) {
    this.config = config;
  }

  /**
   * Instantaneous condition, for the candidate-facing status strip. This is not
   * what covers the paper: a single frame is never enough for that.
   */
  get state(): FaceCondition {
    return this.condition;
  }

  /**
   * The confirmed condition that should cover the paper, or `null` when the
   * candidate has not yet been away long enough for it to count. Set at the
   * dwell and cleared on a real return, so the cover cannot flicker with the
   * detector and cannot be dismissed by glancing back for a moment.
   */
  get gate(): FaceCondition | null {
    return this.coveredAs;
  }

  /** Latest reading, for diagnostics and for the status copy. */
  get reading(): FaceReading {
    return this.lastReading;
  }

  /**
   * Adopt the dwell values the exam disclosed before the paper started.
   *
   * The server owns the tier (`relaxed` / `standard` / `strict`) and sends the
   * milliseconds with the delivery; the client then enforces exactly what the
   * candidate was told rather than a constant compiled into this module
   * (ADR-029). Partial input is fine: anything absent keeps its default.
   */
  setDwell(dwell: { turn?: number; absence?: number }): void {
    if (typeof dwell.turn === 'number' && dwell.turn > 0) {
      this.config.turnDwellMs = dwell.turn;
    }
    if (typeof dwell.absence === 'number' && dwell.absence > 0) {
      this.config.absenceDwellMs = dwell.absence;
    }
  }

  /**
   * Feed one frame at `now` (ms). Returns the signals that became due on this
   * frame — usually none.
   */
  observe(scene: FaceScene, now: number): FaceSignal[] {
    const reading = classifyScene(scene, this.config);
    this.lastReading = reading;
    this.condition = reading.condition;

    // Time since the previous observation, capped so a throttled or suspended
    // tab cannot manufacture away time in one leap.
    const delta =
      this.lastObservedAt === null
        ? 0
        : clamp(now - this.lastObservedAt, 0, this.config.maxSampleGapMs);
    this.lastObservedAt = now;

    if (isBadCondition(reading.condition)) {
      // A fresh episode starts only after a real return (which clears the
      // episode below), never from elapsed time alone: a scan pause must not
      // wipe away time the candidate has already accrued.
      if (this.lastAwayAt === null) {
        this.awayMs = 0;
        this.lastReportedAt = null;
      }
      this.awayMs += delta;
      this.lastAwayAt = now;

      const dwellMs = dwellFor(reading.condition, this.config);
      if (this.awayMs < dwellMs) return [];

      this.coveredAs = reading.condition;
      if (this.lastReportedAt !== null && now - this.lastReportedAt < this.config.escalationMs) {
        return [];
      }
      const signal = signalFor(reading, this.awayMs);
      if (!signal) return [];
      this.lastReportedAt = now;
      return [signal];
    }

    // Facing the paper is the proof of return, but one frame is not proof: the
    // cover is held until that return has lasted for the recovery window, so a
    // glance back cannot dismiss it. An unmeasurable frame is not proof either
    // way and is handled the same way rather than flashing the cover away.
    if (this.lastAwayAt !== null && now - this.lastAwayAt >= this.config.recoveryMs) {
      this.awayMs = 0;
      this.lastAwayAt = null;
      this.coveredAs = null;
      this.lastReportedAt = null;
    }
    return [];
  }

  /** Forget the current episode — used when the camera restarts or scan stops. */
  reset(): void {
    this.condition = 'unreadable';
    this.lastReading = { condition: 'unreadable', faces: 0, pose: null };
    this.lastObservedAt = null;
    this.awayMs = 0;
    this.lastAwayAt = null;
    this.coveredAs = null;
    this.lastReportedAt = null;
  }
}

/** What the detector returns and the only method this module calls on it. */
export interface FaceDetector {
  estimateFaces(
    input: HTMLCanvasElement,
    config?: { flipHorizontal?: boolean }
  ): Promise<DetectedFace[]>;
}

/**
 * Load the detector lazily. Weights come from the model host at first use, so a
 * blocked network is a normal institutional outcome: the caller treats a
 * rejection as "face monitoring unavailable" and the assessment continues.
 *
 * BlazeFace rather than the 468-point mesh on purpose. The decision here needs
 * three landmarks and a face count; the mesh costs roughly six times the model
 * download and several times the inference for precision this rule cannot use,
 * at a scan cadence that has to leave the candidate's own machine responsive.
 */
export async function loadFaceDetector(
  maxFaces: number = FACE_MONITOR_CONFIG.maxFaces
): Promise<FaceDetector> {
  const [tf, faceModel] = await Promise.all([
    import('@tensorflow/tfjs'),
    import('@tensorflow-models/face-detection'),
  ]);
  await tf.ready();
  const createDetector = (faceModel as typeof faceDetection).createDetector;
  const detector = await createDetector(faceModel.SupportedModels.MediaPipeFaceDetector, {
    runtime: 'tfjs',
    maxFaces,
  });
  return detector as unknown as FaceDetector;
}

/**
 * On-device prohibited-device detection for examination integrity (ADR-024).
 *
 * Everything here runs inside the candidate's own browser. Frames are drawn from
 * the existing preview element into a small canvas and analysed locally, so no
 * video leaves the machine for analysis and the server never receives a stream.
 * Two models are used because they answer different questions:
 *
 *   - COCO-SSD *localises* a `cell phone`. A bounding box is what makes a phone
 *     report reviewable rather than a guess about the whole frame, and phones are
 *     the category a webcam can actually see at examination distance.
 *   - MobileNet *classifies* the frame against the ImageNet electronics classes
 *     (`earphone`, `digital watch`) that COCO does not carry. Earbuds and watches
 *     are small and often partially visible, so this signal is the weaker one and
 *     is reported as such.
 *
 * A positive here is a *probable* device, never proof. The caller records it as an
 * observation that raises faculty review; it cannot fail a candidate and it never
 * consumes their warning allowance (the server enforces both, see ADR-024).
 *
 * What a single webcam fundamentally cannot do: see a phone under a desk, in a
 * pocket, off-frame, or a device held by someone else. Those limitations are
 * disclosed rather than papered over.
 *
 * The thresholds and the confirmation count below are defaults measured against
 * a documented labelled set by `frontend/scripts/measure-device-detection.js`
 * (procedure in `docs/development.md`). The numbers that harness prints are the
 * only accuracy claims this project may make; the sample it scores is still
 * stills from COCO val2017, not recorded exam footage, so the measurement bounds
 * the detector's behaviour rather than promising field performance.
 */
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';
import type { MobileNet } from '@tensorflow-models/mobilenet';

export type DeviceCategory = 'mobile_phone' | 'earbuds' | 'smartwatch';

export interface DeviceModelConfig {
  /**
   * Minimum COCO-SSD score for a `cell phone` box to count. Phones are a well
   * represented COCO class, so the bar can sit high: a false positive here sends
   * a candidate to faculty review, which is the costlier mistake.
   */
  phoneScore: number;
  /**
   * Minimum box area as a fraction of the analysed frame. Below this the "phone"
   * is a few pixels of noise rather than an object being held up.
   */
  phoneMinAreaRatio: number;
  /** Minimum MobileNet probability for an electronics class to count. */
  classifierScore: number;
  /**
   * Consecutive positive scans required before an observation is reported. One
   * lucky frame is not a device: this is the temporal filter that stops a
   * reflection, a single flicker or a model wobble raising a review.
   */
  confirmations: number;
}

export const DEVICE_MODEL_CONFIG: DeviceModelConfig = {
  phoneScore: 0.6,
  phoneMinAreaRatio: 0.02,
  classifierScore: 0.5,
  confirmations: 3,
};

export interface DeviceObservation {
  category: DeviceCategory;
  /** Model confidence in [0, 1]. */
  confidence: number;
  /** Which model produced it, so faculty can weigh the signal. */
  model: 'coco-ssd' | 'mobilenet';
  /** `[x, y, width, height]` in analysed-frame pixels, when localised. */
  bbox?: [number, number, number, number];
  /** How many consecutive scans agreed before this was reported. */
  confirmations?: number;
}

export interface DeviceModels {
  coco: ObjectDetection;
  net: MobileNet;
}

/** Longest edge of the frame handed to the models. Downscaling is what keeps a
 *  scan cheap enough to run on a laptop while the assessment is open. */
export const ANALYSED_FRAME_MAX_EDGE = 480;

/**
 * Map a MobileNet (ImageNet) label onto a prohibited-device category.
 *
 * Matched on tokens rather than an exact string because the label list carries
 * several spellings for the same thing (`cellular telephone`, `earphone`,
 * `digital watch`, `wrist watch`). Unknown labels are ignored, never guessed.
 */
export function categoriseClassifierLabel(label: string): DeviceCategory | null {
  const text = label.toLowerCase();
  if (text.includes('telephone') || text.includes('cellular phone')) return 'mobile_phone';
  if (text.includes('earphone') || text.includes('headphone') || text.includes('earbud')) {
    return 'earbuds';
  }
  if (text.includes('watch') && !text.includes('stopwatch')) return 'smartwatch';
  return null;
}

/** COCO-SSD's own class name for a phone. */
export const COCO_PHONE_CLASS = 'cell phone';

/**
 * Load both models. Called lazily — only when an exam enables detection — so an
 * ordinary exam page never pays for a model download. Weights come from the
 * TensorFlow.js CDN; a blocked or offline network is a normal outcome in an
 * institution, so the caller must treat a rejection as "scan unavailable" and
 * carry on rather than failing the assessment.
 */
export async function loadDeviceModels(): Promise<DeviceModels> {
  const [tf, cocoSsd, mobilenet] = await Promise.all([
    import('@tensorflow/tfjs'),
    import('@tensorflow-models/coco-ssd'),
    import('@tensorflow-models/mobilenet'),
  ]);
  await tf.ready();
  const [coco, net] = await Promise.all([
    cocoSsd.load({ base: 'lite_mobilenet_v2' }),
    mobilenet.load({ version: 2, alpha: 0.5 }),
  ]);
  return { coco, net };
}

/** Draw a video frame down to the analysed size, or null when there is nothing
 *  to analyse yet (no frames arrived, or the element is detached). */
export function frameForAnalysis(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxEdge = ANALYSED_FRAME_MAX_EDGE
): HTMLCanvasElement | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
  return canvas;
}

/**
 * Run one scan of the frame. Pure inference: no state, no events, no thresholds
 * hidden from the caller's configuration.
 */
export interface AnalysisOptions {
  /**
   * Consult the wearable classifier as well as the phone detector. The
   * classifier is a second full model per scan, so a caller on modest hardware
   * can run it less often than the phone detector — measured on a
   * software-rendered browser, one pass over both models took several seconds.
   */
  includeWearables?: boolean;
}

export async function analyseFrame(
  models: DeviceModels,
  frame: HTMLCanvasElement,
  config: DeviceModelConfig = DEVICE_MODEL_CONFIG,
  options: AnalysisOptions = {}
): Promise<DeviceObservation[]> {
  const { includeWearables = true } = options;
  const frameArea = frame.width * frame.height;
  const observations: DeviceObservation[] = [];

  const predictions = await models.coco.detect(frame, 10);
  for (const prediction of predictions) {
    if (prediction.class !== COCO_PHONE_CLASS) continue;
    if (prediction.score < config.phoneScore) continue;
    const [x, y, width, height] = prediction.bbox as [number, number, number, number];
    if (frameArea > 0 && (width * height) / frameArea < config.phoneMinAreaRatio) continue;
    observations.push({
      category: 'mobile_phone',
      confidence: prediction.score,
      model: 'coco-ssd',
      bbox: [x, y, width, height],
    });
  }

  // The classifier answers "what is in this frame", not "where"; it is only
  // consulted for the smaller wearables COCO has no class for.
  if (!includeWearables) return observations.sort((a, b) => b.confidence - a.confidence);

  const classes = await models.net.classify(frame, 5);
  for (const entry of classes) {
    const category = categoriseClassifierLabel(entry.className);
    if (!category || entry.probability < config.classifierScore) continue;
    // A phone already localised by COCO-SSD is the stronger signal; do not
    // downgrade it to a whole-frame guess.
    if (observations.some((o) => o.category === category)) continue;
    observations.push({ category, confidence: entry.probability, model: 'mobilenet' });
  }

  return observations.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Requires several consecutive agreeing scans before a device is reported, and
 * reports each incident once: a device left on the desk for ten minutes is one
 * observation, not two hundred.
 */
export class DeviceConfirmationTracker {
  private streak = new Map<DeviceCategory, number>();
  private readonly required: number;

  constructor(required: number = DEVICE_MODEL_CONFIG.confirmations) {
    this.required = required;
  }

  /** Feed one scan; returns the observation that just became confirmed, if any. */
  observe(found: DeviceObservation[]): DeviceObservation | null {
    const present = new Map(found.map((o) => [o.category, o]));
    for (const category of [...this.streak.keys()]) {
      if (!present.has(category)) this.streak.delete(category);
    }

    let confirmed: DeviceObservation | null = null;
    for (const [category, observation] of present) {
      const count = (this.streak.get(category) ?? 0) + 1;
      this.streak.set(category, count);
      if (count === this.required && !confirmed) {
        confirmed = { ...observation, confirmations: count };
      }
    }
    return confirmed;
  }

  /** Forget all streaks — used when the camera restarts or the scan stops. */
  reset(): void {
    this.streak.clear();
  }
}

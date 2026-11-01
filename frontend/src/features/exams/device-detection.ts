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
 * observation that raises faculty review, and — once the same reading repeats
 * across consecutive scans — it spends one of the warnings the candidate was told
 * about (D-31). It never fails a candidate by itself: the server counts the
 * warning, the lecturer decides what it means.
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

export type DeviceCategory = 'mobile_phone' | 'earbuds' | 'smartwatch' | 'remote_control';

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
  /** Minimum COCO-SSD score for a `remote` box to count. */
  remoteScore: number;
  /** Minimum box area for a remote control, as a fraction of the frame. */
  remoteMinAreaRatio: number;
  /** Minimum MobileNet probability for an electronics class to count. */
  classifierScore: number;
  /**
   * Minimum probability for a wearable found in a *wrist crop*. Higher than the
   * whole-frame bar is not the rule — lower is: a crop that contains mostly
   * wrist gives the classifier far less to confuse it with, so the same
   * probability means more there. 0.45 was chosen so a watch face still has to
   * be the dominant object in its own crop.
   */
  wristScore: number;
  /**
   * Consecutive positive scans required before an observation is reported. One
   * lucky frame is not a device: this is the temporal filter that stops a
   * reflection, a single flicker or a model wobble raising a review.
   */
  confirmations: number;
}

// Tuned for a phone actually being held up at exam distance rather than for a
// staged still: a handset held to the ear is small in a 480 px frame and COCO's
// score drops with it, and the previous bar meant a phone raised beside the face
// produced nothing at all. Two consecutive positive scans (not three) still stop
// one lucky frame from becoming a warning.
export const DEVICE_MODEL_CONFIG: DeviceModelConfig = {
  phoneScore: 0.42,
  phoneMinAreaRatio: 0.006,
  remoteScore: 0.45,
  remoteMinAreaRatio: 0.006,
  classifierScore: 0.4,
  wristScore: 0.4,
  confirmations: 2,
};

export interface DeviceObservation {
  category: DeviceCategory;
  /** Model confidence in [0, 1]. */
  confidence: number;
  /** Which model produced it, so faculty can weigh the signal. */
  model: 'coco-ssd' | 'mobilenet';
  /**
   * Where the evidence came from. A wrist crop is the strong read for a watch; a
   * whole-frame read is the weak one and is labelled as such for the reviewer.
   */
  region?: 'frame' | 'wrist';
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
  if (text.includes('remote control')) return 'remote_control';
  return null;
}

/** COCO-SSD's own class name for a phone. */
export const COCO_PHONE_CLASS = 'cell phone';

/** COCO-SSD carries remotes, which is what a candidate presses a second device with. */
export const COCO_REMOTE_CLASS = 'remote';

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
 * A wrist-sized crop, given as normalised coordinates so it survives any
 * resizing between the frame the hand landmarker measured and the frame the
 * device models analyse.
 */
export interface WristPoint {
  /** Wrist landmark, 0–1 across the frame. */
  x: number;
  y: number;
  /** Wrist-to-middle-knuckle distance, 0–1: how big the hand is on screen. */
  span: number;
}

/** How much of the hand's span the wrist crop covers, and how far it reaches up
 *  the forearm from the wrist point. A watch sits on the wrist and a little
 *  above it, so the crop is biased toward the arm rather than the palm. */
export const WRIST_CROP = { size: 1.9, armOffset: 0.45 } as const;

/**
 * Turn a normalised wrist landmark into an analysed-frame rect, or `null` when
 * the hand is too small or the point is outside the frame. Pure.
 *
 * Biasing the crop up the forearm matters: a hand raised toward the face puts
 * the palm, not the watch, at the landmark, and a symmetric crop would spend
 * most of its pixels on fingers.
 */
/** A hand narrower than this many pixels cannot carry a resolvable watch crop. */
export const MIN_WRIST_SPAN_PX = 12;

export function wristCropFromNormalised(
  wrist: WristPoint,
  frameWidth: number,
  frameHeight: number
): [number, number, number, number] | null {
  if (!Number.isFinite(wrist.x) || !Number.isFinite(wrist.y)) return null;
  if (!Number.isFinite(wrist.span) || wrist.span <= 0) return null;
  if (frameWidth <= 0 || frameHeight <= 0) return null;
  if (wrist.x < 0 || wrist.x > 1 || wrist.y < 0 || wrist.y > 1) return null;
  // A hand a dozen pixels across is a speck: the crop would be upscaled
  // interpolated background, and the classifier would be shown noise.
  if (wrist.span * frameWidth < MIN_WRIST_SPAN_PX) return null;

  const size = Math.max(16, Math.round(wrist.span * frameWidth * WRIST_CROP.size));
  const centreX = wrist.x * frameWidth;
  const centreY = (wrist.y - wrist.span * WRIST_CROP.armOffset) * frameHeight;
  const x = Math.round(centreX - size / 2);
  const y = Math.round(centreY - size / 2);
  const width = Math.min(size, frameWidth - Math.max(0, x));
  const height = Math.min(size, frameHeight - Math.max(0, y));
  if (width < 16 || height < 16) return null;
  return [Math.max(0, x), Math.max(0, y), width, height];
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
  /**
   * Wrist crops from the hand landmarker, when it is running. Classifying the
   * wrist itself is what makes a watch detectable at all: a watch is a few
   * thousand pixels in a 480 px frame, far too little for a whole-frame
   * classifier to name, and it is the reason smartwatch recall was previously
   * called effectively inert. Without wrists the scan falls back to the
   * whole-frame read, which remains weak and is labelled `region: 'frame'`.
   */
  wrists?: [number, number, number, number][];
}

export async function analyseFrame(
  models: DeviceModels,
  frame: HTMLCanvasElement,
  config: DeviceModelConfig = DEVICE_MODEL_CONFIG,
  options: AnalysisOptions = {}
): Promise<DeviceObservation[]> {
  const { includeWearables = true, wrists = [] } = options;
  const frameArea = frame.width * frame.height;
  const observations: DeviceObservation[] = [];

  const predictions = await models.coco.detect(frame, 10);
  for (const prediction of predictions) {
    const [x, y, width, height] = prediction.bbox as [number, number, number, number];
    const areaRatio = frameArea > 0 ? (width * height) / frameArea : 0;
    if (prediction.class === COCO_PHONE_CLASS) {
      if (prediction.score < config.phoneScore || areaRatio < config.phoneMinAreaRatio) continue;
      observations.push({
        category: 'mobile_phone',
        confidence: prediction.score,
        model: 'coco-ssd',
        bbox: [x, y, width, height],
      });
    } else if (prediction.class === COCO_REMOTE_CLASS) {
      // A remote is the classic second device: a small handset the candidate
      // presses while the phone stays out of frame. It is localised, not guessed.
      if (prediction.score < config.remoteScore || areaRatio < config.remoteMinAreaRatio) continue;
      observations.push({
        category: 'remote_control',
        confidence: prediction.score,
        model: 'coco-ssd',
        bbox: [x, y, width, height],
      });
    }
  }

  // The classifier answers "what is in this frame", not "where"; it is only
  // consulted for the smaller wearables COCO has no class for.
  if (!includeWearables) return observations.sort((a, b) => b.confidence - a.confidence);

  // The wrist crops first: they are the strong read for a watch, and a category
  // they confirm must not be overwritten by the weaker whole-frame guess below.
  if (wrists.length > 0) {
    const scratch = document.createElement('canvas');
    const context = scratch.getContext('2d');
    if (context) {
      for (const [x, y, width, height] of wrists) {
        if (width < 16 || height < 16) continue;
        if (x < 0 || y < 0 || x + width > frame.width || y + height > frame.height) continue;
        scratch.width = width;
        scratch.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(frame, x, y, width, height, 0, 0, width, height);
        const wristClasses = await models.net.classify(scratch, 5);
        for (const entry of wristClasses) {
          const category = categoriseClassifierLabel(entry.className);
          if (!category || entry.probability < config.wristScore) continue;
          if (observations.some((o) => o.category === category)) continue;
          observations.push({
            category,
            confidence: entry.probability,
            model: 'mobilenet',
            region: 'wrist',
            bbox: [x, y, width, height],
          });
        }
      }
    }
  }

  const classes = await models.net.classify(frame, 5);
  for (const entry of classes) {
    const category = categoriseClassifierLabel(entry.className);
    if (!category || entry.probability < config.classifierScore) continue;
    // A phone already localised by COCO-SSD, or a wearable already confirmed in
    // its wrist crop, is the stronger signal; do not downgrade it to a
    // whole-frame guess.
    if (observations.some((o) => o.category === category)) continue;
    observations.push({
      category,
      confidence: entry.probability,
      model: 'mobilenet',
      region: 'frame',
    });
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

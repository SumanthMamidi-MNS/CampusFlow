/**
 * Measure on-device prohibited-device detection against a labelled sample.
 *
 * The detector's accuracy is the one claim in this feature that cannot be
 * argued from code review, so it is measured instead: this harness runs the
 * *shipped* detector module (`src/features/exams/device-detection.ts` — the same
 * thresholds, the same area filter, the same label mapping) over images whose
 * ground truth comes from the COCO val2017 annotations, and prints a confusion
 * table plus a threshold sweep for tuning.
 *
 * It runs in the browser on purpose. The detector uses TensorFlow.js with the
 * WebGL backend and HTML canvas, so a Node port would be a different
 * implementation producing different numbers; measuring that would be measuring
 * something we do not ship. Ground truth and thresholds are the only inputs the
 * harness adds — everything else is the production code path.
 *
 * Home: only ever run by a developer, never imported by application code, so it
 * is not part of the bundle. It is served by the dev server from the project
 * root (`/scripts/...`), which is why it lives here and not in `src/`.
 *
 * Usage
 * -----
 *   1. Fetch the labelled sample (writes `frontend/dev-measure/`, git-ignored and
 *      outside `public/` so the production build never copies it):
 *        python backend/scripts/fetch_device_detection_sample.py
 *   2. With the dev server running, open http://127.0.0.1:5173 — any page of the
 *      app — and in the browser console:
 *        const m = await import('/scripts/measure-device-detection.js')
 *        await m.runMeasurement()
 *      (or `m.runMeasurement({ limit: 40, verbose: true })` for per-image detail)
 *
 * What the numbers do and do not cover
 * ------------------------------------
 *   - Positives are COCO images annotated with a `cell phone` covering at least
 *     2% of the frame (the regime a webcam sees at examination distance);
 *     negatives contain a person and no phone annotation. So the sample measures
 *     the **phone** path only.
 *   - COCO has no `earbud` or `watch` ground truth, so the MobileNet wearable
 *     signal is reported as raw classifier output, never as a measured accuracy.
 *   - Stills are not webcam frames and a desktop camera is not a phone camera:
 *     these numbers bound the detector's behaviour, they do not promise field
 *     performance. Re-measure against recorded exam footage before quoting them.
 */

const SAMPLE_DIR = '/dev-measure';
const DETECTOR_MODULE = '/src/features/exams/device-detection.ts';
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

/** Thresholds evaluated by the sweep, narrowest first. */
const PHONE_SCORES = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const PHONE_MIN_AREA_RATIOS = [0, 0.01, 0.02, 0.05, 0.1];

async function loadDetector() {
  // The dev server transforms the TypeScript module on request, so this import
  // resolves to the same code the assessment page runs.
  return import(DETECTOR_MODULE);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
}

/**
 * Present a still to `frameForAnalysis`. That function reads `videoWidth` and
 * `videoHeight` off a video element and draws it to a canvas; an image is a
 * valid drawImage source, so copying the two size properties lets the harness
 * exercise the shipped downscale path verbatim instead of re-implementing it.
 */
function asAnalysableFrame(image) {
  image.videoWidth = image.naturalWidth;
  image.videoHeight = image.naturalHeight;
  return image;
}

async function fetchManifest(limit) {
  const response = await fetch(`${SAMPLE_DIR}/manifest.json`);
  if (!response.ok) {
    throw new Error(
      `no sample at ${SAMPLE_DIR}/manifest.json (HTTP ${response.status}). ` +
        'Run: python backend/scripts/fetch_device_detection_sample.py'
    );
  }
  const rows = await response.json();
  const wanted = Number.isFinite(limit) ? rows.slice(0, limit) : rows;
  return wanted.filter((row) => IMAGE_EXTENSIONS.test(row.file));
}

/** Read one image and return the raw evidence, before any threshold is applied. */
async function scanOne(detector, models, row, canvas) {
  const image = asAnalysableFrame(await loadImage(`${SAMPLE_DIR}/${row.file}`));
  const frame = detector.frameForAnalysis(image, canvas);
  if (!frame) return null;

  const frameArea = frame.width * frame.height;
  const started = performance.now();
  const observations = await detector.analyseFrame(models, frame, {
    phoneScore: 0,
    phoneMinAreaRatio: 0,
    classifierScore: 0,
    confirmations: 1,
  });
  const millis = performance.now() - started;

  const phones = observations.filter((o) => o.category === 'mobile_phone' && o.bbox);
  const phoneRatio = (bbox) => (frameArea > 0 ? (bbox[2] * bbox[3]) / frameArea : 0);
  const wearables = observations.filter((o) => o.category !== 'mobile_phone');

  return {
    file: row.file,
    label: row.label,
    // How large the annotated phone is in this frame, as the sample script
    // labelled it. Recall is reported per bucket, because one average over a
    // near phone and a distant one would hide the only interesting question.
    bucket: row.bucket ?? null,
    frame: { width: frame.width, height: frame.height },
    millis,
    // Strongest phone signal in the frame: the detector reports a box for each
    // matching class instance, and the sweep asks whether *any* of them clears
    // the bar, so the largest area and highest score are both taken from the
    // box that best satisfies the two conditions together.
    phone: phones.length
      ? phones
          .map((o) => ({ score: o.confidence, areaRatio: phoneRatio(o.bbox) }))
          .sort((a, b) => b.areaRatio - a.areaRatio)[0]
      : null,
    highestPhoneScore: phones.length ? Math.max(...phones.map((o) => o.confidence)) : 0,
    bestPhoneBoxAreaRatio: phones.length
      ? Math.max(...phones.map((o) => phoneRatio(o.bbox)))
      : 0,
    wearables: wearables.map((o) => ({
      category: o.category,
      confidence: Number(o.confidence.toFixed(3)),
    })),
  };
}

/** Confusion counts for one (score, area) pair, ignoring everything else. */
function scoreSetting(scans, phoneScore, minAreaRatio) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const scan of scans) {
    const detected = scan.phone !== null && scan.phone.score >= phoneScore &&
      scan.phone.areaRatio >= minAreaRatio;
    // A phone seen by the box detector but rejected by the area filter is a miss
    // for the exam (the candidate's phone was not reported), so it counts as a
    // false negative rather than being dropped from the sample.
    if (scan.label === 'phone') detected ? tp++ : fn++;
    else detected ? fp++ : tn++;
  }
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  return {
    phoneScore,
    minAreaRatio,
    tp,
    fp,
    fn,
    tn,
    precision: precision === null ? null : Number(precision.toFixed(3)),
    recall: recall === null ? null : Number(recall.toFixed(3)),
    f1: f1 === null ? null : Number(f1.toFixed(3)),
  };
}

/**
 * Scan the sample and report. Returns the summary so a caller can assert on it;
 * the console tables are for the human doing the tuning.
 */
export async function runMeasurement({ limit, verbose = false } = {}) {
  const detector = await loadDetector();
  const rows = await fetchManifest(limit);
  const positives = rows.filter((row) => row.label === 'phone').length;

  console.log(
    `Measuring ${rows.length} images (${positives} with an annotated phone, ` +
      `${rows.length - positives} person-only negatives) at ${detector.ANALYSED_FRAME_MAX_EDGE}px`
  );
  console.log('Loading models...');
  const loadStarted = performance.now();
  const models = await detector.loadDeviceModels();
  const loadMillis = Math.round(performance.now() - loadStarted);

  const canvas = document.createElement('canvas');
  const scans = [];
  for (const [index, row] of rows.entries()) {
    // Scanning is sequential and slow (a full model pass per image), so report
    // progress rather than leaving the console apparently frozen.
    if (index > 0 && index % 10 === 0) {
      console.log(`  ${index}/${rows.length} scanned...`);
    }
    const scan = await scanOne(detector, models, row, canvas);
    if (!scan) {
      console.warn(`skipped ${row.file}: the frame could not be drawn`);
      continue;
    }
    scans.push(scan);
    window.__measureProgress = { scanned: scans.length, total: rows.length };
    if (verbose) {
      console.log(
        `${scan.label.padEnd(5)} ${row.file} phone=${scan.highestPhoneScore.toFixed(2)} ` +
          `area=${scan.bestPhoneBoxAreaRatio.toFixed(4)} ${scan.millis.toFixed(0)}ms`,
        scan.wearables
      );
    }
  }

  const grid = [];
  for (const phoneScore of PHONE_SCORES) {
    for (const minAreaRatio of PHONE_MIN_AREA_RATIOS) {
      grid.push(scoreSetting(scans, phoneScore, minAreaRatio));
    }
  }
  console.table(grid);

  const shipped = scoreSetting(
    scans,
    detector.DEVICE_MODEL_CONFIG.phoneScore,
    detector.DEVICE_MODEL_CONFIG.phoneMinAreaRatio
  );
  const best = grid
    .filter((row) => row.f1 !== null)
    .sort((a, b) => b.f1 - a.f1 || a.fp - b.fp)[0];

  // Recall per phone size at the shipped thresholds: the number that says
  // whether detection works at examination distance or only against the lens.
  const bucketStats = new Map();
  for (const scan of scans.filter((s) => s.label === 'phone')) {
    const key = scan.bucket ?? 'unlabelled';
    const entry = bucketStats.get(key) ?? { bucket: key, images: 0, detected: 0 };
    entry.images += 1;
    if (
      scan.phone &&
      scan.phone.score >= shipped.phoneScore &&
      scan.phone.areaRatio >= shipped.minAreaRatio
    ) {
      entry.detected += 1;
    }
    bucketStats.set(key, entry);
  }
  const buckets = [...bucketStats.values()].map((entry) => ({
    ...entry,
    recall: Number((entry.detected / entry.images).toFixed(3)),
  }));
  for (const entry of buckets) {
    console.log(
      `  phone covering ${entry.bucket} of the frame: detected ${entry.detected}/` +
        `${entry.images} (recall ${entry.recall})`
    );
  }

  const meanMillis = scans.reduce((sum, s) => sum + s.millis, 0) / scans.length;
  const summary = {
    scanned: scans.length,
    positives,
    negatives: scans.length - positives,
    modelLoadMillis: loadMillis,
    meanScanMillis: Number(meanMillis.toFixed(0)),
    shipped: { ...shipped, config: { ...detector.DEVICE_MODEL_CONFIG } },
    buckets,
    best,
    wearableObservations: scans.flatMap((s) => s.wearables),
    misses: scans
      .filter((s) => s.label === 'phone' && s.phone === null)
      .map((s) => s.file),
    detail: verbose ? scans : undefined,
  };

  console.log(
    `Shipped settings (phoneScore ${shipped.phoneScore}, ` +
      `area >= ${shipped.minAreaRatio}): precision ${shipped.precision} recall ${shipped.recall} ` +
      `(tp ${shipped.tp} fp ${shipped.fp} fn ${shipped.fn} tn ${shipped.tn})`
  );
  console.log(
    `Best F1 in the sweep: precision ${best.precision} recall ${best.recall} ` +
      `(phoneScore ${best.phoneScore}, area >= ${best.minAreaRatio})`
  );
  console.log(
    `Model load ${loadMillis}ms; mean scan ${summary.meanScanMillis}ms over both models. ` +
      `Wearables are unmeasured: COCO has no earbud/watch ground truth.`
  );
  return summary;
}

export { PHONE_SCORES, PHONE_MIN_AREA_RATIOS, SAMPLE_DIR };

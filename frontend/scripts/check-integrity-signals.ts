/**
 * Verification harness for `mouth-monitoring.ts` and the watch/wrist path of
 * `device-detection.ts`.
 *
 * Neither a webcam nor a model download can happen here, but every decision that
 * turns a measurement into (or refuses to turn it into) an event can. Synthetic
 * frames, synthetic landmarks and a synthetic clock drive the same functions the
 * delivery screen calls:
 *
 *   - the mouth bands are geometry, checked against a face box;
 *   - motion dominance is arithmetic, checked with hand-built luma arrays;
 *   - dwell, escalation and recovery are a state machine, checked against a
 *     clock — including the false-positive guards (a nod must not look like
 *     speech, a pause must not reset the tally);
 *   - the wrist crop is geometry, and the classifier label map is the only place
 *     a label becomes a prohibited category.
 *
 * Run from `frontend/`: `node scripts/check-integrity-signals.ts` (Node 22.6+
 * type stripping). Procedure in `docs/development.md`.
 */
import {
  MOUTH_DOMINANCE,
  MOUTH_MONITOR_CONFIG,
  MOUTH_MOTION_MIN,
  MouthMonitor,
  classifyMouthFrame,
  extractRegion,
  mouthRegions,
  regionMotion,
  type MouthReading,
} from '../src/features/exams/mouth-monitoring.ts';
import {
  DEVICE_MODEL_CONFIG,
  DeviceConfirmationTracker,
  categoriseClassifierLabel,
  wristCropFromNormalised,
} from '../src/features/exams/device-detection.ts';
import { INTEGRITY_SIGNAL_LABELS } from '../src/features/exams/integrity-disclosure.ts';
import { readFileSync } from 'node:fs';

const WIDTH = 320;
const HEIGHT = 240;
let checks = 0;
let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

function near(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

// ── Mouth bands ────────────────────────────────────────────────────────────

console.log('\nmouth bands');

/** A face box at (x, y) with a mouth landmark, as the face detector returns it. */
function faceAt(x = 100, y = 60, width = 120, height = 150) {
  return {
    keypoints: [
      { name: 'rightEye', x: x + width * 0.25, y: y + height * 0.38 },
      { name: 'leftEye', x: x + width * 0.75, y: y + height * 0.38 },
      { name: 'noseTip', x: x + width * 0.5, y: y + height * 0.55 },
      { name: 'mouthCenter', x: x + width * 0.5, y: y + height * 0.72 },
    ],
    box: { xMin: x, yMin: y, width, height },
  };
}

{
  const regions = mouthRegions(faceAt(), WIDTH, HEIGHT);
  check('a normal face yields both bands', regions !== null);
  if (regions) {
    check('the reference band sits above the mouth band', regions.reference.y < regions.mouth.y);
    check(
      'both bands are inside the frame',
      regions.mouth.x >= 0 &&
        regions.mouth.y >= 0 &&
        regions.mouth.x + regions.mouth.width <= WIDTH &&
        regions.mouth.y + regions.mouth.height <= HEIGHT &&
        regions.reference.x >= 0 &&
        regions.reference.y + regions.reference.height <= HEIGHT
    );
    check(
      'the bands are the configured fraction of the face',
      near(regions.mouth.width, 120 * 0.6, 1) && near(regions.mouth.height, 150 * 0.34, 1),
      `mouth ${regions.mouth.width}x${regions.mouth.height}`
    );
    check(
      'the mouth band is centred on the mouth landmark',
      near(regions.mouth.x + regions.mouth.width / 2, 160, 1),
      `centre ${regions.mouth.x + regions.mouth.width / 2}`
    );
  }
}

check('a tiny face is unmeasurable', mouthRegions(faceAt(100, 60, 30, 34), WIDTH, HEIGHT) === null);
check('no face is unmeasurable', mouthRegions(null, WIDTH, HEIGHT) === null);
check(
  'a face mostly outside the frame is unmeasurable',
  mouthRegions(faceAt(-90, 60, 120, 150), WIDTH, HEIGHT) === null
);
check(
  'a zero-sized frame is unmeasurable',
  mouthRegions(faceAt(), 0, 0) === null
);

// ── Luma extraction and motion ─────────────────────────────────────────────

console.log('\nluma and motion');

function solid(width: number, height: number, level: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = level;
    data[index * 4 + 1] = level;
    data[index * 4 + 2] = level;
    data[index * 4 + 3] = 255;
  }
  return { data, width, height };
}

{
  const image = solid(10, 10, 200);
  const region = extractRegion(image, { x: 0, y: 0, width: 10, height: 10 });
  check('a solid region reads one value per pixel', region?.length === 100);
  check('luma of a grey pixel is that grey', Boolean(region && near(region[0], 200, 0.5)));

  // An RGBA pixel is weighted, not averaged: pure red is not 255 luma.
  const red = new Uint8ClampedArray([255, 0, 0, 255]);
  const redRegion = extractRegion(
    { data: red, width: 1, height: 1 },
    { x: 0, y: 0, width: 1, height: 1 }
  );
  check('luma uses the perceptual weights', Boolean(redRegion && near(redRegion[0], 76.2, 0.2)));
}

check(
  'a region that does not fit the image is refused',
  extractRegion(solid(10, 10, 0), { x: 5, y: 5, width: 10, height: 10 }) === null
);
check(
  'identical regions have zero motion',
  regionMotion(new Float32Array([1, 2, 3]), new Float32Array([1, 2, 3])) === 0
);
check(
  'a changed region has motion above zero',
  (regionMotion(new Float32Array([1, 2, 3]), new Float32Array([31, 2, 3])) ?? 0) > 0
);
check(
  'mismatched regions are not comparable',
  regionMotion(new Float32Array([1, 2]), new Float32Array([1, 2, 3])) === null
);

// ── Classification: dominance is the signal ────────────────────────────────

console.log('\nmotion classification');

const steady = (value: number, count = 16) => new Float32Array(count).fill(value);
const shifted = (value: number, delta: number, count = 16) =>
  new Float32Array(count).fill(value + delta);

{
  const movingMouth = classifyMouthFrame(steady(100), shifted(100, 30), steady(120), steady(120));
  check(
    'mouth motion with a still forehead is movement',
    movingMouth.state === 'moving' && (movingMouth.dominance ?? 0) >= MOUTH_DOMINANCE,
    JSON.stringify(movingMouth)
  );

  const wholeHead = classifyMouthFrame(
    steady(100),
    shifted(100, 30),
    steady(120),
    shifted(120, 30)
  );
  check(
    'the whole head moving is not talking',
    wholeHead.state === 'still',
    JSON.stringify(wholeHead)
  );

  const headMuch = classifyMouthFrame(
    steady(100),
    shifted(100, 20),
    steady(120),
    shifted(120, 40)
  );
  check('a forehead moving more than the mouth is not talking', headMuch.state === 'still');

  const tiny = classifyMouthFrame(
    steady(100),
    shifted(100, 2),
    steady(120),
    steady(120)
  );
  check(`motion below the ${MOUTH_MOTION_MIN} floor is not talking`, tiny.state === 'still');

  const missing = classifyMouthFrame(null, steady(100), steady(100), steady(100));
  check('a missing sample is unmeasurable, not still', missing.state === 'unmeasurable');
}

// ── The decision layer ─────────────────────────────────────────────────────

console.log('\nmouth monitor decisions');

const moving: MouthReading = {
  state: 'moving',
  mouthMotion: 0.06,
  referenceMotion: 0.006,
  dominance: 10,
};
const still: MouthReading = {
  state: 'still',
  mouthMotion: 0.002,
  referenceMotion: 0.002,
  dominance: 1,
};
const unreadable: MouthReading = {
  state: 'unmeasurable',
  mouthMotion: null,
  referenceMotion: null,
  dominance: null,
};

{
  // Movement at the 200 ms cadence. The first report lands on the first sample
  // at or past the configured dwell, so the assertion derives its bound from
  // the monitor's own disclosure rather than a hard-coded number.
  const monitor = new MouthMonitor();
  const signals: number[] = [];
  let now = 0;
  for (let index = 0; index < 40; index += 1) {
    const signal = monitor.observe(moving, now);
    if (signal) signals.push(now);
    now += 200;
  }
  const dwell = MOUTH_MONITOR_CONFIG.dwellMs;
  check(
    'nothing is reported before the configured dwell',
    signals.length === 1 && signals[0] >= dwell && signals[0] < dwell + 200
  );
  check('the reported dwell is the disclosed value', monitor.elapsedMs >= dwell);
}

{
  // Speech is made of pauses: alternating movement and stillness must still
  // accumulate, or a candidate could evade the dwell by breathing.
  const monitor = new MouthMonitor();
  let now = 0;
  let reported = false;
  for (let index = 0; index < 40 && !reported; index += 1) {
    const reading = index % 3 === 2 ? still : moving;
    reported = monitor.observe(reading, now) !== null;
    now += 200;
  }
  check('a pause between words does not reset the tally', reported);
}

{
  // A continuing episode escalates on its own slow clock.
  const monitor = new MouthMonitor();
  let now = 0;
  const reportedAt: number[] = [];
  for (let index = 0; index < 200; index += 1) {
    if (monitor.observe(moving, now) !== null) reportedAt.push(now);
    now += 200;
  }
  check('a sustained episode is not reported every sample', reportedAt.length < 6);
  check(
    'escalations are at least 20 s apart',
    reportedAt.every((at, index) => index === 0 || at - reportedAt[index - 1] >= 20_000),
    reportedAt.join(', ')
  );
}

{
  const monitor = new MouthMonitor();
  monitor.observe(moving, 0);
  monitor.observe(moving, 2000);
  check('2 s of movement is below the dwell', monitor.observe(moving, 2200) === null);
  // A return that holds for the recovery window clears the episode.
  monitor.observe(still, 2400);
  monitor.observe(still, 5000);
  check('a held return clears the tally', monitor.elapsedMs === 0);
  monitor.observe(moving, 5200);
  monitor.observe(moving, 5400);
  check('a cleared monitor needs the full dwell again', monitor.observe(moving, 5600) === null);
}

{
  // An unreadable face is not evidence either way: it neither adds time nor
  // ends the episode, so a detector gap cannot be spent as proof of talking.
  const monitor = new MouthMonitor();
  let now = 0;
  for (let index = 0; index < 10; index += 1) {
    monitor.observe(moving, now);
    now += 200;
  }
  for (let index = 0; index < 30; index += 1) {
    monitor.observe(unreadable, now);
    now += 200;
  }
  let reported = false;
  for (let index = 0; index < 3; index += 1) {
    reported = monitor.observe(moving, now) !== null || reported;
    now += 200;
  }
  check('an unreadable gap neither adds time nor clears it', !reported);
  check('the pre-gap tally survives the gap', monitor.elapsedMs > 0 && monitor.elapsedMs < 3000);
}

{
  const monitor = new MouthMonitor();
  let signal = null;
  let now = 0;
  for (let index = 0; index < 20 && !signal; index += 1) {
    signal = monitor.observe(moving, now, { audioActive: true });
    now += 200;
  }
  check('the decision carries the dwell and both motion numbers', Boolean(signal?.details.dwell_ms));
  check('the audio agreement is recorded for the reviewer', signal?.details.audio_active === true);
  check('no audio content is ever attached', !('audio' in (signal?.details ?? {})));
  check('the event name is the server vocabulary', signal?.eventType === 'mouth_movement_detected');
}

// ── Wrist crop and device categories ───────────────────────────────────────

console.log('\nwrist crop and device labels');

{
  const crop = wristCropFromNormalised({ x: 0.5, y: 0.6, span: 0.12 }, WIDTH, HEIGHT);
  check('a normal wrist yields a crop', crop !== null);
  if (crop) {
    const [x, y, width, height] = crop;
    check('the crop is square and scaled to the hand', width === height && width >= 16);
    check(
      'the crop reaches up the forearm from the wrist point',
      y + height / 2 < 0.6 * HEIGHT,
      `${y + height / 2} vs ${0.6 * HEIGHT}`
    );
    check(
      'the crop stays inside the frame',
      x >= 0 && y >= 0 && x + width <= WIDTH && y + height <= HEIGHT
    );
  }
}

check(
  'a wrist outside the frame is refused',
  wristCropFromNormalised({ x: 1.4, y: 0.5, span: 0.1 }, WIDTH, HEIGHT) === null
);
check(
  'a hand too small to resolve is refused',
  wristCropFromNormalised({ x: 0.5, y: 0.5, span: 0.001 }, WIDTH, HEIGHT) === null
);

{
  const labels: Array<[string, string | null]> = [
    ['digital watch', 'smartwatch'],
    ['wrist watch', 'smartwatch'],
    ['cellular telephone', 'mobile_phone'],
    ['earphone', 'earbuds'],
    ['remote control', 'remote_control'],
    ['stopwatch', null],
    ['Labrador retriever', null],
  ];
  for (const [label, expected] of labels) {
    check(
      `"${label}" maps to ${expected ?? 'nothing'}`,
      categoriseClassifierLabel(label) === expected,
      String(categoriseClassifierLabel(label))
    );
  }
}

{
  // One lucky frame is not a device: the tracker needs consecutive agreement and
  // then reports the incident once.
  const tracker = new DeviceConfirmationTracker(DEVICE_MODEL_CONFIG.confirmations);
  const watch = { category: 'smartwatch' as const, confidence: 0.7, model: 'mobilenet' as const };
  let confirmedAt = 0;
  let confirmations = 0;
  for (let index = 0; index < 6; index += 1) {
    const confirmed = tracker.observe([watch]);
    if (confirmed) {
      confirmations += 1;
      confirmedAt = index;
    }
  }
  check('a device is confirmed exactly once', confirmations === 1);
  check(
    'confirmation happens on the configured streak',
    confirmedAt === DEVICE_MODEL_CONFIG.confirmations - 1,
    String(confirmedAt)
  );
}

// ── Disclosed vocabulary (ADR-040) ─────────────────────────────────────────
// The brief renders the split the server enforces. The server's own sets are
// read out of the Python source rather than copied here, so a signal added
// without a candidate sentence fails this harness instead of shipping as raw
// snake_case — and a sentence that outlives its signal fails too.

console.log('\ndisclosed vocabulary');

function frozensetNames(source: string, marker: string): string[] {
  const start = source.indexOf(marker);
  if (start === -1) return [];
  const end = source.indexOf('\n)', start);
  const block = source.slice(start, end === -1 ? undefined : end);
  return [...block.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
}

{
  const source = readFileSync(
    new URL('../../backend/campusflow/domain/exams/service.py', import.meta.url),
    'utf8'
  );
  const vocabulary = frozensetNames(source, 'PROCTORING_EVENT_TYPES = frozenset(');
  const reviewOnly = frozensetNames(source, 'REVIEW_ONLY_EVENT_TYPES = frozenset(');
  const evidence = frozensetNames(source, 'NON_VIOLATION_EVENT_TYPES = frozenset(');

  check('the server vocabulary was found', vocabulary.length >= 20, String(vocabulary.length));
  check('the review-only set was found', reviewOnly.length === 6, String(reviewOnly.length));
  check('the evidence set was found', evidence.length === 2, String(evidence.length));

  for (const id of vocabulary) {
    const sentence = INTEGRITY_SIGNAL_LABELS[id];
    check(`"${id}" has a candidate sentence`, Boolean(sentence && sentence.length > 4));
  }
  for (const id of Object.keys(INTEGRITY_SIGNAL_LABELS)) {
    check(`"${id}" is a signal the server can send`, vocabulary.includes(id));
  }
  check(
    'the review-only and evidence sets do not overlap',
    reviewOnly.every((id) => !evidence.includes(id) && vocabulary.includes(id))
  );
  check(
    'the deliberate camera acts are not review-only',
    ['camera_off', 'camera_obstructed', 'second_device_detected'].every(
      (id) => !reviewOnly.includes(id) && vocabulary.includes(id)
    )
  );
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
if (failures > 0) process.exitCode = 1;

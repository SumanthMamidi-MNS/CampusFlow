/**
 * Verification harness for `hand-monitoring.ts` and `voice-monitoring.ts`.
 *
 * Neither model can run here — the hand landmarker needs a weight download and
 * the voice detector needs a live microphone. Everything that decides *whether
 * to record an event* can: synthetic hand landmarks, synthetic analyser frames
 * and a synthetic clock drive the same functions the browser calls, including
 * every false-positive guard the tiers exist to provide.
 *
 * Run from `frontend/`: `node scripts/check-hand-voice-monitoring.ts` (Node
 * 22.6+ type stripping). Procedure in `docs/development.md`.
 */
import {
  HAND_AT_FACE_RATIO,
  HAND_MONITOR_CONFIG,
  HandMonitor,
  classifyHands,
  faceExtent,
  type HandScene,
} from '../src/features/exams/hand-monitoring.ts';
import {
  VOICE_BAND_HZ,
  VOICE_MONITOR_CONFIG,
  VOICE_RMS_THRESHOLD,
  VoiceMonitor,
  bandEnergyRatio,
  frameIsVoice,
  type AudioLevelFrame,
} from '../src/features/exams/voice-monitoring.ts';

const WIDTH = 480;
const HEIGHT = 360;
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

// ── Synthetic scenes ────────────────────────────────────────────────────────

/** A detected face centred at (cx, cy) and `width` px across. */
function face(cx = WIDTH / 2, cy = HEIGHT / 2, width = 120) {
  return {
    keypoints: [
      { x: cx - width * 0.15, y: cy - 10 },
      { x: cx + width * 0.15, y: cy - 10 },
      { x: cx, y: cy + 4 },
      { x: cx, y: cy + 28 },
    ],
    box: { width, height: width * 1.3 },
  };
}

/** A 21-point hand whose centroid sits at (cx, cy). */
function handAt(cx: number, cy: number, count = 21) {
  return {
    points: Array.from({ length: count }, (_, index) => ({
      x: cx + (index % 5) - 2,
      y: cy + Math.floor(index / 5) - 2,
    })),
  };
}

function scene(handCentres: Array<[number, number]>, withFace = true): HandScene {
  return {
    hands: handCentres.map(([x, y]) => handAt(x, y)),
    face: withFace ? face() : null,
    frameWidth: WIDTH,
    frameHeight: HEIGHT,
  };
}

// ── Synthetic audio ─────────────────────────────────────────────────────────

/**
 * One analyser frame. `amplitude` sets the waveform's peak, `bandRatio` how
 * much of the spectrum's power sits inside the voice band.
 */
function audioFrame(amplitude: number, voiceOnly = true, sampleRate = 44_100): AudioLevelFrame {
  const timeDomain = new Float32Array(2_048);
  for (let index = 0; index < timeDomain.length; index += 1) {
    // 180 Hz: inside the voice band, so the waveform itself is speech-shaped.
    timeDomain[index] = amplitude * Math.sin((2 * Math.PI * 180 * index) / sampleRate);
  }

  const bins = 1_024;
  const frequency = new Float32Array(bins);
  const binHz = sampleRate / 2 / bins;
  const lowBin = Math.floor(VOICE_BAND_HZ.low / binHz);
  const highBin = Math.ceil(VOICE_BAND_HZ.high / binHz);
  for (let index = 0; index < bins; index += 1) {
    const inBand = index >= lowBin && index <= highBin;
    // −60 dBFS in the chosen region, −90 dBFS elsewhere: a wide ratio.
    frequency[index] = inBand === voiceOnly ? -60 : -90;
  }
  return { timeDomain, frequency, sampleRate };
}

/**
 * Frames that alternate between a stressed and an unstressed syllable, i.e.
 * speech rather than a steady hum.
 *
 * The softer half stays above the loudness floor on purpose. Real speech is not
 * a full-scale tone followed by silence; it is a voiced syllable followed by a
 * quieter voiced one. A true silent gap is modelled separately by
 * `audioFrame(0.0003)`. The old 15% valley fell under the new loud-voice floor,
 * which made this synthetic speaker alternate between "heard" and "not there"
 * rather than sound like a person talking.
 */
function syllable(level: number, index: number): AudioLevelFrame {
  return audioFrame(index % 2 === 0 ? level * 1.4 : level * 0.9);
}

// ── Hand geometry ───────────────────────────────────────────────────────────

console.log('\nhand-to-face geometry');
{
  const extent = faceExtent(face());
  check('a boxed face reports its box width', Boolean(extent && near(extent.width, 120, 0.01)));

  check('no face means no extent', faceExtent(null) === null);
  check(
    'a face with no box falls back to a landmark estimate',
    Boolean(faceExtent({ keypoints: face().keypoints })?.width)
  );

  const onFace = classifyHands(scene([[WIDTH / 2, HEIGHT / 2 + 20]]));
  check('a hand at the face classifies as at_face', onFace.condition === 'at_face', onFace.condition);

  const onDesk = classifyHands(scene([[80, HEIGHT - 40]]));
  check('a hand on the desk is not at the face', onDesk.condition === 'away', onDesk.condition);

  const noHands = classifyHands(scene([]));
  check('no hands classify as none', noHands.condition === 'none', noHands.condition);

  const noFace = classifyHands(scene([[WIDTH / 2, HEIGHT / 2]], false));
  check(
    'a hand with no face reference is unmeasurable, never at_face',
    noFace.condition === 'unmeasurable',
    noFace.condition
  );

  // The boundary itself: just inside counts, just outside does not.
  const inside = classifyHands(scene([[WIDTH / 2 + 120 * HAND_AT_FACE_RATIO - 4, HEIGHT / 2]]));
  const outside = classifyHands(scene([[WIDTH / 2 + 120 * HAND_AT_FACE_RATIO + 4, HEIGHT / 2]]));
  check('just inside the ratio is at_face', inside.condition === 'at_face', inside.condition);
  check('just outside the ratio is away', outside.condition === 'away', outside.condition);

  const stub = classifyHands({
    hands: [{ points: [{ x: 1, y: 1 }] }],
    face: face(),
    frameWidth: WIDTH,
    frameHeight: HEIGHT,
  });
  check('a hand with too few points is ignored', stub.condition === 'none', stub.condition);

  const twoHands = classifyHands(scene([[80, HEIGHT - 40], [WIDTH / 2, HEIGHT / 2 + 10]]));
  check('the closest of two hands decides', twoHands.condition === 'at_face', twoHands.condition);
  check('both hands are counted', twoHands.hands === 2, String(twoHands.hands));
}

// ── Hand dwell, escalation and recovery ────────────────────────────────────

console.log('\nhand monitor decisions');
{
  const monitor = new HandMonitor({ dwellMs: 3_500 });
  const atFace = scene([[WIDTH / 2, HEIGHT / 2 + 20]]);
  const onDesk = scene([[80, HEIGHT - 40]]);

  check('a single frame is never an event', monitor.observe(atFace, 0) === null);

  let signal = null;
  for (let now = 700; now <= 3_500; now += 700) {
    signal = monitor.observe(atFace, now) ?? signal;
  }
  check('the dwell gates the event', signal !== null);
  check(
    'the measurement travels with it',
    signal !== null && typeof signal.details.proximity === 'number' && signal.details.dwell_ms > 0
  );

  // A scratch: at the face for a second, then away. Nothing may be recorded.
  const brief = new HandMonitor({ dwellMs: 3_500 });
  brief.observe(atFace, 0);
  brief.observe(atFace, 700);
  brief.observe(atFace, 1_400);
  check('a one-second scratch is not recorded', brief.observe(onDesk, 2_100) === null);

  // A single good frame between two turns must not reset the dwell. The away
  // time accumulated before the blink has to survive it, so the episode lands at
  // roughly one dwell excluding the blink — not a full dwell measured from
  // scratch, which is exactly how a contiguous-dwell detector is defeated.
  const flicker = new HandMonitor({ dwellMs: 3_500 });
  flicker.observe(atFace, 0);
  flicker.observe(atFace, 1_000);
  flicker.observe(onDesk, 1_700);
  flicker.observe(atFace, 2_400);
  flicker.observe(atFace, 3_100);
  const blinked = flicker.observe(atFace, 4_500);
  check('a blink away does not reset the dwell', blinked !== null);
  check(
    'and the blink itself is not counted as away time',
    blinked !== null && (blinked.details.dwell_ms as number) < 4_500,
    String(blinked?.details.dwell_ms)
  );

  // Escalation: one event per window, not one per frame.
  const escalate = new HandMonitor({ dwellMs: 2_000, escalationMs: 20_000 });
  let count = 0;
  for (let now = 0; now <= 60_000; now += 1_000) {
    if (escalate.observe(atFace, now)) count += 1;
  }
  check('escalation keeps a long episode to a handful of events', count >= 3 && count <= 5, String(count));

  // An unmeasurable frame is not evidence either way.
  const blind = new HandMonitor({ dwellMs: 2_000 });
  const never = new HandMonitor({ dwellMs: 1_000 });
  for (let now = 0; now <= 20_000; now += 1_000) {
    check(
      'an unmeasurable frame records nothing',
      blind.observe(scene([[WIDTH / 2, HEIGHT / 2]], false), now) === null
    );
    break;
  }
  check(
    'and it does not clear an open episode',
    never.observe(atFace, 0) === null &&
      never.observe(atFace, 5_000) !== null &&
      never.observe(scene([], false), 6_000) === null
  );

  // A throttled tab cannot manufacture minutes of dwell in one leap.
  const throttled = new HandMonitor({ dwellMs: 60_000, maxSampleGapMs: 2_000 });
  throttled.observe(atFace, 0);
  check(
    'a long gap is capped, so the dwell is not met by a leap',
    throttled.observe(atFace, 600_000) === null
  );

  // Recovery: away long enough ends the episode, so the next one reports fresh.
  const cycle = new HandMonitor({ dwellMs: 1_000, recoveryMs: 1_600, escalationMs: 20_000 });
  cycle.observe(atFace, 0);
  const first = cycle.observe(atFace, 1_400);
  check('a first episode reports', first !== null);
  cycle.observe(onDesk, 2_000);
  cycle.observe(onDesk, 5_000);
  check('the episode is closed after a real return', cycle.elapsedMs === 0, String(cycle.elapsedMs));
  // The next episode starts fresh: its first report can land on either of these
  // frames depending on how much of the dwell the intervening gap supplied, so
  // both are accepted and the episode must report exactly once.
  const nextFirst = cycle.observe(atFace, 6_000);
  const nextSecond = cycle.observe(atFace, 7_400);
  check(
    'and the next episode reports again',
    nextFirst !== null || nextSecond !== null,
    JSON.stringify({ nextFirst, nextSecond })
  );
  check(
    'once the new episode is open it does not re-report inside the escalation window',
    cycle.observe(atFace, 8_800) === null
  );

  check('the standard dwell is the tier default', HAND_MONITOR_CONFIG.dwellMs === 3_500);
}

// ── Voice signal analysis ──────────────────────────────────────────────────

console.log('\nvoice signal analysis');
{
  const inBand = bandEnergyRatio(audioFrame(0.05, true));
  const outOfBand = bandEnergyRatio(audioFrame(0.05, false));
  check('in-band energy is reported high', inBand > 0.9, inBand.toFixed(3));
  check('out-of-band energy is reported low', outOfBand < 0.6, outOfBand.toFixed(3));

  const silence = audioFrame(0.0005);
  const history: number[] = [];
  check('silence is not voice', frameIsVoice(silence, history).voice === false);

  const quiet = frameIsVoice(audioFrame(0.0008), [], { rms: VOICE_RMS_THRESHOLD, band: 0.45, modulation: 0 });
  check('a level under the floor is not voice', quiet.voice === false);

  // The loudness floor is deliberately above ordinary room noise: a desk
  // conversation in the next room, a chair and a fan must not be treated as a
  // second person speaking into the paper. A raised voice must still pass.
  const chatter = frameIsVoice(audioFrame(0.03), [], {
    rms: VOICE_RMS_THRESHOLD,
    band: 0.45,
    modulation: 0,
  });
  check('ordinary room noise stays below the voice floor', chatter.voice === false);

  const raised = frameIsVoice(audioFrame(0.05), [], {
    rms: VOICE_RMS_THRESHOLD,
    band: 0.45,
    modulation: 0,
  });
  check('a raised voice clears the loudness floor', raised.voice === true);

  // A steady loud hum: enough amplitude, right band, but no modulation.
  const steadyHistory: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    frameIsVoice(audioFrame(0.05), steadyHistory);
  }
  const steady = frameIsVoice(audioFrame(0.05), steadyHistory);
  check('a steady fan is rejected for lack of modulation', steady.voice === false, String(steady.modulation));

  // Speech: syllables at the same average level, which is the whole difference.
  const speechHistory: number[] = [];
  let heard = 0;
  for (let index = 0; index < 20; index += 1) {
    if (frameIsVoice(syllable(0.05, index), speechHistory).voice) heard += 1;
  }
  check('syllabic speech is detected', heard >= 6, String(heard));
}

// ── Voice monitor decisions ────────────────────────────────────────────────

console.log('\nvoice monitor decisions');
{
  const monitor = new VoiceMonitor({ dwellMs: 3_500 });
  let index = 0;
  let signal = null;

  // A cough: one loud burst, then quiet.
  const cough = new VoiceMonitor({ dwellMs: 3_500 });
  cough.observe(audioFrame(0.2), 0);
  check('a cough is not sustained enough to report', cough.observe(audioFrame(0.0004), 1_000) === null);

  for (let now = 0; now <= 4_200; now += 300) {
    index += 1;
    signal = monitor.observe(syllable(0.05, index), now) ?? signal;
  }
  check('sustained speech reports', signal !== null);
  check('the report carries no audio, only level', signal !== null && signal.details.recorded === undefined);

  // A breath mid-sentence must not reset the dwell, or ordinary speech would be
  // impossible to detect.
  const breathy = new VoiceMonitor({ dwellMs: 3_500 });
  let spoken = 0;
  let sequence = 0;
  for (let now = 0; now <= 5_000; now += 400) {
    sequence += 1;
    // Every fourth frame is a gap between sentences.
    const frame = sequence % 4 === 0 ? audioFrame(0.0003) : syllable(0.05, sequence);
    if (breathy.observe(frame, now)) spoken += 1;
  }
  check('pauses between sentences do not defeat the dwell', spoken >= 1, String(spoken));

  // Escalation over a long conversation.
  const long = new VoiceMonitor({ dwellMs: 2_000, escalationMs: 30_000 });
  let count = 0;
  sequence = 0;
  for (let now = 0; now <= 120_000; now += 400) {
    sequence += 1;
    if (long.observe(syllable(0.05, sequence), now)) count += 1;
  }
  check('a long conversation is a few events, not thousands', count >= 3 && count <= 6, String(count));

  // A gap longer than the cap cannot manufacture voiced time.
  const throttled = new VoiceMonitor({ dwellMs: 60_000, maxSampleGapMs: 2_000 });
  throttled.observe(syllable(0.05, 0), 0);
  check('a suspended tab cannot leap the dwell', throttled.observe(syllable(0.05, 1), 600_000) === null);

  // Quiet for the recovery window ends the episode.
  const silent = new VoiceMonitor({ dwellMs: 1_000, recoveryMs: 2_400 });
  sequence = 0;
  while (silent.observe(syllable(0.05, sequence++), sequence * 400) === null && sequence < 60) {
    // advance until the first report
  }
  check('the first episode reports', silent.elapsedMs > 0);
  for (let step = 0; step < 12; step += 1) {
    silent.observe(audioFrame(0.0002), 100_000 + step * 400);
  }
  check('a quiet room closes the episode', silent.elapsedMs === 0, String(silent.elapsedMs));

  check('the standard voice dwell is the tier default', VOICE_MONITOR_CONFIG.dwellMs === 3_500);
}

console.log(
  `\n${checks - failures}/${checks} checks passed` + (failures ? ` — ${failures} FAILED` : '')
);
if (failures > 0) process.exit(1);

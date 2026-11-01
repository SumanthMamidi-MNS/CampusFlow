/**
 * Verification harness for `frontend/src/features/exams/face-monitoring.ts`.
 *
 * The detector itself needs a webcam and a weight download, so it cannot run
 * here. Everything that decides *whether to record an event* can: synthetic
 * FaceMesh landmark sets and a synthetic clock drive the same functions the
 * browser calls. Run with the build steps in `docs/development.md`.
 */
import {
  FACE_MONITOR_CONFIG,
  FaceMonitor,
  NOSE_DEPTH_RATIO,
  classifyScene,
  estimateHeadPose,
  type DetectedFace,
  type FaceScene,
} from '../src/features/exams/face-monitoring.ts';

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;

/**
 * One synthetic face in the detector's six-keypoint shape. `offsetEyeSpans` is
 * the nose tip's horizontal offset from the eye midpoint, in eye-span units.
 */
function faceAt(offsetEyeSpans: number, eyeSpanPx = 60): DetectedFace {
  const midX = FRAME_WIDTH / 2;
  const midY = FRAME_HEIGHT / 2;
  const noseX = midX + offsetEyeSpans * eyeSpanPx;
  return {
    keypoints: [
      { name: 'rightEye', x: midX - eyeSpanPx / 2, y: midY },
      { name: 'leftEye', x: midX + eyeSpanPx / 2, y: midY },
      { name: 'noseTip', x: noseX, y: midY + 10 },
      { name: 'mouthCenter', x: noseX, y: midY + 34 },
      { name: 'rightEarTragion', x: midX - eyeSpanPx, y: midY + 6 },
      { name: 'leftEarTragion', x: midX + eyeSpanPx, y: midY + 6 },
    ],
    box: { xMin: midX - 80, yMin: midY - 100, width: 160, height: 200 },
  };
}

/** The nose offset that the module maps to exactly `degrees`. */
function offsetFor(degrees: number): number {
  return Math.tan((degrees * Math.PI) / 180) * NOSE_DEPTH_RATIO;
}

function scene(...faces: DetectedFace[]): FaceScene {
  return { faces, frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT };
}

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function approx(value: number | null | undefined, target: number, tolerance: number): boolean {
  return typeof value === 'number' && Math.abs(value - target) <= tolerance;
}

console.log('geometry — estimateHeadPose');
const frontal = estimateHeadPose(faceAt(0), FRAME_WIDTH);
check('frontal face reads ~0° yaw', approx(frontal?.yawDegrees, 0, 1), String(frontal?.yawDegrees));

// The offset that the model maps to exactly the threshold, and one comfortable
// step past it.
const atThreshold = offsetFor(FACE_MONITOR_CONFIG.turnThresholdDegrees);
const at62 = offsetFor(62);
const turnedLeft = estimateHeadPose(faceAt(at62), FRAME_WIDTH);
const turnedRight = estimateHeadPose(faceAt(-at62), FRAME_WIDTH);
check(
  'a 62° turn reports ~62°',
  approx(turnedLeft?.yawDegrees, 62, 1),
  String(turnedLeft?.yawDegrees)
);
check('nose toward the image right = candidate turns left', turnedLeft?.direction === 'left');
check('nose toward the image left = candidate turns right', turnedRight?.direction === 'right');
check(
  'the angle is invariant to the analysed resolution',
  approx(
    estimateHeadPose(faceAt(at62, 40), (FRAME_WIDTH * 0.4))?.yawDegrees,
    turnedLeft?.yawDegrees ?? -1,
    1
  )
);
check('a face too small to measure yields no pose', estimateHeadPose(faceAt(0, 4), FRAME_WIDTH) === null);
check('a truncated mesh yields no pose', estimateHeadPose({ keypoints: [] }, FRAME_WIDTH) === null);

console.log('classification — classifyScene');
check('frontal single face is ok', classifyScene(scene(faceAt(0))).condition === 'ok');
check(
  'threshold-crossing turn is turned_left',
  classifyScene(scene(faceAt(atThreshold * 1.2))).condition === 'turned_left'
);
check(
  'mirrored turn is turned_right',
  classifyScene(scene(faceAt(-atThreshold * 1.2))).condition === 'turned_right'
);
check(
  'just inside the threshold stays ok',
  classifyScene(scene(faceAt(atThreshold * 0.8))).condition === 'ok'
);
check('empty frame is no_face', classifyScene(scene()).condition === 'no_face');
check(
  'two faces is multiple_faces',
  classifyScene(scene(faceAt(0), faceAt(0.1))).condition === 'multiple_faces'
);
check(
  'an unmeasurable face is unreadable',
  classifyScene(scene(faceAt(0, 4))).condition === 'unreadable'
);

console.log('dwell — nothing is recorded before the condition persists');
{
  const monitor = new FaceMonitor();
  const turned = scene(faceAt(atThreshold * 1.3));
  check('first turned frame records nothing', monitor.observe(turned, 0).length === 0);
  check(
    'just before the dwell records nothing',
    monitor.observe(turned, FACE_MONITOR_CONFIG.turnDwellMs - 1).length === 0
  );
  check('a turn below its dwell does not cover the paper', monitor.gate === null);
  const due = monitor.observe(turned, FACE_MONITOR_CONFIG.turnDwellMs);
  check('at the dwell an event is due', due.length === 1, JSON.stringify(due));
  check('it is looking_away', due[0]?.eventType === 'looking_away');
  check('direction travels with the event', due[0]?.details.direction === 'left');
  check('severity is medium', due[0]?.severity === 'medium');
  check('state is turned_left for the overlay', monitor.state === 'turned_left');
  check('the dwell covers the paper', monitor.gate === 'turned_left');

  const soon = monitor.observe(turned, FACE_MONITOR_CONFIG.turnDwellMs + 5_000);
  check('a persisting turn does not spam events', soon.length === 0);

  const escalated = monitor.observe(
    turned,
    FACE_MONITOR_CONFIG.turnDwellMs + FACE_MONITOR_CONFIG.escalationMs
  );
  check('the turn is re-reported on the escalation cadence', escalated.length === 1);
}

console.log('reset — returning to the paper ends the episode');
{
  const monitor = new FaceMonitor();
  const turned = scene(faceAt(atThreshold * 1.3));
  monitor.observe(turned, 0);
  monitor.observe(turned, 2_000);
  check('returning to the paper yields no event', monitor.observe(scene(faceAt(0)), 3_000).length === 0);
  check('state is ok again', monitor.state === 'ok');
  // The cover is not dismissed by a glance: the return has to hold.
  check('a glance back does not dismiss the cover', monitor.gate === 'turned_left');
  check('a held return ends the episode', monitor.observe(scene(faceAt(0)), 4_000).length === 0);
  check('the cover lifts after a held return', monitor.gate === null);
  // Turning away again is a fresh episode with its own dwell.
  check('a new turn starts a new dwell', monitor.observe(turned, 5_000).length === 0);
  check('the new dwell is honoured', monitor.observe(turned, 7_100).length === 1);
}

console.log('flicker — glancing back for a frame does not reset the tally');
{
  const monitor = new FaceMonitor();
  const turned = scene(faceAt(atThreshold * 1.3));
  monitor.observe(turned, 0);
  monitor.observe(turned, 700);
  monitor.observe(turned, 1_400);
  // One good frame at 700 ms cadence, then straight back: the classic way a
  // contiguous-dwell detector is beaten.
  const back = monitor.observe(scene(faceAt(0)), 2_100);
  check('the brief return records nothing', back.length === 0);
  check('a return below the dwell keeps the paper readable', monitor.gate === null);
  const due = monitor.observe(turned, 2_800);
  check('away time survives the flicker', due.length === 1, JSON.stringify(due));
  check('the flicker is still one looking_away event', due[0]?.eventType === 'looking_away');
}

console.log('unmeasurable frames — safety, not a verdict');
{
  const monitor = new FaceMonitor();
  const turned = scene(faceAt(atThreshold * 1.3));
  monitor.observe(turned, 0);
  monitor.observe(turned, 2_000);
  const unclear = monitor.observe(scene(faceAt(0, 4)), 2_500);
  check('an unreadable frame does not add an event', unclear.length === 0);
  check('a covered paper is not dismissed by an unreadable frame', monitor.gate === 'turned_left');
  monitor.observe(scene(faceAt(0, 4)), 4_000);
  check(
    'without a confirmed return the cover lifts when the recovery window closes',
    monitor.gate === null
  );
}

console.log('absence and company');
{
  const monitor = new FaceMonitor();
  // A real scan cadence, not one giant jump: the monitor deliberately caps a
  // single sample gap, so dwell is accumulated the way the browser does it.
  let last = 0;
  let quiet = 0;
  for (let t = 0; t <= FACE_MONITOR_CONFIG.absenceDwellMs; t += 700) {
    last = t;
    quiet += monitor.observe(scene(), t).length;
  }
  check('no face is quiet before its dwell', quiet === 0, String(last));
  const gone = monitor.observe(scene(), last + 700);
  check('no face at the dwell is reported', gone[0]?.eventType === 'face_not_visible');
  check('absence is high severity', gone[0]?.severity === 'high');

  const company = new FaceMonitor();
  company.observe(scene(faceAt(0), faceAt(0.05)), 0);
  check('a second face is quiet before its dwell', company.observe(scene(faceAt(0), faceAt(0.05)), 1_000).length === 0);
  const crowded = company.observe(scene(faceAt(0), faceAt(0.05)), 1_500);
  check('a second face at the dwell is reported', crowded[0]?.eventType === 'multiple_faces_detected');
}

console.log('safety — an unreadable frame never punishes anyone');
{
  const monitor = new FaceMonitor();
  let signals = 0;
  for (let t = 0; t < 60_000; t += 700) {
    signals += monitor.observe(scene(faceAt(0, 4)), t).length;
  }
  check('60 seconds of unmeasurable frames records nothing', signals === 0, String(signals));
  check('the state stays unreadable for the UI', monitor.state === 'unreadable');
  check('unmeasurable frames never cover the paper', monitor.gate === null);
}

console.log(failures === 0 ? '\nAll face-monitoring checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

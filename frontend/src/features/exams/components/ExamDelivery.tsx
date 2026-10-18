import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/core/auth/hooks';
import { PageLoading } from '@/core/components/ui/loading';
import {
  useExamBrief,
  useRecordProctoringEvent,
  useSaveExamAnswers,
  useStartExam,
  useSubmitExam,
} from '../api';
import type {
  ExamDelivery as ExamDeliveryData,
  ExamDeliveryQuestion,
  ExamWarningPolicy,
  SaveAnswerPayload,
} from '../types';
import {
  DEVICE_MODEL_CONFIG,
  DeviceConfirmationTracker,
  analyseFrame,
  frameForAnalysis,
  loadDeviceModels,
  type DeviceModels,
  type DeviceObservation,
} from '../device-detection';

type AnswerState = Record<string, { answer_data: any; flagged_for_review: boolean }>;

const AUTOSAVE_INTERVAL_MS = 30_000;
const EVENT_THROTTLE_MS = 2_000;
// How often a frame is captured for the instructor's integrity trail while the
// assessment runs. Kept deliberately coarse: enough to prove presence, small
// enough for the trail to stay readable.
const SNAPSHOT_INTERVAL_MS = 60_000;
// Camera liveness is polled because browsers can drop a track (device unplug,
// permission revoked by the OS) without a page event.
const CAMERA_WATCHDOG_MS = 5_000;
// A warning pulses for this long, then settles into the persistent red banner.
const ALARM_VISIBLE_MS = 10_000;
// Some environments never settle getUserMedia (permission service down, camera
// held by another application). The candidate must get an actionable message
// instead of an endless “Requesting camera…”.
const CAMERA_REQUEST_TIMEOUT_MS = 12_000;
// "Camera ready" must mean *pixels are flowing*, not merely that the track
// claims to be live: a covered lens, a dead stream and a sleeping camera all
// report "live" while the preview shows a black tile. Readiness therefore
// requires a live track, a real frame size, a progressing playback clock and
// sampled pixel content — see the probe below.
const CAMERA_FRAME_POLL_MS = 500;
// A frame that never changes for this long is an obstruction (lid closed,
// finger over the lens, a phone covering the camera). Four seconds of
// continuous stillness before the configured warning, per the approved policy.
// Fallback only: the assessment's authored value (`obstruction_threshold_seconds`,
// ADR/exam config) is what is enforced, and this is used when an older payload
// omits it. Kept in one place so the copy and the timer cannot disagree.
const CAMERA_OBSTRUCTION_AFTER_MS = 4_000;
// On-device device scan cadence. Three seconds is enough to catch a phone being
// used while leaving the machine idle between scans, and the confirmation count
// in `device-detection.ts` means one scan alone can never raise an observation.
const DEVICE_SCAN_INTERVAL_MS = 3_000;
// One reported observation per category per this window: a phone left on the
// desk must not become an event every three seconds.
const DEVICE_REPORT_COOLDOWN_MS = 120_000;
// A stopped/dead track still leaves the element reporting readyState ≥ 2 and a
// non-zero videoWidth: Chrome parks a 2×2 placeholder frame on it. A real
// camera frame is therefore required to be at least this large before the page
// may call the picture live.
const MIN_FRAME_WIDTH = 64;
const MIN_FRAME_HEIGHT = 48;
// A connected camera that sends nothing but black pixels is not showing a
// picture — closed lens shutter, camera disabled at OS level, another
// application holding the device. The mean luminance of the sampled frame is
// below this floor for BLACK_FRAME_SAMPLES consecutive polls before the page
// says so. The floor is deliberately near-zero so a genuinely dark room (whose
// sensor still produces grain) is not mistaken for a dead feed.
const BLACK_FRAME_LUMA = 4;
const BLACK_FRAME_SAMPLES = 6;
// The candidate has this long to return to the paper after leaving it. Inside
// the window the return is recorded (quick_tab_return) without penalty; the
// moment it lapses the absence itself is reported as a violation.
const RETURN_GRACE_SECONDS = 5;
// How often a locked candidate re-checks whether faculty have reopened them.
const LOCK_RECHECK_MS = 15_000;

// Every on-screen camera preview is mirrored, so the candidate sees themselves
// the way a mirror shows them: raise your right hand and the picture raises the
// hand on your right. A raw (un-mirrored) self-view is what a camera sees when
// it looks at you — the raised right hand lands on the viewer's left — which
// reads to the candidate as "it is showing my left hand". The frames captured
// for the integrity trail deliberately do NOT get this mirror (see
// captureSnapshot): evidence keeps the camera's true orientation.
const SELF_VIEW_STYLE = { transform: 'scaleX(-1)', objectPosition: 'center' } as const;

function apiError(err: any, fallback: string): string {
  return err?.response?.data?.error?.message || err?.message || fallback;
}

function emptyAnswerFor(type: string): any {
  if (type === 'msq') return { selected: [] };
  if (type === 'numerical') return { value: null };
  if (type === 'fill_blank') return { blanks: [''] };
  if (type === 'short_answer' || type === 'essay') return { text: '' };
  return { selected: '' };
}

function isAnswered(answer: any): boolean {
  if (!answer) return false;
  if (Array.isArray(answer.selected)) return answer.selected.length > 0;
  if (answer.selected !== undefined && answer.selected !== null && answer.selected !== '') return true;
  if (answer.value !== undefined && answer.value !== null && answer.value !== '') return true;
  if (Array.isArray(answer.blanks)) return answer.blanks.some((b: string) => b && b.trim() !== '');
  if (typeof answer.text === 'string') return answer.text.trim() !== '';
  return false;
}

export function ExamDelivery() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const examId = id || '';

  // Candidate-safe metadata only: the staff exam definition (which contains
  // answer keys) is never fetched from the assessment-taking surface.
  const { data: examBrief } = useExamBrief(examId);
  const startMutation = useStartExam(examId);

  const [delivery, setDelivery] = useState<ExamDeliveryData | null>(null);
  const [hasBegun, setHasBegun] = useState(false);
  const [startError, setStartError] = useState('');
  const [blockedMessage, setBlockedMessage] = useState('');
  const [answers, setAnswers] = useState<AnswerState>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Camera gate: the assessment does not start without a live camera ─────
  const [cameraState, setCameraState] = useState<
    'idle' | 'starting' | 'on' | 'denied' | 'unsupported' | 'lost'
  >('idle');
  const [cameraError, setCameraError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const briefVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraOffReportedRef = useRef(false);
  // "Camera ready" is only shown when frames are actually being rendered, so
  // the candidate can never sit an exam believing a black tile is their feed.
  // `pictureState` records *why* the picture is not confirmed, so the guidance
  // shown to the candidate matches what the camera is really doing.
  const [framesFlowing, setFramesFlowing] = useState(false);
  const [pictureState, setPictureState] = useState<'waiting' | 'live' | 'black'>('waiting');
  // Excused absences: leaving the paper starts a visible countdown; returning
  // inside the grace is excused (and still recorded), the lapse is penalised.
  const [returnCountdown, setReturnCountdown] = useState<number | null>(null);
  const returnGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Obstruction evidence: the last frame signature and when it went still.
  const lastFrameSigRef = useRef<string>('');
  const stillSinceRef = useRef<number | null>(null);
  const obstructionReportedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The authored obstruction threshold, read through a ref so the pixel poll is
  // not torn down and rebuilt when the value arrives with the delivery payload.
  const obstructionThresholdRef = useRef(CAMERA_OBSTRUCTION_AFTER_MS);
  // Device scan bookkeeping: loaded models, the consecutive-scan tracker, and the
  // last time each category was reported, so one device on a desk is one event.
  const deviceModelsRef = useRef<DeviceModels | null>(null);
  const deviceTrackerRef = useRef(new DeviceConfirmationTracker(DEVICE_MODEL_CONFIG.confirmations));
  const deviceReportedAtRef = useRef<Record<string, number>>({});
  const deviceScanCountRef = useRef(0);

  // ── Integrity state: violation counter, red warning, lockout ─────────────
  const [violations, setViolations] = useState(0);
  // Device-scan state is explicit rather than implied: the candidate can see
  // whether the analysis is actually running, and faculty can tell an
  // observation apart from a scan that never started.
  const [deviceScan, setDeviceScan] = useState<'off' | 'loading' | 'active' | 'unavailable'>(
    'off'
  );
  const [maxViolations, setMaxViolations] = useState(0);
  const [alarm, setAlarm] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockDetail, setLockDetail] = useState('');
  // The consequence of reaching the tolerance is server-authoritative: the
  // brief carries it before the paper starts and every proctoring response
  // restates it, so a change made by faculty mid-paper is reflected truthfully
  // rather than the browser assuming the harsher policy.
  const [warningPolicyFromServer, setWarningPolicyFromServer] =
    useState<ExamWarningPolicy | null>(null);

  // Integrity configuration is server-authoritative: once an attempt exists the
  // start response decides, and the brief only covers the pre-attempt screen.
  const proctoringEnabled =
    delivery?.proctoring_enabled ?? (examBrief?.config?.proctoring_enabled !== false);
  const warningPolicy: ExamWarningPolicy =
    warningPolicyFromServer ??
    delivery?.warning_policy ??
    examBrief?.config?.warning_policy ??
    'remove';
  // Both of these are authored per exam and echoed by the server, so the client
  // enforces exactly what the candidate was told (D-12).
  const deviceDetectionEnabled =
    delivery?.device_detection_enabled ??
    examBrief?.config?.device_detection_enabled === true;
  const obstructionThresholdSeconds =
    delivery?.obstruction_threshold_seconds ??
    examBrief?.config?.obstruction_threshold_seconds ??
    CAMERA_OBSTRUCTION_AFTER_MS / 1000;
  // Institutional retention for the still frames this session captures (D-2).
  const evidenceRetentionDays =
    delivery?.evidence_retention_days ?? examBrief?.config?.evidence_retention_days ?? 90;

  const attemptId = delivery?.attempt_id || '';
  const saveAnswers = useSaveExamAnswers(attemptId);
  const submitExam = useSubmitExam(attemptId);
  const recordEvent = useRecordProctoringEvent(attemptId);
  // Interval effects read the latest mutation/state through refs instead of
  // being torn down and re-created on every render.
  const recordEventRef = useRef(recordEvent);

  const answersRef = useRef<AnswerState>({});
  answersRef.current = answers;
  const submittedRef = useRef(false);
  const lastEventRef = useRef<Record<string, number>>({});
  const cameraStateRef = useRef(cameraState);
  // The camera-probe interval reads this through a ref so its effect is not
  // torn down and re-created on every render.
  const proctoringEnabledRef = useRef(proctoringEnabled);
  // The device scan reports through the *same* path as every other integrity
  // signal, so the evidence frame, the candidate's warning and the lock handling
  // behave identically. It is a ref because `reportEvent` is declared far below
  // and the scan loop must not be re-created whenever it changes.
  const reportEventRef = useRef<
    | ((
        eventType: string,
        severity: 'low' | 'medium' | 'high',
        extraDetails?: Record<string, unknown>
      ) => Promise<void>)
    | null
  >(null);

  useEffect(() => {
    recordEventRef.current = recordEvent;
    cameraStateRef.current = cameraState;
    proctoringEnabledRef.current = proctoringEnabled;
  }, [recordEvent, cameraState, proctoringEnabled]);

  const questions = delivery?.questions || [];

  // ── Camera: capture a small frame for the instructor's integrity trail ────
  const captureSnapshot = useCallback((): string | null => {
    const video = pipVideoRef.current || briefVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    const width = 320;
    const height = Math.max(1, Math.round((video.videoHeight * width) / video.videoWidth));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    try {
      ctx.drawImage(video, 0, 0, width, height);
      // The evidence frame keeps the camera's true orientation, unlike the
      // mirrored self-view on screen: `drawImage` reads the video pixels
      // directly, so the CSS mirror above never reaches this canvas. The
      // instructor must see the candidate exactly as the camera recorded them.
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch {
      return null;
    }
  }, []);

  const bindVideoElement = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    video.muted = true;
    const stream = streamRef.current;
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
    }
    if (stream && video.paused) {
      video.play().catch(() => undefined);
    }
  }, []);

  /** Ask the browser for the camera. Returns true when a live feed exists. */
  const startCamera = useCallback(async (): Promise<boolean> => {
    if (streamRef.current?.getVideoTracks().some((t) => t.readyState === 'live')) {
      setCameraState('on');
      return true;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported');
      setCameraError(
        'This browser cannot provide camera access. Camera capture requires a supported browser over https or localhost.'
      );
      return false;
    }

    // A browser that already blocked this site never settles the request, so
    // report the block directly and tell the candidate how to lift it.
    try {
      const permission = await navigator.permissions.query({ name: 'camera' });
      if (permission.state === 'denied') {
        setCameraState('denied');
        setCameraError(
          'Camera access is blocked for this site. Use the camera icon in the address bar (or your browser’s site settings) to allow the camera, then press “Turn on camera” again.'
        );
        return false;
      }
    } catch {
      /* Permissions API unavailable: fall through to the request itself. */
    }

    setCameraState('starting');
    setPictureState('waiting');
    const request = navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    // `gaveUp` is set only by the timeout. The release below must fire on the
    // timeout path alone: this handler is registered before the `await`, so it
    // runs *first* on the normal path too, when `streamRef.current` is still
    // null. Stopping the tracks there killed the camera we had just been
    // granted, leaving a black tile that the page still called "ready".
    let gaveUp = false;
    const timeout = new Promise<null>((resolve) => {
      timeoutHandle = setTimeout(() => {
        gaveUp = true;
        resolve(null);
      }, CAMERA_REQUEST_TIMEOUT_MS);
    });
    request.then(
      (late) => {
        if (gaveUp) late.getTracks().forEach((t) => t.stop());
      },
      () => undefined
    );
    const stream = await Promise.race([request, timeout]);
    clearTimeout(timeoutHandle);
    if (!stream) {
      setCameraState('denied');
      setCameraError(
        'The camera did not respond. Close any other application using the camera, then press “Turn on camera” again.'
      );
      return false;
    }
    try {
      streamRef.current = stream;
      cameraOffReportedRef.current = false;
      setCameraState('on');
      setPictureState('waiting');
      setCameraError('');
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (!submittedRef.current) setCameraState('lost');
        });
      });
      [briefVideoRef.current, pipVideoRef.current].forEach((video) => {
        if (!video) return;
        video.muted = true;
        if (video.srcObject !== stream) video.srcObject = stream;
        video.play().catch(() => undefined);
      });
      return true;
    } catch (err: any) {
      const name = String(err?.name || '');
      const denied =
        name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
      setCameraState(denied ? 'denied' : 'unsupported');
      setCameraError(
        denied
          ? 'Camera permission was denied. Allow camera access for this site in your browser, then press “Turn on camera” again.'
          : 'No usable camera was found. Connect a camera and press “Turn on camera” again.'
      );
      return false;
    }
  }, []);

  // Keep the live stream attached to whichever self-view is on screen (the
  // pre-start preview or the in-assessment picture-in-picture).
  // We set playsInline and call play() explicitly because some browsers
  // (especially on Windows/Chrome) will keep a getUserMedia stream black
  // until play() is called after the srcObject is set and the element is
  // visible in the layout.
  useEffect(() => {
    let cancelled = false;
    const attach = () => {
      if (cancelled) return;
      const stream = streamRef.current;
      if (!stream) return;
      [briefVideoRef.current, pipVideoRef.current].forEach((video) => {
        if (!video || cancelled) return;
        video.muted = true;
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        if (video.paused) {
          video.play().catch(() => undefined);
        }
      });
    };
    attach();
    const interval = setInterval(attach, 250);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cameraState, hasBegun]);

  // ── Camera truth: "ready" only when frames are actually rendered ──────────
  // A live track is not a live picture: a covered lens still reports live and
  // renders black. Readiness polls the visible video element for real pixels,
  // and the same pixel probe doubles as the obstruction detector — a frame
  // that stays identical for CAMERA_OBSTRUCTION_AFTER_MS is reported once as
  // camera_obstructed and recovers silently when motion returns.
  //
  // Polling uses whichever video element is currently mounted. During the
  // pre-start camera check that is briefVideoRef; once the attempt has begun
  // the self-view pip takes over. The probe tolerates a short settling window
  // after the stream is attached before it expects real pixels.
  useEffect(() => {
    if (cameraState !== 'on') {
      setFramesFlowing(false);
      setPictureState('waiting');
      return;
    }
    let cancelled = false;
    // Consecutive polls whose frame came back black (see BLACK_FRAME_LUMA).
    let blackSamples = 0;
    const probeVideo = () => pipVideoRef.current || briefVideoRef.current;
    const tick = () => {
      if (cancelled) return;
      const video = probeVideo();
      const track = streamRef.current?.getVideoTracks()[0];
      // A track that has ended (device unplugged, permission revoked, the camera
      // grabbed by another application) is a dead feed. Whatever the element
      // still reports, it is not a live picture.
      if (track && track.readyState !== 'live') {
        setFramesFlowing(false);
        setPictureState('waiting');
        if (cameraStateRef.current === 'on' && !submittedRef.current) setCameraState('lost');
        return;
      }
      if (
        video &&
        video.srcObject &&
        video.readyState >= 2 &&
        video.videoWidth >= MIN_FRAME_WIDTH &&
        video.videoHeight >= MIN_FRAME_HEIGHT
      ) {
        if (video.paused) {
          video.play().catch(() => undefined);
        }
        // A decoded frame is not yet a *live* picture: the placeholder frame of
        // a stopped track also satisfies readyState and has non-zero size. The
        // picture counts as live only once playback is actually progressing
        // (or the pixels themselves change between polls).
        if (video.currentTime > 0 && !framesFlowing) {
          setFramesFlowing(true);
        }
        // Downscale to a tiny signature; identical pixels for the configured
        // window mean the camera sees nothing but a still obstacle (or a
        // sleeping camera) — reported once per episode, never a verdict.
        const w = 32;
        const h = 24;
        if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          let sig = '';
          let luma = 255;
          try {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const pixels = ctx.getImageData(0, 0, w, h).data;
            let total = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              total += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
            }
            luma = total / (pixels.length / 4);
            sig = String(
              pixels.reduce((acc, byte, i) => (acc + byte * (i % 7 + 1)) % 100000, 0)
            );
          } catch {
            sig = '';
          }
          // A frame of pure black means nothing is being captured at all: a
          // closed lens shutter, a camera disabled system-wide, or another
          // application holding the device. The tile is black, so the page must
          // never describe it as a live picture.
          if (sig && luma < BLACK_FRAME_LUMA) {
            blackSamples += 1;
            lastFrameSigRef.current = sig;
            if (blackSamples >= BLACK_FRAME_SAMPLES) {
              setFramesFlowing(false);
              setPictureState('black');
            }
            return;
          }
          blackSamples = 0;
          setPictureState('live');
          const now = Date.now();
          if (sig && sig === lastFrameSigRef.current) {
            if (
              stillSinceRef.current === null &&
              hasBegun &&
              proctoringEnabledRef.current &&
              attemptId &&
              !submittedRef.current
            ) {
              stillSinceRef.current = now;
            } else if (
              stillSinceRef.current !== null &&
              now - stillSinceRef.current >= obstructionThresholdRef.current &&
              !obstructionReportedRef.current
            ) {
              obstructionReportedRef.current = true;
              const thresholdSeconds = Math.round(obstructionThresholdRef.current / 1000);
              recordEventRef.current.mutateAsync({
                event_type: 'camera_obstructed',
                severity: 'medium',
                details: {
                  reason: `frozen_frame_${thresholdSeconds}s`,
                  threshold_seconds: thresholdSeconds,
                  signature: sig,
                },
              }).catch(() => undefined);
              setAlarm('Camera covered or blocked? Your view has been still for a while. Uncover the camera so your presence stays visible.');
            }
          } else {
            if (obstructionReportedRef.current) {
              recordEventRef.current.mutateAsync({
                event_type: 'camera_snapshot',
                severity: 'low',
                details: { recovered_from: 'camera_obstructed' },
              }).catch(() => undefined);
            }
            obstructionReportedRef.current = false;
            stillSinceRef.current = null;
            lastFrameSigRef.current = sig;
          }
        }
      } else {
        // No usable frame from the element (yet): the picture is not confirmed.
        if (framesFlowing) setFramesFlowing(false);
        if (blackSamples > 0) blackSamples = 0;
      }
    };
    const handle = setInterval(tick, CAMERA_FRAME_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraState, hasBegun, attemptId, framesFlowing]);

  const cameraReady = cameraState === 'on' && framesFlowing && pictureState === 'live';

  // Keep the enforced obstruction threshold in step with the authored value.
  useEffect(() => {
    obstructionThresholdRef.current = Math.max(
      1_000,
      Math.round(obstructionThresholdSeconds * 1000)
    );
  }, [obstructionThresholdSeconds]);

  // ── On-device prohibited-device scan (ADR-024) ─────────────────────────────
  // Only runs when the exam enables it and real frames are flowing. The models
  // are large, so they load lazily on first use; a blocked CDN or a machine
  // without WebGL leaves the scan 'unavailable' and the assessment otherwise
  // untouched. Nothing here can fail a candidate: the server turns a confirmed
  // observation into a faculty review, never a verdict.
  useEffect(() => {
    if (!hasBegun || !proctoringEnabled || !deviceDetectionEnabled) {
      setDeviceScan('off');
      return;
    }
    if (cameraState !== 'on' || !framesFlowing) {
      deviceTrackerRef.current.reset();
      return;
    }

    let cancelled = false;
    // A private canvas: the snapshot canvas belongs to the evidence capture, and
    // analysis must not disturb it.
    const analysisCanvas = document.createElement('canvas');

    const run = async () => {
      if (cancelled || submittedRef.current) return;

      if (!deviceModelsRef.current) {
        setDeviceScan('loading');
        try {
          deviceModelsRef.current = await loadDeviceModels();
        } catch {
          if (!cancelled) setDeviceScan('unavailable');
          return;
        }
        if (cancelled) return;
        setDeviceScan('active');
      }

      const video = pipVideoRef.current || briefVideoRef.current;
      if (!video) return;
      const frame = frameForAnalysis(video, analysisCanvas);
      if (!frame) return;

      // The wearable classifier rides along on every third scan: it costs a
      // second full model pass, and earbuds on a desk do not appear and vanish
      // within seconds the way a phone being picked up does.
      const includeWearables = deviceScanCountRef.current % 3 === 0;
      deviceScanCountRef.current += 1;

      let found: DeviceObservation[] = [];
      try {
        found = await analyseFrame(deviceModelsRef.current, frame, DEVICE_MODEL_CONFIG, {
          includeWearables,
        });
      } catch {
        return; // a failed scan is not evidence of anything
      }
      if (cancelled) return;

      const confirmed = deviceTrackerRef.current.observe(found);
      if (!confirmed) return;
      const lastReport = deviceReportedAtRef.current[confirmed.category] ?? 0;
      if (Date.now() - lastReport < DEVICE_REPORT_COOLDOWN_MS) return;
      deviceReportedAtRef.current[confirmed.category] = Date.now();

      // Reported through the shared path, so the frame goes with the observation
      // (faculty see what the model saw) and the server's neutral reminder is
      // shown to the candidate. The server records it as evidence and raises a
      // review — no allowance is consumed and the attempt continues.
      await reportEventRef.current?.('second_device_detected', 'medium', {
        category: confirmed.category,
        confidence: Number(confirmed.confidence.toFixed(3)),
        model: confirmed.model,
        confirmations: confirmed.confirmations,
        bbox: confirmed.bbox ? confirmed.bbox.map((n) => Math.round(n)) : undefined,
        analysed_frame: { width: frame.width, height: frame.height },
      });
    };

    const handle = setInterval(run, DEVICE_SCAN_INTERVAL_MS);
    void run();
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBegun, proctoringEnabled, deviceDetectionEnabled, cameraState, framesFlowing]);

  /** Drop the current camera and ask for it again (used by recovery controls). */
  const restartCamera = useCallback(async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cameraOffReportedRef.current = false;
    lastFrameSigRef.current = '';
    stillSinceRef.current = null;
    obstructionReportedRef.current = false;
    setFramesFlowing(false);
    setPictureState('waiting');
    setCameraState('idle');
    setCameraError('');
    await startCamera();
  }, [startCamera]);

  // Release the camera when the surface goes away.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  // ── Begin / resume the attempt ─────────────────────────────────────────────
  const beginAttempt = useCallback(async () => {
    setStartError('');

    // A proctored assessment does not start without a live camera: the
    // candidate sees themselves before anything is recorded.
    const needsCamera =
      delivery?.proctoring_enabled ?? (examBrief?.config?.proctoring_enabled !== false);
    if (needsCamera && cameraStateRef.current !== 'on') {
      const ok = await startCamera();
      if (!ok) {
        setCameraError(
          'Your camera must be on before this assessment can begin. Turn on the camera below and try again.'
        );
        return;
      }
    }

    try {
      const data = await startMutation.mutateAsync(undefined);
      if (data.status === 'locked_violation') {
        setLocked(true);
        setLockDetail(
          'This session is locked pending faculty authorisation to resume.'
        );
        return;
      }
      setDelivery(data);
      setLocked(false);
      setLockDetail('');
      setRemainingSeconds(data.remaining_seconds);
      const restored: AnswerState = {};
      Object.entries(data.saved_answers || {}).forEach(([qid, saved]: [string, any]) => {
        restored[qid] = {
          answer_data: saved?.answer_data ?? emptyAnswerFor(''),
          flagged_for_review: Boolean(saved?.flagged_for_review),
        };
      });
      // Merge any locally cached draft that is newer than the server copy.
      const mirrorKey = `exam_answers_${data.attempt_id}`;
      const mirror = localStorage.getItem(mirrorKey);
      if (mirror) {
        try {
          const parsed = JSON.parse(mirror);
          Object.entries(parsed).forEach(([qid, value]: [string, any]) => {
            const existing = restored[qid];
            if (!existing || !isAnswered(existing.answer_data)) {
              restored[qid] = value;
            }
          });
        } catch {
          /* ignore corrupt draft */
        }
      }
      setAnswers(restored);
      setHasBegun(true);

      // Enter full-screen immediately so the assessment runs in a locked-down
      // viewport. This is triggered by the user's click, so the browser permits
      // it; if the request is denied (e.g. an unsupported context) we keep going
      // but surface a notice.
      if (typeof document !== 'undefined' && document.documentElement?.requestFullscreen) {
        document.documentElement
          .requestFullscreen()
          .catch(() => {
            /* Browsers may deny fullscreen outside a trusted gesture or in
               embedded contexts; the assessment is still usable. */
          });
      }




    } catch (err: any) {
      const status = err?.response?.status;
      let detail = apiError(err, 'Unable to start this assessment.');

      // Give the student a clear, actionable reason instead of a raw status code.
      if (status === 404) {
        detail =
          'This examination is not available to you. It may not exist, may not be visible yet, or you may not be enrolled in the course. Return to the examination list for available assessments.';
      } else if (status === 400) {
        detail =
          detail ||
          'This assessment cannot be started right now. The testing window may be closed, the maximum number of attempts may have been reached, or the session may be locked. Return to the examination list for guidance.';
      } else if (status === 403) {
        detail =
          'You are not authorised to start this assessment. If you believe this is an error, contact your instructor.';
      } else if (status === 423) {
        detail =
          detail ||
          'This assessment session is locked due to recorded integrity violations. Awaiting instructor authorisation to resume.';
      }

      if (status === 423) {
        setLocked(true);
        setLockDetail(detail);
      } else if (status === 403) {
        setBlockedMessage(detail);
      } else {
        setStartError(detail);
      }
    }
  }, [startMutation, startCamera, delivery, examBrief]);

  // Mirror answers to localStorage so a refresh never loses work.
  useEffect(() => {
    if (!attemptId) return;
    localStorage.setItem(`exam_answers_${attemptId}`, JSON.stringify(answers));
  }, [answers, attemptId]);

  // ── Persist a batch of answers to the server ───────────────────────────────
  const persistAnswers = useCallback(
    async (toSave: SaveAnswerPayload[]) => {
      if (!attemptId || toSave.length === 0 || submittedRef.current) return;
      setSaveState('saving');
      try {
        await saveAnswers.mutateAsync(toSave);
        setSaveState('saved');
        setNotice(null);
      } catch (err: any) {
        setSaveState('error');
        if (err?.response?.status === 400) {
          // A 400 here means the attempt can no longer accept answers: its time
          // ran out, the integrity tolerance was reached, or the server closed
          // it out. Leaving the candidate on an editor whose work cannot be
          // saved would be worse than any lost keystroke, so hand them to their
          // results with the server's own explanation.
          submittedRef.current = true;
          localStorage.removeItem(`exam_answers_${attemptId}`);
          navigate(`/exams/${examId}/results?closed=1`, { replace: true });
        }
      }
    },
    [attemptId, saveAnswers, navigate, examId]
  );

  const buildPayload = useCallback((): SaveAnswerPayload[] => {
    return Object.entries(answersRef.current)
      .filter(([, value]) => value && (isAnswered(value.answer_data) || value.flagged_for_review))
      .map(([examQuestionId, value]) => ({
        exam_question_id: examQuestionId,
        answer_data: value.answer_data,
        flagged_for_review: value.flagged_for_review,
      }));
  }, []);

  // ── Autosave cadence ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasBegun || !attemptId) return;
    const handle = setInterval(() => {
      persistAnswers(buildPayload());
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [hasBegun, attemptId, persistAnswers, buildPayload]);

  // ── Final submission ───────────────────────────────────────────────────────
  const finalize = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      try {
        await persistAnswers(buildPayload());
        await submitExam.mutateAsync();
        if (attemptId) localStorage.removeItem(`exam_answers_${attemptId}`);
        navigate(`/exams/${examId}/results`);
      } catch (err: any) {
        submittedRef.current = false;
        setNotice(
          apiError(
            err,
            auto
              ? 'The assessment time ended. Submission could not be confirmed — please retry.'
              : 'Submission failed. Please retry.'
          )
        );
      }
    },
    [persistAnswers, buildPayload, submitExam, attemptId, examId, navigate]
  );

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasBegun || submittedRef.current) return;
    const handle = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(handle);
          finalize(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(handle);
  }, [hasBegun, finalize]);

  // ── Observable proctoring telemetry ────────────────────────────────────────
  const reportEvent = useCallback(
    async (
      eventType: string,
      severity: 'low' | 'medium' | 'high',
      extraDetails?: Record<string, any>
    ) => {
      if (!attemptId || submittedRef.current) return;
      const now = Date.now();
      if (now - (lastEventRef.current[eventType] || 0) < EVENT_THROTTLE_MS) return;
      lastEventRef.current[eventType] = now;

      // Every recorded breach carries a frame of the candidate so the
      // instructor reviews what actually happened, not just a signal name.
      const details: Record<string, any> = { ...(extraDetails || {}) };
      if (cameraStateRef.current === 'on' && severity !== 'low') {
        const snapshot = captureSnapshot();
        if (snapshot) details.snapshot = snapshot;
      }

      try {
        const res = await recordEvent.mutateAsync({
          event_type: eventType,
          severity,
          details,
        });
        if (typeof res.violations_count === 'number') setViolations(res.violations_count);
        if (typeof res.max_violations === 'number') setMaxViolations(res.max_violations);
        if (res.warning_policy) setWarningPolicyFromServer(res.warning_policy);

        if (res.is_locked) {
          // Thrown out of the paper: answers stay saved, only the lecturer can
          // let the candidate back in.
          setLocked(true);
          setLockDetail(
            res.warning ||
              'This session is locked and awaits your lecturer’s authorisation to resume.'
          );
          return;
        }
        if (res.warning) setAlarm(res.warning);
        if (res.auto_submitted) {
          submittedRef.current = true;
          localStorage.removeItem(`exam_answers_${attemptId}`);
          navigate(`/exams/${examId}/results`);
        }
      } catch {
        /* Telemetry is best-effort; never interrupt the candidate for a sync failure. */
      }
    },
    [attemptId, recordEvent, navigate, examId, captureSnapshot]
  );

  useEffect(() => {
    reportEventRef.current = reportEvent;
  }, [reportEvent]);

  // Visible warning when fullscreen is lost during the attempt.
  const [fullscreenWarning, setFullscreenWarning] = useState<string | null>(null);

  // While locked, re-check on a cadence so the candidate does not have to
  // hammer the button after their lecturer reopens the attempt.
  useEffect(() => {
    if (!locked) return;
    const handle = setInterval(() => {
      beginAttempt();
    }, LOCK_RECHECK_MS);
    return () => clearInterval(handle);
  }, [locked, beginAttempt]);

  // The pulsing red warning settles into the persistent red banner after a
  // beat, so a violation is impossible to miss when it happens.
  useEffect(() => {
    if (!alarm) return;
    const handle = setTimeout(() => setAlarm(null), ALARM_VISIBLE_MS);
    return () => clearTimeout(handle);
  }, [alarm]);

  // Periodic camera frame for the instructor's trail. Evidence only: a frame
  // never counts against the candidate's tolerance.
  useEffect(() => {
    if (!hasBegun || !attemptId || !proctoringEnabled) return;
    const handle = setInterval(() => {
      if (submittedRef.current || cameraStateRef.current !== 'on') return;
      const snapshot = captureSnapshot();
      if (!snapshot) return;
      recordEventRef.current
        .mutateAsync({
          event_type: 'camera_snapshot',
          severity: 'low',
          details: { snapshot, interval_seconds: SNAPSHOT_INTERVAL_MS / 1000 },
        })
        .then((res) => {
          // Every proctoring response carries the authoritative counters; sync
          // them so the red banner always shows the true n / m even on resume.
          if (typeof res?.violations_count === 'number') setViolations(res.violations_count);
          if (typeof res?.max_violations === 'number') setMaxViolations(res.max_violations);
        })
        .catch(() => undefined);
    }, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [hasBegun, attemptId, proctoringEnabled, captureSnapshot]);

  // A camera that dies mid-attempt (device unplugged, permission revoked by
  // the OS) is recorded once per outage and stays a hard red warning until the
  // candidate restores the feed.
  useEffect(() => {
    if (!hasBegun || !proctoringEnabled) return;
    const handle = setInterval(() => {
      const state = cameraStateRef.current;
      if (state !== 'on' && state !== 'lost') return;
      if (submittedRef.current) return;
      const track = streamRef.current?.getVideoTracks()[0];
      const live = Boolean(track && track.readyState === 'live');
      if (live) {
        cameraOffReportedRef.current = false;
        return;
      }
      if (state === 'on') setCameraState('lost');
      if (!cameraOffReportedRef.current) {
        cameraOffReportedRef.current = true;
        reportEvent('camera_off', 'high', { reason: 'camera_track_lost' });
      }
    }, CAMERA_WATCHDOG_MS);
    return () => clearInterval(handle);
  }, [hasBegun, proctoringEnabled, reportEvent]);

  useEffect(() => {
    if (!hasBegun || !proctoringEnabled) return;

    const leaveGrace = () => {
      // Leaving starts the visible countdown. Returning inside the grace is
      // excused (recorded, zero penalty); letting the countdown lapse reports
      // the absence as the violation. The timer is cleared on every return so
      // the same leave never produces both outcomes.
      if (returnGraceRef.current) clearTimeout(returnGraceRef.current);
      setReturnCountdown(RETURN_GRACE_SECONDS);
      returnGraceRef.current = setTimeout(() => {
        returnGraceRef.current = null;
        setReturnCountdown(null);
        reportEvent('tab_switch', 'medium', { reason: 'left_paper_beyond_grace' });
      }, RETURN_GRACE_SECONDS * 1000);
    };
    const onVisibility = () => {
      if (document.hidden) {
        leaveGrace();
      } else {
        if (returnGraceRef.current) {
          clearTimeout(returnGraceRef.current);
          returnGraceRef.current = null;
          setReturnCountdown(null);
          reportEvent('quick_tab_return', 'low');
        }
      }
    };
    const onBlur = () => {
      if (document.hidden) return;
      if (returnGraceRef.current) return; // visibilitychange already armed it
      leaveGrace();
    };
    const isEditableTarget = (node: EventTarget | null): boolean => {
      const el = node as HTMLElement | null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      return Boolean(el.isContentEditable);
    };

    // Best-effort deterrent for copying *question content*. Selecting or moving
    // text inside an answer field is legitimate and stays untouched, as does
    // normal typing, assistive technology, and permitted accommodations.
    const onCopy = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;
      if (String(window.getSelection() || '').trim() === '') return;
      e.preventDefault();
      reportEvent('clipboard_copy_attempt', 'medium');
    };
    // Pasting into a supported answer field is permitted and never flagged.
    // A paste aimed anywhere else is recorded as an observable signal only.
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;
      reportEvent('clipboard_paste_attempt', 'medium');
    };
    const onContextMenu = (e: MouseEvent) => {
      // Allow the context menu inside answer fields (spellcheck, paste);
      // suppress it over question content where it is a copy affordance.
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;
      e.preventDefault();
      reportEvent('context_menu', 'low');
    };
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) {
        reportEvent('fullscreen_exit', 'medium');
        if (hasBegun) {
          setFullscreenWarning(
            'You left full-screen mode. This has been recorded and your instructor can review it.'
          );
        }
      } else {
        setFullscreenWarning(null);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (returnGraceRef.current) clearTimeout(returnGraceRef.current);
    };
  }, [hasBegun, proctoringEnabled, reportEvent]);

  // Tick the visible return countdown once per second.
  useEffect(() => {
    if (returnCountdown === null || returnCountdown <= 0) return;
    const handle = setTimeout(() => setReturnCountdown((n) => (n !== null ? n - 1 : null)), 1000);
    return () => clearTimeout(handle);
  }, [returnCountdown]);

  // Single source of full-screen entry: on begin (the click that started the
  // attempt is the trusted user gesture the browser requires) and again after a
  // mid-attempt reload. A re-entry triggered without a gesture may be refused by
  // the browser; that is non-fatal and the candidate can use the header control.
  useEffect(() => {
    if (!hasBegun) return;
    if (typeof document === 'undefined' || !document.documentElement?.requestFullscreen) {
      return;
    }
    if (document.fullscreenElement) return;
    document.documentElement.requestFullscreen().catch(() => {
      /* Non-fatal: the assessment remains usable without full-screen. */
    });
  }, [hasBegun]);

  // Warn before an accidental refresh/close mid-attempt.
  useEffect(() => {
    if (!hasBegun) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasBegun]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* Browsers may require a user gesture or deny the request. */
    }
  };

  // ── Answer editing ─────────────────────────────────────────────────────────
  const setAnswer = (questionId: string, answerData: any) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        answer_data: answerData,
        flagged_for_review: prev[questionId]?.flagged_for_review || false,
      },
    }));
    setSaveState('idle');
  };

  const toggleFlag = (questionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        answer_data: prev[questionId]?.answer_data ?? emptyAnswerFor(''),
        flagged_for_review: !prev[questionId]?.flagged_for_review,
      },
    }));
  };

  const goTo = (index: number) => {
    persistAnswers(buildPayload());
    setCurrentIndex(index);
  };

  const answeredCount = questions.filter((q) => isAnswered(answers[q.id]?.answer_data)).length;

  const timeLabel = useMemo(() => {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [remainingSeconds]);

  // ── Render: locked-out / blocked / error / loading states ─────────────────
  const lockedBrief =
    !hasBegun && examBrief?.latest_attempt_status === 'locked_violation';

  if (locked || lockedBrief) {
    return (
      <div className="min-h-screen bg-rose-950 p-6 flex items-center justify-center">
        <div className="max-w-xl w-full overflow-hidden rounded-xl border-4 border-rose-700 bg-white shadow-2xl">
          <div className="flex items-center gap-3 bg-rose-600 px-6 py-4 text-white animate-pulse">
            <AlertTriangle className="h-7 w-7 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-extrabold uppercase tracking-widest">
                Removed from this examination
              </p>
              <p className="text-xs font-medium text-rose-100">
                Assessment-integrity session locked
              </p>
            </div>
          </div>
          <div className="space-y-4 p-6 text-sm text-slate-700">
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">
              {lockDetail ||
                'This session reached the assessment-integrity limit and has been locked. Your answers are saved and nothing was submitted.'}
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
              <li>
                <strong>Contact your lecturer or exam invigilator now</strong> and ask them to
                reopen your attempt. They do this from the examination’s Submissions tab
                (Integrity events → Reopen).
              </li>
              <li>
                Keep this page open. Once they reopen your attempt, this page returns you to the
                assessment automatically — your remaining time is credited back for every minute
                you spent waiting.
              </li>
              <li>Your camera must be on again before you can continue.</li>
            </ol>

            <div
              className={`rounded-lg border-2 p-4 ${
                cameraState === 'on'
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-rose-300 bg-rose-50'
              }`}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                <Camera className="h-4 w-4" aria-hidden="true" /> Camera
              </p>
              <div className="mt-2 flex items-start gap-4">
                <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-md border border-slate-300 bg-slate-900">
                  <video
                    ref={(el) => {
                      briefVideoRef.current = el;
                      bindVideoElement(el);
                    }}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      v.muted = true;
                      if (streamRef.current && v.srcObject !== streamRef.current) {
                        v.srcObject = streamRef.current;
                      }
                      v.play().catch(() => undefined);
                    }}
                    onCanPlay={(e) => {
                      e.currentTarget.muted = true;
                      e.currentTarget.play().catch(() => undefined);
                    }}
                    className="h-full w-full object-cover"
                    style={SELF_VIEW_STYLE}
                  />
                  {cameraState !== 'on' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-rose-950/80 text-[10px] font-bold text-white">
                      CAMERA OFF
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  {cameraState === 'on' ? (
                    <p className="font-semibold text-emerald-700">
                      Camera ready — you can continue once your lecturer reopens the attempt.
                    </p>
                  ) : (
                    <button
                      onClick={() => startCamera()}
                      disabled={cameraState === 'starting'}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                      {cameraState === 'starting' ? 'Requesting camera…' : 'Turn on camera'}
                    </button>
                  )}
                  {cameraError && (
                    <p className="max-w-xs font-semibold text-rose-700">{cameraError}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                onClick={() => navigate('/exams')}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Return to examinations
              </button>
              <button
                onClick={beginAttempt}
                disabled={startMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {startMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                {startMutation.isPending ? 'Checking…' : 'Check whether I can continue'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              This page also re-checks automatically every {LOCK_RECHECK_MS / 1000} seconds.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (blockedMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center shadow-xs">
          <Info className="h-10 w-10 text-slate-400 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-bold text-slate-900">Assessment Unavailable</h1>
          <p className="text-sm text-slate-600 mt-2">{blockedMessage}</p>
          <button
            onClick={() => navigate('/exams')}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Return to Examinations
          </button>
        </div>
      </div>
    );
  }

  if (startError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-rose-200 p-8 text-center shadow-xs">
          <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-bold text-slate-900">Cannot Begin Assessment</h1>
          <p className="text-sm text-slate-600 mt-2">{startError}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => navigate('/exams')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={beginAttempt}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If the attempt exists but is already concluded, route the candidate to results
  // instead of re-starting and surfacing a raw API error. A locked attempt is
  // deliberately NOT treated as concluded: it must stay visible until faculty
  // reopen it.
  if (
    hasBegun &&
    delivery &&
    ['submitted', 'auto_submitted', 'graded'].includes(delivery.status)
  ) {
    navigate(`/exams/${examId}/results`, { replace: true });
    return null;
  }

  if (!hasBegun) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-2xl w-full bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            Assessment brief
          </p>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {examBrief?.title || 'Examination'}
          </h1>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>
              Duration: <strong className="text-slate-900">{examBrief?.duration_minutes ?? '—'} minutes</strong>
              {' · '}
              Total marks: <strong className="text-slate-900">{examBrief?.total_marks ?? '—'}</strong>
            </p>
            {examBrief?.instructions && (
              <p className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-slate-700">
                {examBrief.instructions}
              </p>
            )}
            {proctoringEnabled && (
              <div className="rounded-lg border-2 border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 space-y-1.5">
                <p className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Assessment integrity —
                  camera required
                </p>
                <p>
                  This assessment runs with your <strong>camera on</strong>. Your lecturer sees
                  your presence and captured frames in the integrity log, alongside browser events
                  such as leaving this window or full-screen mode. Leaving full-screen, switching
                  tabs or turning the camera off is recorded.
                </p>
                <p>
                  About once a minute a small still picture is added to that log. The{' '}
                  <strong>pictures</strong> are deleted automatically{' '}
                  {evidenceRetentionDays > 0
                    ? `after ${evidenceRetentionDays} days`
                    : 'when your institution erases them'}
                  ; the log entry itself (what happened and when) is kept, so your lecturer can
                  still review the session after the pictures are gone.
                </p>
                <p className="font-semibold">
                  Recorded events trigger a <span className="text-rose-700">red warning</span> on
                  your screen.{' '}
                  {warningPolicy === 'review' ? (
                    <>
                      Reaching this assessment's disclosed limit marks your attempt{' '}
                      <strong>for your lecturer's review</strong>. You are not removed and you may
                      keep working — an automated signal is never a verdict on its own.
                    </>
                  ) : (
                    <>
                      Reaching the limit removes you from the examination — only your lecturer can
                      reopen it.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {proctoringEnabled && (
            <div
              className={`mt-4 rounded-lg border-2 p-4 ${
                cameraReady
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-rose-300 bg-rose-50'
              }`}
            >
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                <Camera className="h-4 w-4" aria-hidden="true" /> Camera check — turn this on
                before the assessment begins
              </p>
              <div className="mt-3 flex items-start gap-4">
                <div className="relative aspect-video w-44 shrink-0 overflow-hidden rounded-md border border-slate-300 bg-slate-900">
                  <video
                    ref={(el) => {
                      briefVideoRef.current = el;
                      bindVideoElement(el);
                    }}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      v.muted = true;
                      if (streamRef.current && v.srcObject !== streamRef.current) {
                        v.srcObject = streamRef.current;
                      }
                      v.play().catch(() => undefined);
                    }}
                    onCanPlay={(e) => {
                      e.currentTarget.muted = true;
                      e.currentTarget.play().catch(() => undefined);
                    }}
                    className="h-full w-full object-cover"
                    style={SELF_VIEW_STYLE}
                  />
                  {cameraState !== 'on' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-rose-950/80 text-[10px] font-bold text-white">
                      CAMERA OFF
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-xs text-slate-700">
                  <p>
                    This is a mirrored view, so it moves the way you do — lift your right
                    hand and the picture lifts the hand on your right. It stays in the
                    corner of your screen while you answer, and frames are saved to your
                    lecturer’s integrity log in the camera’s true orientation.
                  </p>
                  {deviceDetectionEnabled && (
                    <p className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
                      This assessment checks the camera picture for prohibited devices{' '}
                      <strong>on your own device</strong>: no video is sent anywhere for that
                      check. A probable phone, earbuds or smartwatch is recorded for your
                      lecturer to review — it never fails you by itself, and you can always
                      ask them to look at it. Put such devices away before you begin.
                    </p>
                  )}
                  {cameraReady ? (
                    <p className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />{' '}
                      Camera ready — your live picture is showing
                    </p>
                  ) : cameraState === 'on' && pictureState === 'black' ? (
                    <>
                      <p className="font-bold text-rose-700">
                        Your camera is on but it is sending a black picture, so nothing is
                        being captured. Open the lens or slide the privacy shutter, check
                        that camera access is allowed for this app in your operating
                        system’s privacy settings, and close any other application that is
                        using the camera.
                      </p>
                      <button
                        type="button"
                        onClick={() => restartCamera()}
                        className="mt-1.5 text-xs font-semibold text-rose-700 underline hover:text-rose-800"
                      >
                        Restart camera
                      </button>
                    </>
                  ) : cameraState === 'on' ? (
                    <>
                      <p className="font-bold text-amber-700">
                        Camera connected, but no live picture yet. If this tile stays blank
                        for more than a few seconds, restart the camera before beginning.
                      </p>
                      <button
                        type="button"
                        onClick={() => restartCamera()}
                        className="mt-1.5 text-xs font-semibold text-rose-700 underline hover:text-rose-800"
                      >
                        Restart camera
                      </button>
                    </>
                  ) : cameraState === 'lost' ? (
                    <>
                      <p className="font-bold text-rose-700">
                        The camera stopped — it was disconnected, or another application took
                        it over. Reconnect it, then turn it back on.
                      </p>
                      <button
                        onClick={() => startCamera()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                        Turn camera back on
                      </button>
                    </>
                  ) : (
                    <button
                        onClick={() => startCamera()}
                        disabled={cameraState === 'starting'}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                        {cameraState === 'starting' ? 'Requesting camera…' : 'Turn on camera'}
                      </button>
                    )}
                  {cameraError && (
                    <p className="max-w-sm font-semibold text-rose-700">{cameraError}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={beginAttempt}
            disabled={
              startMutation.isPending ||
              (proctoringEnabled && !cameraReady) ||
              cameraState === 'starting'
            }
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {startMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}                {startMutation.isPending
                  ? 'Preparing…'
                  : examBrief?.latest_attempt_status === 'in_progress'
                  ? 'Resume attempt'
                  : 'Begin assessment'}
          </button>
          {proctoringEnabled && !cameraReady && (
            <p className="mt-2 text-center text-xs font-semibold text-rose-700">
              {cameraState === 'on'
                ? 'Waiting for your camera picture — the button unlocks once your live video appears.'
                : 'Turn on your camera to enable the button above.'}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!delivery) {
    return <PageLoading message="Preparing your assessment…" />;
  }

  const current = questions[currentIndex];
  const currentAnswer = current ? answers[current.id]?.answer_data ?? emptyAnswerFor(current.question_type) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Pulsing red frame: a recorded violation stays impossible to ignore. */}
      {violations > 0 && (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 z-40 ${
            alarm ? 'border-8 border-rose-600 animate-pulse' : 'border-4 border-rose-500'
          }`}
        />
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        {(alarm || violations > 0) && (
          <div
            role="alert"
            className={`border-b-4 px-4 py-2.5 text-xs ${
              alarm
                ? 'animate-pulse border-rose-700 bg-rose-600 text-white'
                : 'border-rose-300 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-extrabold uppercase tracking-widest">
                {alarm ? 'Integrity warning' : 'Integrity warnings recorded'}
              </span>
              <span className="font-medium">
                {alarm ||
                  `${violations} recorded event(s) — your instructor reviews this session.`}
              </span>
              {maxViolations > 0 && (
                <span className="ml-auto rounded-md border border-rose-400 bg-white/15 px-2 py-0.5 font-bold tabular-nums">
                  {violations} / {maxViolations}
                </span>
              )}
            </div>
          </div>
        )}
        {proctoringEnabled && cameraState !== 'on' && (
          <div
            role="alert"
            className="animate-pulse border-b-4 border-rose-700 bg-rose-600 px-4 py-2 text-xs text-white"
          >
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
              <CameraOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-extrabold uppercase tracking-widest">
                Camera off — this is recorded
              </span>
              <span className="font-medium">
                Your assessment requires a live camera. Restore it now to avoid further
                violations.
              </span>
              <button
                onClick={() => startCamera()}
                className="ml-auto rounded-md bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
              >
                Turn camera back on
              </button>
            </div>
          </div>
        )}
        {fullscreenWarning && (
          <div
            role="alert"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900"
          >
            <div className="mx-auto max-w-6xl flex flex-wrap items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{fullscreenWarning}</span>
              <button
                onClick={toggleFullscreen}
                className="ml-auto rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
              >
                Return to full screen
              </button>
            </div>
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Assessment in progress
            </p>
            <h1 className="truncate text-sm font-bold text-slate-900">{delivery.exam_title}</h1>
            <p className="text-[11px] text-slate-500">
              {user ? `${user.first_name} ${user.last_name}` : 'Candidate'}{' '}
              {' — '}{answeredCount} of {questions.length} answered
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {proctoringEnabled && (
              <span
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                  cameraReady
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-300 bg-rose-50 text-rose-700'
                }`}
                title="Your camera and browser signals are recorded for your instructor."
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    cameraReady ? 'bg-emerald-500' : 'animate-pulse bg-rose-600'
                  }`}
                  aria-hidden="true"
                />
                {cameraReady ? 'Camera + integrity monitoring on' : cameraState === 'on' ? 'Camera picture not confirmed' : 'Camera off — recorded'}
              </span>
            )}
            <div
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-bold tabular-nums ${
                remainingSeconds <= 300
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-white text-slate-800'
              }`}
              aria-live="off"
            >
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {timeLabel}
            </div>
            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {notice && (
          <div
            role="status"
            className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900"
          >
            <div className="mx-auto max-w-6xl">{notice}</div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          {current ? (
            <>
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    Question {currentIndex + 1} of {questions.length}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {current.marks} mark{current.marks === 1 ? '' : 's'}
                    {current.negative_marks > 0 && ` · −${current.negative_marks} on an incorrect answer`}
                  </p>
                </div>
                <button
                  onClick={() => toggleFlag(current.id)}
                  aria-pressed={Boolean(answers[current.id]?.flagged_for_review)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    answers[current.id]?.flagged_for_review
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  {answers[current.id]?.flagged_for_review ? 'Flagged' : 'Flag for review'}
                </button>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm font-medium text-slate-900">
                {current.body}
              </p>

              <div className="mt-5">
                <QuestionInput
                  question={current}
                  answer={currentAnswer}
                  onChange={(value) => setAnswer(current.id, value)}
                />
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => goTo(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                </button>
                {currentIndex < questions.length - 1 ? (
                  <button
                    onClick={() => goTo(currentIndex + 1)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      persistAnswers(buildPayload());
                      setConfirmOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" /> Submit assessment
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">This assessment has no questions.</p>
          )}
        </section>

        <aside className="lg:sticky lg:top-24 h-fit bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Navigator</h2>
            <span
              className={`text-[11px] font-medium ${
                saveState === 'error' ? 'text-rose-600' : 'text-slate-400'
              }`}
            >
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                ? 'Not saved'
                : 'Autosave on'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-6 gap-2">
            {questions.map((q, idx) => {
              const answered = isAnswered(answers[q.id]?.answer_data);
              const flagged = Boolean(answers[q.id]?.flagged_for_review);
              return (
                <button
                  key={q.id}
                  onClick={() => goTo(idx)}
                  aria-label={`Question ${idx + 1}${answered ? ', answered' : ', not answered'}${
                    flagged ? ', flagged' : ''
                  }`}
                  aria-current={idx === currentIndex ? 'true' : undefined}
                  className={`h-9 rounded-md border text-xs font-semibold transition ${
                    idx === currentIndex
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : answered
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {idx + 1}
                  {flagged && <span className="ml-0.5 text-amber-500">•</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-1 text-[11px] text-slate-500">
            <p className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-blue-50 border border-blue-200" /> Answered
            </p>
            <p className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-white border border-slate-200" /> Not answered
            </p>
          </div>
          <button
            onClick={() => {
              persistAnswers(buildPayload());
              setConfirmOpen(true);
            }}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Submit assessment
          </button>
        </aside>
      </main>

      {/* Return-grace countdown: visible, honoured, honest. Returning inside
          the grace is recorded but excused; the lapse is what gets reported. */}
      {returnCountdown !== null && returnCountdown > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-6">
          <div className="max-w-sm w-full rounded-2xl border-4 border-amber-400 bg-white p-8 text-center shadow-2xl">
            <p className="text-sm font-extrabold uppercase tracking-widest text-amber-600">
              Come back to your exam
            </p>
            <p className="mt-3 text-6xl font-black tabular-nums text-slate-900" aria-live="polite">
              {returnCountdown}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Return to the examination window within{' '}
              <strong>{returnCountdown} second{returnCountdown === 1 ? '' : 's'}</strong>. Leaving the
              paper during a live attempt is recorded either way; staying away beyond this
              grace counts as a violation.
            </p>
          </div>
        </div>
      )}

      {/* Fullscreen enforcement: after losing fullscreen the paper keeps the
          candidate's answers visible but greyed out until they re-enter. The
          browser cannot be forced every time, so ambiguity is removed instead. */}
      {proctoringEnabled && hasBegun && !isFullscreen && !fullscreenWarning && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-6">
          <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center shadow-2xl">
            <Maximize2 className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
            <p className="mt-4 text-lg font-bold text-slate-900">Return to full screen</p>
            <p className="mt-2 text-sm text-slate-600">
              This assessment runs in full-screen mode. Leaving it has been recorded. Your
              answers are safe — press the button below to continue where you left off.
            </p>
            <button
              onClick={() => {
                document.documentElement.requestFullscreen()?.catch(() => undefined);
              }}
              className="mt-6 w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Return to full screen
            </button>
          </div>
        </div>
      )}

      {/* Self-view: fixed bottom-right, mirrored so the candidate can read their
          own left/right the way a mirror shows it (SELF_VIEW_STYLE). The frames
          sent to the integrity trail are un-mirrored. */}
      {proctoringEnabled && (
        <div className="fixed bottom-4 right-4 z-40 w-44 overflow-hidden rounded-lg border-2 border-rose-600 bg-slate-900 shadow-xl">
          <div className="flex items-center justify-between bg-rose-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />
              Rec
            </span>
            <span>{cameraReady ? 'Camera on' : cameraState === 'on' ? 'Picture not confirmed' : 'Camera off'}</span>
          </div>
          <div className="relative aspect-video w-full bg-black">
            <video
              ref={(el) => {
                pipVideoRef.current = el;
                bindVideoElement(el);
              }}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                v.muted = true;
                if (streamRef.current && v.srcObject !== streamRef.current) {
                  v.srcObject = streamRef.current;
                }
                v.play().catch(() => undefined);
              }}
              onCanPlay={(e) => {
                e.currentTarget.muted = true;
                e.currentTarget.play().catch(() => undefined);
              }}
              className="h-full w-full object-cover"
              style={SELF_VIEW_STYLE}
            />
            {cameraState !== 'on' && (
              <div className="absolute inset-0 flex items-center justify-center bg-rose-950/85 text-[10px] font-extrabold text-white">
                CAMERA OFF
              </div>
            )}
          </div>
          {proctoringEnabled && deviceDetectionEnabled && (
            <div className="border-t border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-300">
              {deviceScan === 'active'
                ? 'Device check: on this device'
                : deviceScan === 'loading'
                  ? 'Device check: loading'
                  : deviceScan === 'unavailable'
                    ? 'Device check: unavailable'
                    : 'Device check: waiting for camera'}
            </div>
          )}
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-exam-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h2 id="submit-exam-title" className="text-base font-bold text-slate-900">
              Submit assessment?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              You have answered {answeredCount} of {questions.length} questions.
              {answeredCount < questions.length && (
                <span className="text-amber-700">
                  {' '}
                  {questions.length - answeredCount} question(s) remain unanswered and will be
                  marked as such.
                </span>
              )}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Once submitted, your responses are final and are sent for evaluation.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Continue working
              </button>
              <button
                onClick={() => finalize(false)}
                disabled={submitExam.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitExam.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Submit and finish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Question input renderers ────────────────────────────────────────────────

function QuestionInput({
  question,
  answer,
  onChange,
}: {
  question: ExamDeliveryQuestion;
  answer: any;
  onChange: (value: any) => void;
}) {
  const type = question.question_type;

  if (type === 'mcq' || type === 'true_false') {
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">Select one option</legend>
        {question.options.map((option) => {
          const valueToStore = type === 'true_false' ? (option.body || option.label).toLowerCase() : option.label;
          const checked = answer?.selected === valueToStore;
          return (
            <label
              key={option.label}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name={question.id}
                className="mt-0.5 h-4 w-4 text-blue-600"
                checked={checked}
                onChange={() => onChange({ selected: valueToStore })}
              />
              <span className="text-slate-800">
                <span className="font-semibold text-slate-500 mr-2">{option.label}.</span>
                {option.body}
              </span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  if (type === 'msq') {
    const selected: string[] = Array.isArray(answer?.selected) ? answer.selected : [];
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">Select all that apply</legend>
        {question.options.map((option) => {
          const checked = selected.includes(option.label);
          return (
            <label
              key={option.label}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded text-blue-600"
                checked={checked}
                onChange={() =>
                  onChange({
                    selected: checked
                      ? selected.filter((l) => l !== option.label)
                      : [...selected, option.label],
                  })
                }
              />
              <span className="text-slate-800">
                <span className="font-semibold text-slate-500 mr-2">{option.label}.</span>
                {option.body}
              </span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  if (type === 'numerical') {
    return (
      <div>
        <label htmlFor={`q-${question.id}`} className="block text-xs font-medium text-slate-600 mb-1.5">
          Your answer
        </label>
        <input
          id={`q-${question.id}`}
          type="number"
          inputMode="decimal"
          step="any"
          value={answer?.value ?? ''}
          onChange={(e) => onChange({ value: e.target.value === '' ? null : Number(e.target.value) })}
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
        />
      </div>
    );
  }

  if (type === 'fill_blank') {
    const blanks: string[] = Array.isArray(answer?.blanks) && answer.blanks.length ? answer.blanks : [''];
    return (
      <div className="space-y-2">
        {blanks.map((value, idx) => (
          <div key={idx}>
            <label
              htmlFor={`q-${question.id}-${idx}`}
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Blank {idx + 1}
            </label>
            <input
              id={`q-${question.id}-${idx}`}
              type="text"
              value={value}
              onChange={(e) => {
                const next = [...blanks];
                next[idx] = e.target.value;
                onChange({ blanks: next });
              }}
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ blanks: [...blanks, ''] })}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          Add another blank
        </button>
      </div>
    );
  }

  // short_answer / essay / anything else
  const rows = type === 'essay' ? 10 : 5;
  return (
    <div>
      <label htmlFor={`q-${question.id}`} className="block text-xs font-medium text-slate-600 mb-1.5">
        Your answer
      </label>
      <textarea
        id={`q-${question.id}`}
        rows={rows}
        value={answer?.text || ''}
        onChange={(e) => onChange({ text: e.target.value })}
        className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-600 focus:outline-none"
        placeholder="Type your response…"
      />
    </div>
  );
}

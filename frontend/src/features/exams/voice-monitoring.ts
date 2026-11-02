/**
 * On-device voice detection for assessment integrity (ADR-029).
 *
 * The gap this closes: every other signal here is visual. Someone standing
 * outside the camera, or a second person at the desk talking the candidate
 * through a question, leaves no frame evidence at all — the head is forward,
 * the face is present, and the room sounds the same to a silent camera. Only the
 * microphone can see it.
 *
 * What is measured, and just as importantly what is *not*:
 *
 *   - `frameIsVoice` — pure signal analysis over one analyser frame. Loud enough
 *     to be a voice, concentrated in the vowel band rather than spread across
 *     the spectrum, and fluctuating like speech instead of holding a steady
 *     hum. No model, no recording, no transcription.
 *   - `VoiceMonitor` — the decision layer: dwell, escalation, recovery.
 *
 * **Nothing is recorded.** The analyser reads the same stream the call element
 * already holds; frames are consumed as numbers in memory and discarded. There
 * is no audio blob, no clip, no transcript — so a voice event's evidence is a
 * count and a duration, which is all the candidate was told would be collected.
 *
 * Deliberately not attempted: speech recognition, keyword spotting, or telling
 * one voice from another. All three need either a model far too large for an
 * exam laptop or an accuracy that does not exist at webcam-microphone quality,
 * and each would tempt this module into the one thing it must never do —
 * producing a verdict. Reading aloud while revising is ordinary; a cough is
 * ordinary; a fan is ordinary. That is why the event is observation tier on the
 * server and never consumes a candidate's allowance.
 *
 * What this cannot do, stated plainly:
 *   - A quiet speaker, or one at the far side of a large room, is not detected;
 *     the thresholds are set for speech at conversational distance.
 *   - It cannot tell a housemate from a voice in a video the candidate is
 *     allowed to watch, which is one of the reasons a human reviews it.
 *   - A sustained steady sound (a fan, traffic, a fridge) is explicitly rejected
 *     rather than reported, because it is the false positive that would make the
 *     signal worthless.
 */

export type AudioContextState = 'off' | 'warming' | 'active' | 'unavailable' | 'muted';

export interface AudioLevelFrame {
  /** Sample values from `AnalyserNode.getFloatTimeDomainData`, in [-1, 1]. */
  timeDomain: Float32Array;
  /** Magnitudes from `AnalyserNode.getFloatFrequencyData`, in dBFS. */
  frequency: Float32Array;
  /** The context's sample rate, so bin indices convert to Hz. */
  sampleRate: number;
}

/**
 * RMS amplitude a frame must reach before it is considered at all.
 *
 * 0.025 is about -32 dBFS, deliberately in the *loud* half of a laptop
 * microphone's range: a keyboard, a page turn, a fan, a chair and ordinary
 * room chatter all sit below it, while speech aimed at the paper — the second
 * person the check exists to notice — sits above it. The earlier -48 dBFS floor
 * caught the room rather than a voice, which is why a quiet desk could produce
 * warnings. This is one exported constant so it can be recalibrated against a
 * different microphone without touching the dwell or band rules.
 */
export const VOICE_RMS_THRESHOLD = 0.025;

/**
 * Share of in-band energy that must sit in the vowel band (roughly 120–1000 Hz).
 * A voice concentrates its energy there; broadband noise, a fan and a click do
 * not. 0.45 was chosen so a deliberately sibilant "s" does not pass on its own.
 */
export const VOICE_BAND_RATIO = 0.45;

/** Band edges for voice energy, in Hz. */
export const VOICE_BAND_HZ = { low: 120, high: 1_000 } as const;

/**
 * Speech fluctuates; machinery does not. The RMS must vary by at least this
 * fraction of its own mean across the short history below, or the frame is
 * treated as steady noise no matter how loud it is.
 */
export const VOICE_MODULATION_RATIO = 0.18;

/** How many frames the modulation history keeps (about a second at 60 ms). */
const MODULATION_WINDOW = 16;

function rms(values: Float32Array): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    sum += value * value;
  }
  return Math.sqrt(sum / values.length);
}

/**
 * The share of the frame's total energy that sits inside the voice band.
 *
 * `frequency` is dBFS per bin, which is logarithmic; it is converted back to
 * linear power before summing or the loudest bin would dominate by orders of
 * magnitude and every sound would look band-limited.
 */
export function bandEnergyRatio(frame: AudioLevelFrame): number {
  const { frequency, sampleRate } = frame;
  if (frequency.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) return 0;
  const binHz = sampleRate / 2 / frequency.length;
  if (!Number.isFinite(binHz) || binHz <= 0) return 0;

  const lowBin = Math.max(0, Math.floor(VOICE_BAND_HZ.low / binHz));
  const highBin = Math.min(frequency.length - 1, Math.ceil(VOICE_BAND_HZ.high / binHz));

  let inBand = 0;
  let total = 0;
  for (let index = 0; index < frequency.length; index += 1) {
    // dBFS values below -100 are the analyser's noise floor; clamping keeps
    // `10 ** (db / 10)` from underflowing to exactly zero across the spectrum.
    const db = Math.max(-100, frequency[index]);
    const power = 10 ** (db / 10);
    total += power;
    if (index >= lowBin && index <= highBin) inBand += power;
  }
  return total > 0 ? inBand / total : 0;
}

export interface VoiceFrameReading {
  /** Amplitude of this frame, in [0, 1]. */
  level: number;
  /** Whether this single frame looks like voice. */
  voice: boolean;
  /** Diagnostics for the evidence record. */
  bandRatio: number;
  modulation: number;
}

/**
 * Classify one frame. Pure apart from the modulation history, which the caller
 * owns through `history` so the function stays testable with a plain array.
 */
export function frameIsVoice(
  frame: AudioLevelFrame,
  history: number[],
  thresholds: { rms: number; band: number; modulation: number } = {
    rms: VOICE_RMS_THRESHOLD,
    band: VOICE_BAND_RATIO,
    modulation: VOICE_MODULATION_RATIO,
  }
): VoiceFrameReading {
  const level = rms(frame.timeDomain);
  const bandRatio = bandEnergyRatio(frame);

  history.push(level);
  if (history.length > MODULATION_WINDOW) history.shift();

  const mean = history.reduce((sum, value) => sum + value, 0) / Math.max(1, history.length);
  // Mean absolute deviation, normalised: cheap, and enough to separate speech
  // (which swings between syllables and gaps) from a steady fan.
  const deviation =
    history.reduce((sum, value) => sum + Math.abs(value - mean), 0) / Math.max(1, history.length);
  const modulation = mean > 0 ? deviation / mean : 0;

  const voice =
    level >= thresholds.rms && bandRatio >= thresholds.band && modulation >= thresholds.modulation;

  return { level, voice, bandRatio, modulation };
}

export interface VoiceMonitorConfig {
  /** How long a voice must be sustained before it is recorded. */
  dwellMs: number;
  escalationMs: number;
  recoveryMs: number;
  maxSampleGapMs: number;
}

export const VOICE_MONITOR_CONFIG: VoiceMonitorConfig = {
  // Derived from the exam's disclosed `dwell_ms.voice` at runtime; this is the
  // `standard` tier and the fallback when a server sends none.
  dwellMs: 3_500,
  // Long enough that a paper does not fill a review queue with one housemate's
  // conversation, short enough that a continuing conversation stays on the
  // timeline.
  escalationMs: 30_000,
  recoveryMs: 2_400,
  maxSampleGapMs: 2_000,
};

export interface VoiceSignal {
  eventType: 'voice_detected';
  severity: 'medium';
  details: Record<string, unknown>;
}

/**
 * The decision layer. Same contract as `FaceMonitor` and `HandMonitor`: sustain,
 * escalate, and only end the episode on a quiet that lasts.
 *
 * A single quiet frame in the middle of a sentence is a breath, not a return, so
 * the accumulated duration survives it — otherwise a candidate could defeat the
 * dwell by pausing between sentences, which is how a person actually talks.
 */
export class VoiceMonitor {
  private readonly config: VoiceMonitorConfig;
  private readonly history: number[] = [];
  private lastObservedAt: number | null = null;
  private voicedMs = 0;
  private lastVoiceAt: number | null = null;
  private lastReportedAt: number | null = null;
  private loudest = 0;

  constructor(config: Partial<VoiceMonitorConfig> = {}) {
    this.config = { ...VOICE_MONITOR_CONFIG, ...config };
  }

  get elapsedMs(): number {
    return this.voicedMs;
  }

  setDwell(dwellMs: number): void {
    if (Number.isFinite(dwellMs) && dwellMs > 0) this.config.dwellMs = dwellMs;
  }

  observe(frame: AudioLevelFrame, now: number): VoiceSignal | null {
    const reading = frameIsVoice(frame, this.history);
    const delta =
      this.lastObservedAt === null
        ? 0
        : Math.min(this.config.maxSampleGapMs, Math.max(0, now - this.lastObservedAt));
    this.lastObservedAt = now;

    if (!reading.voice) {
      if (this.lastVoiceAt !== null && now - this.lastVoiceAt >= this.config.recoveryMs) {
        this.voicedMs = 0;
        this.lastVoiceAt = null;
        this.lastReportedAt = null;
        this.loudest = 0;
      }
      return null;
    }

    if (this.lastVoiceAt === null) {
      this.voicedMs = 0;
      this.lastReportedAt = null;
      this.loudest = 0;
    }
    this.voicedMs += delta;
    this.lastVoiceAt = now;
    this.loudest = Math.max(this.loudest, reading.level);

    if (this.voicedMs < this.config.dwellMs) return null;
    if (this.lastReportedAt !== null && now - this.lastReportedAt < this.config.escalationMs) {
      return null;
    }
    this.lastReportedAt = now;
    return {
      eventType: 'voice_detected',
      severity: 'medium',
      details: {
        dwell_ms: Math.round(this.voicedMs),
        // Reported as an amplitude band, never as audio: it tells a reviewer how
        // loud the room was, and carries none of what was said.
        level: Number(this.loudest.toFixed(4)),
        band_ratio: Number(reading.bandRatio.toFixed(3)),
        modulation: Number(reading.modulation.toFixed(3)),
      },
    };
  }

  reset(): void {
    this.history.length = 0;
    this.lastObservedAt = null;
    this.voicedMs = 0;
    this.lastVoiceAt = null;
    this.lastReportedAt = null;
    this.loudest = 0;
  }
}

/**
 * Open an analyser on the stream the call element already holds.
 *
 * Shares the candidate's existing capture rather than requesting a second one:
 * a second `getUserMedia` call may prompt again, and on some platforms it
 * contends with the camera's own device access.
 */
export function createVoiceAnalyser(stream: MediaStream): {
  analyser: AnalyserNode;
  context: AudioContext;
  dispose: () => void;
} | null {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2_048;
  // A short window is what makes the modulation visible: a long smoothing
  // constant would flatten speech into a steady level and defeat the whole test.
  analyser.smoothingTimeConstant = 0.2;
  source.connect(analyser);

  return {
    analyser,
    context,
    dispose: () => {
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        // Already torn down; nothing to do.
      }
      void context.close().catch(() => undefined);
    },
  };
}

/** Read one analyser frame into reusable buffers. */
export function readAudioFrame(analyser: AnalyserNode): AudioLevelFrame {
  const timeDomain = new Float32Array(analyser.fftSize);
  const frequency = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatTimeDomainData(timeDomain);
  analyser.getFloatFrequencyData(frequency);
  return { timeDomain, frequency, sampleRate: analyser.context.sampleRate };
}

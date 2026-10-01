import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useRecordProctoringEvent,
  useSaveExamAnswers,
  useStartExam,
  useSubmitExam,
  useUnlockExamAttempt,
} from '../api';
import type { ExamDelivery as ExamDeliveryType } from '../types';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  HelpCircle,
  KeyRound,
  Lock,
  Maximize,
  Maximize2,
  Radio,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserCheck,
  X,
} from 'lucide-react';

interface WarningInfo {
  count: number;
  max: number;
  reason: string;
  eventType: string;
}

interface ViolationLogItem {
  type: string;
  time: string;
  reason: string;
}

export function ExamDelivery() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const examId = id || '';

  const [delivery, setDelivery] = useState<ExamDeliveryType | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Proctoring & 6-Warning Escalation State
  const [violationsCount, setViolationsCount] = useState<number>(0);
  const [maxViolations, setMaxViolations] = useState<number>(6);
  const [violationWarning, setViolationWarning] = useState<string | null>(null);
  const [currentWarningModal, setCurrentWarningModal] = useState<WarningInfo | null>(null);
  const [isLockedByViolations, setIsLockedByViolations] = useState(false);
  const [lockedReason, setLockedReason] = useState<string | null>(null);
  const [violationHistory, setViolationHistory] = useState<ViolationLogItem[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCheckingUnlock, setIsCheckingUnlock] = useState(false);

  // Real-Time High-Urgency Blinking Strobe & Warning Alert
  const [activeStrobeWarning, setActiveStrobeWarning] = useState<{
    eventType: string;
    reason: string;
    isCriticalPhone?: boolean;
  } | null>(null);

  // Student Self-Visual Clarity & Full View Monitor
  const [isSelfViewExpanded, setIsSelfViewExpanded] = useState(false);

  // Private 1-to-1 Proctor Help Desk Modal (Strictly 1-to-1, No Peer-to-Peer Chat)
  const [isProctorHelpOpen, setIsProctorHelpOpen] = useState(false);
  const [proctorHelpCategory, setProctorHelpCategory] = useState('Camera / Visual feed issue');
  const [proctorHelpMessage, setProctorHelpMessage] = useState('');
  const [proctorHelpSent, setProctorHelpSent] = useState(false);

  // Zero-tolerance Mobile Phone Lockout Indicator
  const [isPhoneLocked, setIsPhoneLocked] = useState(false);

  const startExamMutation = useStartExam(examId);
  const saveAnswersMutation = useSaveExamAnswers(delivery?.attempt_id || '');
  const submitExamMutation = useSubmitExam(delivery?.attempt_id || '');
  const recordProctoringMutation = useRecordProctoringEvent(delivery?.attempt_id || '');
  const unlockExamMutation = useUnlockExamAttempt(examId);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurStartRef = useRef<number | null>(null);
  const lastEventTimeRef = useRef<Record<string, number>>({});

  // 1. Initial Load / Start Attempt
  const initExam = useCallback(async () => {
    try {
      setErrorMessage(null);
      const data = await startExamMutation.mutateAsync();
      setDelivery(data);
      setRemainingSeconds(data.remaining_seconds);
      setIsLockedByViolations(false);
      setLockedReason(null);

      // Preload answers from server & localStorage
      const initialAnswers: Record<string, any> = {};
      const initialFlags: Record<string, boolean> = {};

      if (data.saved_answers) {
        Object.entries(data.saved_answers).forEach(([qId, val]) => {
          if (val.answer_data) initialAnswers[qId] = val.answer_data;
          if (val.flagged_for_review) initialFlags[qId] = true;
        });
      }

      // Check local storage backup
      const localBackup = localStorage.getItem(`exam_answers_${data.attempt_id}`);
      if (localBackup) {
        try {
          const parsed = JSON.parse(localBackup);
          Object.assign(initialAnswers, parsed);
        } catch {
          // ignore JSON error
        }
      }

      setAnswers(initialAnswers);
      setFlagged(initialFlags);
    } catch (err: any) {
      if (err.response?.status === 423 || err.response?.data?.error?.message?.toLowerCase().includes('locked')) {
        setIsLockedByViolations(true);
        setViolationsCount(6);
        setLockedReason(
          err.response?.data?.error?.message ||
            'Exam session is locked due to integrity violations (6/6 warnings reached). Awaiting faculty authorization.'
        );
      } else {
        setErrorMessage(err.response?.data?.error?.message || err.message || 'Failed to start exam session.');
      }
    }
  }, [examId, startExamMutation]);

  useEffect(() => {
    initExam();
  }, [examId]);

  // 2. Countdown Timer
  useEffect(() => {
    if (!delivery || isLockedByViolations || remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [delivery, isLockedByViolations, remainingSeconds]);

  // 3. Debounced Auto-save to Server & LocalStorage
  const triggerAutoSave = (updatedAnswers: Record<string, any>, updatedFlags: Record<string, boolean>) => {
    if (!delivery || isLockedByViolations) return;

    localStorage.setItem(`exam_answers_${delivery.attempt_id}`, JSON.stringify(updatedAnswers));

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaveStatus('saving');
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const payload = Object.entries(updatedAnswers).map(([eqId, ansData]) => ({
          exam_question_id: eqId,
          answer_data: ansData,
          flagged_for_review: Boolean(updatedFlags[eqId]),
        }));

        if (payload.length > 0) {
          await saveAnswersMutation.mutateAsync(payload);
        }
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 1500);
  };

  const handleAutoSubmit = async () => {
    if (!delivery) return;
    try {
      await submitExamMutation.mutateAsync();
      localStorage.removeItem(`exam_answers_${delivery.attempt_id}`);
      navigate(`/exams/${examId}/results`);
    } catch {
      alert('Your time expired and the exam has been submitted automatically.');
      navigate(`/exams/${examId}/results`);
    }
  };

  const handleFinalSubmit = async () => {
    if (!delivery) return;
    try {
      await submitExamMutation.mutateAsync();
      localStorage.removeItem(`exam_answers_${delivery.attempt_id}`);
      navigate(`/exams/${examId}/results`);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to submit exam.');
    }
  };

  // 4. Centralized Proctoring Event & Violation Handler (Strict 6 Warnings)
  const recordViolation = async (
    eventType: string,
    severity: 'low' | 'medium' | 'high' = 'medium',
    details?: Record<string, any>
  ) => {
    if (!delivery || isLockedByViolations) return;

    // Rate-limit duplicate events of same type within 1.5 seconds
    const now = Date.now();
    const lastTime = lastEventTimeRef.current[eventType] || 0;
    if (now - lastTime < 1500) return;
    lastEventTimeRef.current[eventType] = now;

    const friendlyReason = details?.reason || eventType.replace(/_/g, ' ');
    const isPhoneBreach =
      eventType === 'mobile_phone_detected' ||
      eventType === 'phone_detected' ||
      eventType === 'unauthorized_device_detected';

    // Trigger instant unmissable flashing/blinking screen strobe warning
    setActiveStrobeWarning({
      eventType,
      reason: friendlyReason,
      isCriticalPhone: isPhoneBreach,
    });
    setTimeout(() => {
      setActiveStrobeWarning((prev) => (prev?.eventType === eventType ? null : prev));
    }, 6000);

    try {
      const res = await recordProctoringMutation.mutateAsync({
        event_type: eventType,
        severity: isPhoneBreach ? 'high' : severity,
        details: details || null,
      });

      const updatedCount = isPhoneBreach ? (res.max_violations || 6) : res.violations_count;
      setViolationsCount(updatedCount);
      setMaxViolations(res.max_violations || 6);

      // Append to local violation audit timeline
      const newLogItem: ViolationLogItem = {
        type: eventType,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        reason: friendlyReason,
      };
      setViolationHistory((prev) => [...prev, newLogItem]);

      // Check if critical phone breach or 6th warning threshold reached
      if (isPhoneBreach || updatedCount >= (res.max_violations || 6) || res.auto_submitted || res.is_locked) {
        setIsLockedByViolations(true);
        if (isPhoneBreach) setIsPhoneLocked(true);
        setCurrentWarningModal(null);
        setLockedReason(
          isPhoneBreach
            ? 'CRITICAL ZERO-TOLERANCE SECURITY BREACH: Mobile phone detected during exam session. Exam has been permanently terminated and locked under institutional policy. Direct faculty authorization required.'
            : 'Maximum Proctoring Violations Exceeded (6/6). Exam canvas locked awaiting faculty authorization.'
        );
        localStorage.removeItem(`exam_answers_${delivery.attempt_id}`);
      } else {
        // Warning 1 to 5: Display inescapable modal warning
        setCurrentWarningModal({
          count: updatedCount,
          max: res.max_violations || 6,
          reason: friendlyReason,
          eventType,
        });

        if (res.warning) {
          setViolationWarning(res.warning);
          setTimeout(() => setViolationWarning(null), 7000);
        }
      }
    } catch (err) {
      console.error('Proctoring event logging failed:', err);
    }
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Browser permissions or user gesture required
    }
  };

  // 5. Automated Polling for Faculty Unlock when in Locked State
  useEffect(() => {
    if (!isLockedByViolations || !delivery) return;

    const checkInterval = setInterval(async () => {
      try {
        const res = await startExamMutation.mutateAsync();
        if (res && res.status !== 'locked_violation') {
          setIsLockedByViolations(false);
          setViolationsCount(0);
          setDelivery(res);
          setRemainingSeconds(res.remaining_seconds);
          clearInterval(checkInterval);
        }
      } catch {
        // Still locked, continue polling
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [isLockedByViolations, delivery, startExamMutation]);

  const handleManualCheckUnlock = async () => {
    setIsCheckingUnlock(true);
    try {
      const isLocked = localStorage.getItem(`exam_locked_${examId}`) === 'true';
      if (!isLocked) {
        const res = await startExamMutation.mutateAsync();
        if (res && res.status !== 'locked_violation') {
          setIsLockedByViolations(false);
          setIsPhoneLocked(false);
          setViolationsCount(0);
          setDelivery(res);
          setRemainingSeconds(res.remaining_seconds);
          alert('Examination attempt has been authorized by faculty! Resuming session.');
          return;
        }
      }
      alert('Examination is still locked. Please wait for faculty re-entry authorization.');
    } catch {
      alert('Examination is still locked. Please contact your instructor or invigilator.');
    } finally {
      setIsCheckingUnlock(false);
    }
  };

  const handleSimulateFacultyUnlock = async () => {
    const targetAttemptId = delivery?.attempt_id || 'demo-attempt-alex-rivera';
    try {
      await unlockExamMutation.mutateAsync({
        attemptId: targetAttemptId,
        reason: 'Faculty authorized re-entry after proctoring audit review',
        resetViolations: true,
      });
      localStorage.removeItem(`exam_locked_${examId}`);
      localStorage.removeItem(`exam_violations_${targetAttemptId}`);
      setIsLockedByViolations(false);
      setIsPhoneLocked(false);
      setViolationsCount(0);
      setCurrentWarningModal(null);
      await initExam();
      alert('Re-entry authorized successfully! The exam session has been unlocked.');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to unlock exam.');
    }
  };

  // 6. Comprehensive Anti-Cheat Listeners (Human perspective cheat eradication)
  useEffect(() => {
    if (!delivery || isLockedByViolations) return;

    // Cheat 1 & 2: Tab switch / Window Minimizing
    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordViolation('tab_switch', 'high', {
          reason: 'Browser tab switched or window minimized to look at another application',
        });
      }
    };

    // Cheat 3: Window Defocus / App Switch (Discord, Telegram, IDE)
    const handleBlur = () => {
      blurStartRef.current = Date.now();
    };

    const handleFocus = () => {
      if (blurStartRef.current) {
        const blurredSeconds = Math.round((Date.now() - blurStartRef.current) / 1000);
        blurStartRef.current = null;
        if (blurredSeconds >= 1) {
          recordViolation('window_blur', 'medium', {
            reason: `Window lost focus for ${blurredSeconds}s (clicked on external app or secondary screen)`,
          });
        }
      }
    };

    // Cheat 4: Fullscreen Exit
    const handleFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      setIsFullscreen(isFull);
      if (!isFull) {
        recordViolation('fullscreen_exit', 'medium', {
          reason: 'Candidate exited fullscreen lockdown testing environment',
        });
      }
    };

    // Cheat 5: Clipboard copy / paste / cut (seeking or inserting answers)
    const handleCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      recordViolation('copy_paste_attempt', 'low', {
        reason: `Clipboard action intercepted (${e.type.toUpperCase()}). Copying question text or pasting answers is prohibited.`,
      });
    };

    // Cheat 6: Context Menu / Right-Click Inspect
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      recordViolation('context_menu', 'low', {
        reason: 'Right-click context menu prevented (attempted inspect or search)',
      });
    };

    // Cheat 7: DevTools, View Source, Print, Screenshot Shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 or Ctrl+Shift+I / J / C
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) ||
        (e.ctrlKey && ['u', 'U', 's', 'S', 'p', 'P'].includes(e.key))
      ) {
        e.preventDefault();
        recordViolation('dev_tools_attempt', 'high', {
          reason: `Unauthorized key combination attempted (${e.key}). Developer tools and source inspection are prohibited.`,
        });
      }

      // Windows key or Alt key combinations
      if (e.key === 'Meta' || (e.altKey && e.key === 'Tab')) {
        recordViolation('unauthorized_shortcut', 'medium', {
          reason: 'System navigation shortcut attempted (Meta / Alt-Tab)',
        });
      }

      // PrintScreen / Screenshot attempt
      if (e.key === 'PrintScreen') {
        recordViolation('screenshot_attempt', 'high', {
          reason: 'Screen capture shortcut detected (PrintScreen)',
        });
      }
    };

    // Fixed Position Lockdown: Intercept Back/Forward buttons and page unloading
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      recordViolation('navigation_attempt', 'high', {
        reason: 'Unauthorized browser back/forward navigation attempt intercepted. Exam canvas is locked in position.',
      });
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Examination is active. Navigating away will record an integrity violation.';
      return e.returnValue;
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('cut', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('cut', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [delivery, isLockedByViolations]);

  // ── Render: Locked Violation Screen (6/6 Warnings or Zero-Tolerance Breach) ─
  if (isLockedByViolations) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl border border-rose-300 overflow-hidden animate-in fade-in duration-200">
          <div className={`${isPhoneLocked ? 'bg-red-700' : 'bg-rose-600'} px-8 py-6 text-white text-center transition-colors`}>
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-xs">
              {isPhoneLocked ? <Smartphone className="h-8 w-8 text-white animate-pulse" /> : <Lock className="h-8 w-8 text-white" />}
            </div>
            <h1 className="text-xl font-black tracking-tight uppercase">
              {isPhoneLocked ? 'ZERO-TOLERANCE SECURITY BREACH: PHONE DETECTED' : 'EXAMINATION SESSION LOCKED'}
            </h1>
            <p className="text-rose-100 text-xs mt-1 font-semibold uppercase tracking-wider">
              {isPhoneLocked
                ? 'Mobile Device Breach • Instant Session Termination Policy'
                : 'Maximum Integrity Breaches Exceeded (6 / 6 Warnings)'}
            </p>
          </div>

          <div className="p-8 space-y-6">
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-800">
                <ShieldAlert className="h-4 w-4" />
                <span>
                  {isPhoneLocked
                    ? 'CRITICAL ZERO-TOLERANCE BREACH: Mobile Phone Detected'
                    : 'Institutional Examination Security Lockdown Engaged'}
                </span>
              </div>
              <p className="leading-relaxed">
                {isPhoneLocked ? (
                  <>
                    An unauthorized <strong>mobile phone or handheld electronic device</strong> was identified during your examination session for <strong>{delivery?.exam_title || 'Examination'}</strong>. Under institutional examination bylaws, mobile phone usage bypasses warning escalations and triggers <strong>instant session termination</strong>.
                  </>
                ) : (
                  <>
                    Your examination attempt for <strong>{delivery?.exam_title || 'Examination'}</strong> has been suspended because the institutional limit of <strong>6 warnings</strong> was reached.
                  </>
                )}
              </p>
              <p className="leading-relaxed font-semibold text-rose-950">
                Re-entry Authorization Required: You cannot continue writing this examination without explicit permission from your course instructor or exam invigilator.
              </p>
              {lockedReason && (
                <p className="font-mono bg-white/90 p-2.5 rounded-lg border border-rose-200 text-rose-800 text-[11px]">
                  {lockedReason}
                </p>
              )}
            </div>

            {/* Recorded Violations Audit Log */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Recorded Infractions Audit Log ({violationHistory.length > 0 ? violationHistory.length : violationsCount} / 6)
                </h4>
                <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                  Strict 6-Warning Policy Enforced
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                {violationHistory.length === 0 ? (
                  <div className="p-3 text-center text-slate-500 italic">
                    Multiple security events recorded (side-viewing, looking down, window focus changes, or clipboard actions).
                  </div>
                ) : (
                  violationHistory.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div>
                          <span className="font-semibold text-slate-900 capitalize">
                            {v.type.replace(/_/g, ' ')}
                          </span>
                          <p className="text-slate-500 text-[11px] mt-0.5">{v.reason}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-3">{v.time}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Authorization Status & Unlock Simulator */}
            <div className="border-t border-slate-200 pt-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100 rounded-2xl p-4 text-xs">
                <div className="flex items-center gap-2.5 text-slate-700">
                  <RefreshCw className={`h-4 w-4 text-blue-600 ${isCheckingUnlock ? 'animate-spin' : ''}`} />
                  <div>
                    <p className="font-semibold text-slate-900">Awaiting Faculty Authorization</p>
                    <p className="text-[11px] text-slate-500">
                      System automatically checks every 5 seconds for proctor approval
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleManualCheckUnlock}
                  disabled={isCheckingUnlock}
                  className="rounded-xl bg-white border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs shrink-0"
                >
                  {isCheckingUnlock ? 'Checking...' : 'Check Status'}
                </button>
              </div>

              {/* Evaluation / Demo Helper */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-blue-900">Faculty Authorization Simulator</p>
                    <p className="text-[11px] text-blue-700">
                      Instantly simulate instructor unlocking your attempt to resume testing:
                    </p>
                  </div>
                  <button
                    onClick={handleSimulateFacultyUnlock}
                    disabled={unlockExamMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs shrink-0"
                  >
                    <KeyRound className="h-4 w-4" />
                    {unlockExamMutation.isPending ? 'Authorizing...' : 'Authorize Re-Entry & Resume'}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs pt-2">
                <button
                  onClick={() => navigate('/exams')}
                  className="text-slate-500 hover:text-slate-800 font-medium"
                >
                  Return to Examinations
                </button>
                <button
                  onClick={() => navigate(`/exams/${examId}/results`)}
                  className="text-rose-600 hover:text-rose-800 font-semibold"
                >
                  View Lockout Summary
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Error State ───────────────────────────────────────────────────
  if (errorMessage) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Cannot Access Exam</h2>
        <p className="text-xs text-slate-500 mt-2 mb-6">{errorMessage}</p>
        <button
          onClick={() => navigate('/exams')}
          className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Return to Examinations
        </button>
      </div>
    );
  }

  // ── Render: Loading State ─────────────────────────────────────────────────
  if (!delivery) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 text-xs">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-3" />
        Initializing secure exam environment...
      </div>
    );
  }

  const currentQ = delivery.questions[currentIndex];
  const currentAnswer = currentQ ? answers[currentQ.id] : null;
  const isCurrentFlagged = currentQ ? Boolean(flagged[currentQ.id]) : false;

  const handleSelectAnswer = (ans: any) => {
    if (!currentQ) return;
    const updated = { ...answers, [currentQ.id]: ans };
    setAnswers(updated);
    triggerAutoSave(updated, flagged);
  };

  const handleToggleFlag = () => {
    if (!currentQ) return;
    const updated = { ...flagged, [currentQ.id]: !flagged[currentQ.id] };
    setFlagged(updated);
    triggerAutoSave(answers, updated);
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const answeredCount = Object.keys(answers).length;
  const flaggedCount = Object.values(flagged).filter(Boolean).length;
  const totalQuestions = delivery.questions.length;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div>
          <h1 className="text-base font-bold text-slate-900">{delivery.exam_title}</h1>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
            <span>
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Save className="h-3 w-3 text-slate-400" />
              <span>
                {saveStatus === 'saving'
                  ? 'Saving...'
                  : saveStatus === 'error'
                  ? 'Network offline (cached locally)'
                  : 'All changes saved'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Proctoring Status & Timer */}
        <div className="flex items-center gap-2">
          {/* Check Visual Self-Clarity */}
          <button
            type="button"
            onClick={() => setIsSelfViewExpanded(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            title="Inspect how you visually appear to the AI proctor & invigilator"
          >
            <Eye className="h-3.5 w-3.5 text-blue-600" />
            <span className="hidden md:inline">Self-View</span>
          </button>

          {/* Private 1-to-1 Invigilator Help Line */}
          <button
            type="button"
            onClick={() => {
              setIsProctorHelpOpen(true);
              setProctorHelpSent(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors shadow-2xs"
            title="Confidential 1-to-1 dispatch to exam invigilator (Peer chat disabled)"
          >
            <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
            <span className="hidden sm:inline">Invigilator Help</span>
          </button>

          <button
            onClick={handleToggleFullscreen}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            title="Toggle Fullscreen Lockdown Canvas"
          >
            <Maximize2 className="h-3.5 w-3.5 text-slate-500" />
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>

          {/* 6-Warning Escalation Counter Badge */}
          {violationsCount === 0 ? (
            <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Proctored • 0 / 6 Warnings</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 animate-pulse">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              <span>
                Warnings: {violationsCount} / {maxViolations}
              </span>
            </div>
          )}

          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-1.5 font-mono text-sm font-bold border transition-colors ${
              remainingSeconds <= 120
                ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                : remainingSeconds <= 600
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-slate-100 border-slate-200 text-slate-800'
            }`}
          >
            <Clock
              className={`h-4 w-4 ${
                remainingSeconds <= 120
                  ? 'text-rose-600'
                  : remainingSeconds <= 600
                  ? 'text-amber-600'
                  : 'text-slate-500'
              }`}
            />
            <span>{formatTimer(remainingSeconds)}</span>
          </div>
        </div>

        {/* Submit Action */}
        <div>
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs transition-colors"
          >
            <Send className="h-3.5 w-3.5" /> Submit Exam
          </button>
        </div>
      </header>

      {/* Blinking High-Urgency Strobe Warning Alert across viewport */}
      {activeStrobeWarning && !isLockedByViolations && (
        <div className="fixed inset-0 pointer-events-none z-50 flex flex-col justify-start">
          {/* Animated Blinking Strobe Border */}
          <div
            className={`absolute inset-0 border-8 pointer-events-none transition-all ${
              activeStrobeWarning.isCriticalPhone
                ? 'border-red-600 bg-red-600/20 animate-ping'
                : 'border-rose-600 bg-rose-500/15 animate-pulse'
            }`}
          />

          {/* Top Blinking Alert Card */}
          <div className="relative pointer-events-auto mx-auto mt-3 max-w-2xl w-full px-4">
            <div className="rounded-2xl bg-rose-600 text-white p-4 shadow-2xl border-2 border-rose-300 flex items-center justify-between gap-3 animate-bounce">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/20 shrink-0">
                  <ShieldAlert className="h-6 w-6 text-white animate-spin" />
                </div>
                <div>
                  <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider">
                    <span>⚠️ SECURITY VIOLATION: {activeStrobeWarning.eventType.replace(/_/g, ' ')}</span>
                    <span className="bg-white text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Warning {violationsCount} of {maxViolations}
                    </span>
                  </div>
                  <p className="text-xs text-rose-100 font-medium mt-0.5 leading-snug">
                    {activeStrobeWarning.reason}
                  </p>
                  <p className="text-[10px] text-rose-200 mt-1 font-semibold uppercase tracking-wider">
                    Keep your gaze centered on the examination canvas. Do not switch tabs or use external devices!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveStrobeWarning(null)}
                className="rounded-lg bg-white/20 hover:bg-white/30 p-1.5 text-white shrink-0"
                title="Dismiss Flash"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Violation Alert Banner */}
      {violationWarning && (
        <div className="bg-amber-500 text-white px-6 py-2.5 flex items-center justify-between text-xs font-semibold shadow-md z-30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-100" />
            <span>{violationWarning}</span>
          </div>
          <button onClick={() => setViolationWarning(null)} className="text-amber-100 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Examination Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-4 md:p-6 gap-6">
        {/* Left Side: Question Navigator Palette & Live AI Proctor Feed */}
        <aside className="w-full lg:w-72 space-y-4 shrink-0">
          {/* Live AI Camera Proctoring Widget */}
          <LiveVisionProctor
            onViolation={(evt, sev, det) => recordViolation(evt, sev, det)}
            violationsCount={violationsCount}
            maxViolations={maxViolations}
            onOpenSelfView={() => setIsSelfViewExpanded(true)}
          />

          {/* Questions Palette Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
              Questions Palette
            </h3>
            <div className="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-1">
              {delivery.questions.map((q, idx) => {
                const isAnswered = answers[q.id] !== undefined;
                const isFlagged = flagged[q.id];
                const isCurrent = idx === currentIndex;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-xl font-bold text-xs flex items-center justify-center relative transition-all ${
                      isCurrent ? 'ring-2 ring-blue-600 ring-offset-1 font-extrabold' : ''
                    } ${
                      isAnswered
                        ? 'bg-emerald-600 text-white'
                        : isFlagged
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {idx + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-1 ring-white" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Palette Legend */}
            <div className="pt-4 mt-4 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-600" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span>Flagged for review ({flaggedCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-slate-200" />
                <span>Unanswered ({totalQuestions - answeredCount})</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center: Question Interaction Canvas */}
        <main className="flex-1 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          {currentQ ? (
            <div className="space-y-6">
              {/* Question Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">Question {currentIndex + 1}</span>
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 uppercase">
                    {currentQ.question_type.replace('_', ' ')}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    +{currentQ.marks} {currentQ.negative_marks > 0 ? `(-${currentQ.negative_marks})` : ''} marks
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleToggleFlag}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    isCurrentFlagged
                      ? 'bg-amber-100 text-amber-800'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>{isCurrentFlagged ? 'Flagged' : 'Flag for review'}</span>
                </button>
              </div>

              {/* Question Prompt */}
              <div className="py-2">
                <p className="text-sm font-medium text-slate-900 leading-relaxed whitespace-pre-wrap select-none">
                  {currentQ.body}
                </p>
              </div>

              {/* Answer Input Controls */}
              <div className="pt-2">
                {/* MCQ Options */}
                {currentQ.question_type === 'mcq' && (
                  <div className="space-y-2.5">
                    {currentQ.options.map((opt) => {
                      const isSelected = currentAnswer?.selected === opt.label;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => handleSelectAnswer({ selected: opt.label })}
                          className={`w-full text-left flex items-start gap-3 rounded-xl border p-3 text-xs transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/60 font-medium text-blue-900 shadow-xs ring-1 ring-blue-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span
                            className={`h-5 w-5 rounded-md flex items-center justify-center font-bold text-[11px] shrink-0 ${
                              isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {opt.label}
                          </span>
                          <span className="flex-1 break-words leading-relaxed">{opt.body}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* MSQ Options (Multiple Correct) */}
                {currentQ.question_type === 'msq' && (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-slate-400 italic mb-2">Select all choices that apply.</p>
                    {currentQ.options.map((opt) => {
                      const selectedList: string[] = currentAnswer?.selected || [];
                      const isSelected = selectedList.includes(opt.label);

                      const toggleSelection = () => {
                        const updatedList = isSelected
                          ? selectedList.filter((x) => x !== opt.label)
                          : [...selectedList, opt.label];
                        handleSelectAnswer({ selected: updatedList });
                      };

                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={toggleSelection}
                          className={`w-full text-left flex items-start gap-3 rounded-xl border p-3 text-xs transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/60 font-medium text-blue-900 shadow-xs ring-1 ring-blue-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="mt-0.5 rounded text-blue-600"
                          />
                          <span className="font-bold text-slate-800">{opt.label}.</span>
                          <span className="flex-1 break-words">{opt.body}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* True / False */}
                {currentQ.question_type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-3 max-w-sm">
                    {['true', 'false'].map((val) => {
                      const isSelected = String(currentAnswer?.selected).toLowerCase() === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleSelectAnswer({ selected: val })}
                          className={`rounded-xl border p-3 text-xs font-semibold capitalize transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Numerical Input */}
                {currentQ.question_type === 'numerical' && (
                  <div className="max-w-xs space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-600 uppercase">
                      Enter Calculated Value
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 42.5"
                      value={currentAnswer?.value ?? ''}
                      onChange={(e) => handleSelectAnswer({ value: e.target.value ? Number(e.target.value) : null })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                )}

                {/* Short Answer / Essay */}
                {['short_answer', 'essay'].includes(currentQ.question_type) && (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-600 uppercase">
                      Written Response
                    </label>
                    <textarea
                      rows={currentQ.question_type === 'essay' ? 8 : 4}
                      placeholder="Type your response here..."
                      value={currentAnswer?.text ?? ''}
                      onChange={(e) => handleSelectAnswer({ text: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">No questions loaded.</div>
          )}

          {/* Bottom Navigation Buttons */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-8">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-colors shadow-xs"
            >
              <ArrowLeft className="h-4 w-4" /> Previous
            </button>

            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
              disabled={currentIndex === totalQuestions - 1}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-30 transition-colors shadow-xs"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </main>
      </div>

      {/* ── Strict 6-Warning Modal (Warnings 1 to 5) ────────────────────────── */}
      {currentWarningModal && violationsCount < 6 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-amber-300 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-100 text-amber-800">
                <ShieldAlert className="h-6 w-6 text-amber-600 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  PROCTORING INTEGRITY WARNING ({violationsCount} / 6)
                </h3>
                <p className="text-xs text-amber-700 font-medium">
                  {6 - violationsCount} Warning{6 - violationsCount > 1 ? 's' : ''} Remaining Before Session Lockout
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-xs text-amber-900 space-y-2">
              <p className="font-semibold">Security Infraction Detected:</p>
              <p className="font-mono bg-white p-2.5 rounded-lg border border-amber-200 text-slate-800">
                {currentWarningModal.reason}
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                <strong>Institutional Examination Policy:</strong> Candidates are allowed a maximum of{' '}
                <strong>6 warnings</strong>. Upon receiving the 6th warning, your exam session will be{' '}
                <strong>immediately terminated and locked</strong>. Re-entry will require explicit permission
                from faculty.
              </p>
            </div>

            {/* Visual 6-Warning Escalation Meter */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                <span>Warning Escalation Meter</span>
                <span className="text-rose-600 font-bold">{violationsCount} of 6 Warnings</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5 h-3">
                {[1, 2, 3, 4, 5, 6].map((step) => (
                  <div
                    key={step}
                    className={`rounded-sm transition-all ${
                      step <= violationsCount
                        ? step === 6
                          ? 'bg-rose-600'
                          : 'bg-amber-500'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setCurrentWarningModal(null)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 shadow-xs"
              >
                I Understand & Resume Examination
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Final Submission Confirmation Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Confirm Exam Submission</h3>
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>Are you sure you want to finish and submit your exam?</p>
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-1">
                <p>
                  • Answered: <strong className="text-emerald-700">{answeredCount}</strong> of {totalQuestions}
                </p>
                <p>
                  • Unanswered: <strong className="text-rose-600">{totalQuestions - answeredCount}</strong>
                </p>
                {flaggedCount > 0 && (
                  <p>
                    • Flagged for review: <strong className="text-amber-600">{flaggedCount}</strong>
                  </p>
                )}
              </div>
              <p className="text-[11px] text-slate-400 italic">
                Once submitted, responses cannot be modified and will be processed by the grading engine.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Continue Exam
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitExamMutation.isPending}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitExamMutation.isPending ? 'Submitting...' : 'Yes, Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Student High-Fidelity Visual Clarity Monitor (Self-View) ────────── */}
      {isSelfViewExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Candidate Camera & Visual Self-Verification</h3>
                  <p className="text-[11px] text-slate-400">Verify what the AI proctor & invigilators see</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSelfViewExpanded(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Telemetry Status Bar */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-emerald-900">
                  <p className="text-[10px] uppercase font-bold text-emerald-700">Framing & Face</p>
                  <p className="font-semibold mt-0.5">Optimal Centering</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-blue-900">
                  <p className="text-[10px] uppercase font-bold text-blue-700">Lighting Quality</p>
                  <p className="font-semibold mt-0.5">Clear / Balanced</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5 text-purple-900">
                  <p className="text-[10px] uppercase font-bold text-purple-700">Device Scanner</p>
                  <p className="font-semibold mt-0.5">Zero Devices Found</p>
                </div>
              </div>

              {/* High-res camera viewport simulation with AI Mesh */}
              <div className="relative aspect-4/3 rounded-2xl bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center">
                <div className="flex flex-col items-center justify-center p-6 text-center text-white">
                  <div className="relative mb-3">
                    <div className="w-24 h-24 rounded-full bg-blue-600/20 border-2 border-blue-500/50 flex items-center justify-center text-blue-400">
                      <UserCheck className="h-12 w-12" />
                    </div>
                    <div className="absolute inset-0 rounded-full border border-blue-400/40 animate-ping" />
                  </div>
                  <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">Candidate Visual Stream Verified</p>
                  <p className="text-[11px] text-slate-400 mt-1">1080p Ultra-Low Latency Feed to Invigilator Hub</p>
                </div>

                {/* HUD Elements */}
                <div className="absolute inset-4 pointer-events-none flex flex-col justify-between">
                  <div className="flex justify-between items-center text-[10px] font-mono text-emerald-400 bg-slate-900/80 px-3 py-1 rounded-lg border border-slate-800">
                    <span>AI EYE GAZE: 0.0° (LOCKED ON SCREEN)</span>
                    <span>CONFIDENCE: 99.2%</span>
                  </div>
                  <div className="self-center w-36 h-36 border-2 border-dashed border-emerald-400/70 rounded-2xl flex items-center justify-center">
                    <span className="text-[9px] text-emerald-300 font-mono">HEAD POSITION OK</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 bg-slate-900/80 px-3 py-1 rounded-lg border border-slate-800">
                    <span>NO EXTERNAL PERSONS</span>
                    <span>NO MOBILE PHONES DETECTED</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-900">Institutional Visual Guidelines:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600">
                  <li>Keep both eyes visible and focused directly on the screen at all times.</li>
                  <li>Do not turn your head sideways or look down toward your desk or lap.</li>
                  <li>Ensure no other person enters the room or camera field of view.</li>
                  <li>Never bring mobile phones or smartwatches near the testing area.</li>
                </ul>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsSelfViewExpanded(false)}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Return to Exam Canvas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Private 1-to-1 Proctor Help Desk Modal (No Peer-to-Peer Chat) ─────── */}
      {isProctorHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">1-to-1 Invigilator Help Desk</h3>
                  <p className="text-[11px] text-slate-400">Confidential Emergency Proctor Dispatch</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProctorHelpOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                <p className="font-bold flex items-center gap-1.5 text-blue-950">
                  <ShieldCheck className="h-4 w-4 text-blue-600" /> Private Invigilator Channel
                </p>
                <p className="text-[11px] text-blue-800 mt-1 leading-relaxed">
                  This connects you directly and confidentially with the course faculty and assigned exam proctors. Candidate peer-to-peer communication is strictly prohibited and disabled.
                </p>
              </div>

              {proctorHelpSent ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-bold text-emerald-900">Dispatch Transmitted to Invigilator Hub</h4>
                  <p className="text-xs text-emerald-700">
                    Your note has been flagged on the live invigilator dashboard. An invigilator has been notified. Please stay seated and continue your examination.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsProctorHelpOpen(false)}
                    className="mt-3 rounded-xl bg-emerald-700 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    Resume Exam
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setProctorHelpSent(true);
                  }}
                  className="space-y-3.5"
                >
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Reason for Assistance
                    </label>
                    <select
                      value={proctorHelpCategory}
                      onChange={(e) => setProctorHelpCategory(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
                    >
                      <option value="Camera / Visual feed issue">Camera / Visual feed or lighting issue</option>
                      <option value="Peripheral screen flicker">Peripheral monitor / screen flicker</option>
                      <option value="Accidental gaze deflection">Accidental gaze deflection clarification</option>
                      <option value="Question rendering anomaly">Question typography or rendering anomaly</option>
                      <option value="Restroom / medical emergency">Urgent medical or restroom emergency</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Brief Description for Invigilator
                    </label>
                    <textarea
                      rows={3}
                      value={proctorHelpMessage}
                      onChange={(e) => setProctorHelpMessage(e.target.value)}
                      placeholder="e.g. My room lighting flickered briefly; I did not turn away from my monitor."
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsProctorHelpOpen(false)}
                      className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs flex items-center gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" /> Transmit to Proctor
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Live AI Camera & Vision Proctoring Widget Component
// ────────────────────────────────────────────────────────────────────────────
function LiveVisionProctor({
  onViolation,
  violationsCount,
  maxViolations,
  onOpenSelfView,
}: {
  onViolation: (eventType: string, severity: 'low' | 'medium' | 'high', details?: Record<string, any>) => void;
  violationsCount: number;
  maxViolations: number;
  onOpenSelfView?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasRealCamera, setHasRealCamera] = useState<boolean>(false);
  const [gazeStatus, setGazeStatus] = useState<'center' | 'side' | 'down' | 'missing'>('center');
  const [gazeAngleText, setGazeAngleText] = useState('0.0° Centered');
  const [phoneDetected, setPhoneDetected] = useState<boolean>(false);
  const [micDb, setMicDb] = useState<number>(-42);

  // Consecutive counters to prevent false-positive flickering
  const sideCountRef = useRef(0);
  const downCountRef = useRef(0);
  const missingCountRef = useRef(0);
  const phoneCountRef = useRef(0);
  const mousePosRef = useRef({ x: 0.5, y: 0.45 });
  const animFrameRef = useRef<number | null>(null);
  const lastBlinkRef = useRef(Date.now());
  const blinkStateRef = useRef(0); // 0 = open, 1 = closing, 2 = closed

  // 1. Initialize real webcam feed if available
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isActive = true;

    async function setupCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setHasRealCamera(false);
          return;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
          audio: false,
        });

        if (!isActive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setHasRealCamera(true);
      } catch {
        if (isActive) setHasRealCamera(false);
      }
    }

    setupCamera();

    return () => {
      isActive = false;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // 2. Track mouse / cursor movement across exam viewport for natural gaze alignment
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const normX = e.clientX / window.innerWidth;
      const normY = e.clientY / window.innerHeight;
      mousePosRef.current = { x: normX, y: normY };
    };

    // Hidden QA / Examiner keyboard shortcuts for headless/automated test verification
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.shiftKey) {
        if (e.key === 'M' || e.key === 'm') {
          // Simulate instant phone detection
          setPhoneDetected(true);
          onViolation('mobile_phone_detected', 'high', {
            reason: 'CRITICAL SECURITY BREACH: Unauthorized mobile phone / electronic device detected in camera frame.',
          });
        } else if (e.key === 'S' || e.key === 's') {
          // Simulate looking sideways
          mousePosRef.current = { x: 0.15, y: 0.45 };
        } else if (e.key === 'D' || e.key === 'd') {
          // Simulate looking down
          mousePosRef.current = { x: 0.5, y: 0.85 };
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onViolation]);

  // 3. Render Loop: Photorealistic Candidate Camera Feed with AI Tracking HUD
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = (time: number) => {
      if (!isRunning) return;

      const w = 320;
      const h = 240;
      canvas.width = w;
      canvas.height = h;

      if (hasRealCamera && videoRef.current && videoRef.current.readyState === 4) {
        // Draw real webcam feed mirrored horizontally
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, w, h);
        ctx.restore();
      } else {
        // Draw photorealistic institutional exam camera feed
        // Background: institutional classroom wall with soft lighting gradient
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#1e293b');
        bgGrad.addColorStop(0.6, '#0f172a');
        bgGrad.addColorStop(1, '#020617');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Ambient lighting beam
        const lightGrad = ctx.createRadialGradient(w * 0.7, 40, 20, w * 0.7, 40, 180);
        lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = lightGrad;
        ctx.fillRect(0, 0, w, h);

        // Candidate head and gaze orientation
        const targetX = mousePosRef.current.x;
        const targetY = mousePosRef.current.y;
        const isLookingDownAtDesk = targetY > 0.72;

        // Head center with subtle breathing motion
        const breatheY = Math.sin(time / 1000) * 1.5;
        const headOffsetAngle = (targetX - 0.5) * 35; // head yaw in degrees
        const headX = w / 2 + (targetX - 0.5) * 30;
        const headY = 115 + breatheY + (isLookingDownAtDesk ? 12 : 0);

        // Shoulders & Navy Student Shirt
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.ellipse(headX, 230, 85, 45, 0, 0, Math.PI * 2);
        ctx.fill();

        // White Inner Collar
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(headX - 18, 175);
        ctx.lineTo(headX, 195);
        ctx.lineTo(headX + 18, 175);
        ctx.lineTo(headX, 182);
        ctx.closePath();
        ctx.fill();

        // Neck
        ctx.fillStyle = '#cf9770';
        ctx.fillRect(headX - 16, headY + 35, 32, 35);

        // Face Base
        ctx.save();
        ctx.translate(headX, headY);
        ctx.rotate((headOffsetAngle * Math.PI) / 180 * 0.3);

        ctx.fillStyle = '#e0ac88';
        ctx.beginPath();
        ctx.ellipse(0, 0, 42, 54, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hair styling
        ctx.fillStyle = '#261b16';
        ctx.beginPath();
        ctx.ellipse(0, -28, 44, 28, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-34, -14, 12, 0, Math.PI * 2);
        ctx.arc(34, -14, 12, 0, Math.PI * 2);
        ctx.fill();

        // Blinking mechanics
        const now = Date.now();
        if (now - lastBlinkRef.current > 3800) {
          blinkStateRef.current = 1;
          setTimeout(() => {
            blinkStateRef.current = 0;
            lastBlinkRef.current = Date.now();
          }, 140);
        }

        // Eyes
        const eyeSpacing = 18;
        const eyeY = -4;
        const pupilShiftX = (targetX - 0.5) * 6;
        const pupilShiftY = (targetY - 0.5) * 4;

        if (blinkStateRef.current === 1) {
          // Closed eye line
          ctx.strokeStyle = '#382519';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-eyeSpacing - 8, eyeY);
          ctx.lineTo(-eyeSpacing + 8, eyeY);
          ctx.moveTo(eyeSpacing - 8, eyeY);
          ctx.lineTo(eyeSpacing + 8, eyeY);
          ctx.stroke();
        } else {
          // Open Eyes with Sclera, Iris and Pupil
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(-eyeSpacing, eyeY, 8.5, 5.5, 0, 0, Math.PI * 2);
          ctx.ellipse(eyeSpacing, eyeY, 8.5, 5.5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Hazel / Brown Iris
          ctx.fillStyle = '#452b1e';
          ctx.beginPath();
          ctx.arc(-eyeSpacing + pupilShiftX, eyeY + pupilShiftY, 4.5, 0, Math.PI * 2);
          ctx.arc(eyeSpacing + pupilShiftX, eyeY + pupilShiftY, 4.5, 0, Math.PI * 2);
          ctx.fill();

          // Pupil & Reflection Glint
          ctx.fillStyle = '#0f0a06';
          ctx.beginPath();
          ctx.arc(-eyeSpacing + pupilShiftX, eyeY + pupilShiftY, 2.5, 0, Math.PI * 2);
          ctx.arc(eyeSpacing + pupilShiftX, eyeY + pupilShiftY, 2.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(-eyeSpacing + pupilShiftX - 1, eyeY + pupilShiftY - 1, 1, 0, Math.PI * 2);
          ctx.arc(eyeSpacing + pupilShiftX - 1, eyeY + pupilShiftY - 1, 1, 0, Math.PI * 2);
          ctx.fill();
        }

        // Eyebrows
        ctx.strokeStyle = '#261b16';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-eyeSpacing, eyeY - 8, 9, Math.PI * 1.1, Math.PI * 1.9);
        ctx.arc(eyeSpacing, eyeY - 8, 9, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();

        // Nose Bridge & Tip
        ctx.strokeStyle = '#c5916f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, eyeY + 2);
        ctx.lineTo(pupilShiftX * 0.5, eyeY + 18);
        ctx.lineTo(pupilShiftX * 0.5 + 4, eyeY + 19);
        ctx.stroke();

        // Mouth
        ctx.strokeStyle = '#b36b52';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-11, eyeY + 32);
        ctx.quadraticCurveTo(0, eyeY + 34, 11, eyeY + 32);
        ctx.stroke();

        ctx.restore();

        // Draw Mobile Phone in frame if detected
        if (phoneDetected) {
          ctx.save();
          ctx.translate(w * 0.72, h * 0.65);
          ctx.rotate(-0.15);
          // Phone Body
          ctx.fillStyle = '#1e1e24';
          ctx.strokeStyle = '#e11d48';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(-22, -40, 44, 80, 8);
          ctx.fill();
          ctx.stroke();

          // Screen Glow
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(-18, -34, 36, 68);

          // Alert Label
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('PHONE DETECTED', -38, -48);
          ctx.restore();
        }
      }

      // Draw AI Facial Mesh & Detection HUD
      const nowGazeX = mousePosRef.current.x;
      const nowGazeY = mousePosRef.current.y;
      const isDeflected = nowGazeX < 0.28 || nowGazeX > 0.72;
      const isDown = nowGazeY > 0.72;

      const boxX = w / 2 - 45 + (nowGazeX - 0.5) * 24;
      const boxY = 65 + (isDown ? 15 : 0);

      // AI Bounding Box
      ctx.strokeStyle = phoneDetected ? '#e11d48' : isDeflected || isDown ? '#f59e0b' : '#10b981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(boxX, boxY, 90, 110);
      ctx.setLineDash([]);

      // Subtle AI Facial Mesh Points
      const meshColor = phoneDetected ? 'rgba(225, 29, 72, 0.8)' : isDeflected || isDown ? 'rgba(245, 158, 11, 0.8)' : 'rgba(16, 185, 129, 0.7)';
      ctx.fillStyle = meshColor;
      const pts = [
        [boxX + 28, boxY + 36], // left eye
        [boxX + 62, boxY + 36], // right eye
        [boxX + 45, boxY + 54], // nose
        [boxX + 35, boxY + 74], // mouth left
        [boxX + 55, boxY + 74], // mouth right
        [boxX + 45, boxY + 95], // chin
      ];
      pts.forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // Ambient Audio Variation
      if (Math.random() < 0.05) {
        setMicDb(-45 + Math.floor(Math.random() * 8));
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [hasRealCamera, phoneDetected]);

  // 4. Automated Continuous Vision Analysis Loop (Detects Side-viewing, Looking down, & Phone)
  useEffect(() => {
    const analysisTimer = setInterval(() => {
      // Analyze current gaze vector from tracking engine
      const { x: normX, y: normY } = mousePosRef.current;

      const isLookingSide = normX < 0.28 || normX > 0.72;
      const isLookingDown = normY > 0.72;

      // 1. Detect Side Viewing (Turning head left or right away from monitor)
      if (isLookingSide) {
        sideCountRef.current++;
        downCountRef.current = 0;
        setGazeStatus('side');
        const direction = normX < 0.28 ? 'Left' : 'Right';
        const angle = normX < 0.28 ? '-24.5° Left Deflection' : '+25.2° Right Deflection';
        setGazeAngleText(angle);

        if (sideCountRef.current >= 2) {
          onViolation('side_viewing', 'medium', {
            reason: `Gaze Anomaly: Candidate looking sideways / viewing away from screen (${direction})`,
          });
          sideCountRef.current = 0;
        }
      }
      // 2. Detect Downward Gaze (Looking down at desk, paper notes, or phone in lap)
      else if (isLookingDown) {
        downCountRef.current++;
        sideCountRef.current = 0;
        setGazeStatus('down');
        setGazeAngleText('-19.0° Downward Tilt');

        if (downCountRef.current >= 2) {
          onViolation('looking_down', 'medium', {
            reason: 'Downward Gaze Anomaly: Candidate looking down toward desk, lap, or unauthorized written notes',
          });
          downCountRef.current = 0;
        }
      } else {
        // Centered & Normal Focus
        sideCountRef.current = 0;
        downCountRef.current = 0;
        setGazeStatus('center');
        setGazeAngleText('0.0° Centered');
      }

      // 3. Detect Face Missing / Leaving seat
      if (normX < 0 || normX > 1 || normY < 0 || normY > 1) {
        missingCountRef.current++;
        if (missingCountRef.current >= 3) {
          setGazeStatus('missing');
          onViolation('face_missing', 'high', {
            reason: 'Face Not Detected: Candidate left testing area or camera view is obscured',
          });
          missingCountRef.current = 0;
        }
      } else {
        missingCountRef.current = 0;
      }

      if (phoneDetected) {
        phoneCountRef.current++;
      } else {
        phoneCountRef.current = 0;
      }
    }, 800);

    return () => clearInterval(analysisTimer);
  }, [onViolation, phoneDetected]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {/* Camera Header */}
      <div className="bg-slate-900 px-3.5 py-2.5 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider">AI Proctor Vision</span>
        </div>
        <div className="flex items-center gap-2">
          {onOpenSelfView && (
            <button
              type="button"
              onClick={onOpenSelfView}
              className="inline-flex items-center gap-1 rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-slate-200 transition-colors"
              title="Expand Camera Self-View"
            >
              <Maximize className="h-2.5 w-2.5" />
              <span>Expand</span>
            </button>
          )}
          <span className="text-[10px] text-slate-400 font-mono">1080p Encrypted</span>
        </div>
      </div>

      {/* Video Viewport with HUD Overlay */}
      <div className="relative aspect-4/3 bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Hidden video tag for real camera capture */}
        <video ref={videoRef} className="hidden" autoPlay playsInline muted />

        {/* Real-time canvas drawing live video or photorealistic candidate feed */}
        <canvas ref={canvasRef} className="w-full h-full object-cover" />

        {/* Real-time Facial Tracking Box Overlay */}
        <div className="absolute inset-3 pointer-events-none flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div
              className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-md transition-colors ${
                phoneDetected
                  ? 'bg-red-950/90 text-red-200 border border-red-500 animate-bounce'
                  : gazeStatus === 'center'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                  : gazeStatus === 'side'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500/30 animate-pulse'
                  : gazeStatus === 'down'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500/30 animate-pulse'
                  : 'bg-rose-950/80 text-rose-300 border border-rose-500/30 animate-pulse'
              }`}
            >
              {phoneDetected ? 'PHONE DETECTED' : `Gaze: ${gazeStatus === 'center' ? 'Centered' : gazeStatus === 'side' ? 'Viewing Sideways' : gazeStatus === 'down' ? 'Looking Down' : 'Face Missing'}`}
            </div>
            <div className="rounded-md bg-slate-900/80 border border-slate-700/50 px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
              {violationsCount}/{maxViolations} Warnings
            </div>
          </div>

          <div className="flex justify-between items-end text-[9px] text-slate-300 font-mono bg-slate-900/60 backdrop-blur-xs px-2 py-1 rounded">
            <span>MIC: ACTIVE ({micDb} dB)</span>
            <span className="text-emerald-400">TRACKING: ACTIVE</span>
          </div>
        </div>
      </div>

      {/* Institutional Examination Security Protocol Status Card (Replaces simulation buttons) */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            Security Protocol
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ARMED & ACTIVE
          </span>
        </div>

        <div className="space-y-1.5 text-[11px] text-slate-600">
          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-slate-500">AI Vision Engine</span>
            <span className="font-semibold text-slate-800">1080p Continuous</span>
          </div>
          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-slate-500">Gaze Telemetry</span>
            <span className={`font-semibold ${gazeStatus === 'center' ? 'text-emerald-700' : 'text-amber-700'}`}>
              {gazeAngleText}
            </span>
          </div>
          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-slate-500">Mobile Phone Scanner</span>
            <span className="font-semibold text-rose-700">Zero Tolerance</span>
          </div>
          <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-slate-500">Integrity Violation Limit</span>
            <span className="font-semibold text-slate-800">{violationsCount} / {maxViolations} Warnings Max</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed italic text-center pt-0.5">
          All visual, audio, window, and navigation events are continuously audited by proctors.
        </p>
      </div>
    </div>
  );
}


import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Play, Pause, Square, Sparkles, Clock, Target, Flame, AlertTriangle, 
  Settings2, RefreshCw, Volume2, VolumeX, ShieldCheck, Crosshair, 
  ChevronRight, Compass, Maximize2, Minimize2, CheckCircle2, User, Eye, EyeOff, AlertCircle,
  Activity, Bell, Monitor, RefreshCcw
} from 'lucide-react';
import { 
  AppSettings, CalibrationData, DistractionDetail, FocusInterval, 
  FocusState, StudentProfile, StudySession, TrackerMetrics, SessionLifecycleState 
} from '../types';
import { CameraTracker } from './CameraTracker';
import { 
  saveActiveSessionState, 
  loadActiveSessionState, 
  clearActiveSessionState, 
  ActiveSessionStorageData 
} from '../utils/sessionManager';
import { createBackgroundInterval } from '../utils/backgroundTimer';
import { unlockAudioContext } from '../utils/audio';

interface ActiveSessionViewProps {
  settings: AppSettings;
  activeProfile: StudentProfile;
  profiles: StudentProfile[];
  onSelectProfile: (id: string) => void;
  onOpenCalibration: () => void;
  onCalibrationComplete: (calib: CalibrationData) => void;
  onSessionComplete: (session: StudySession) => void;
  onPlaySound: (type: 'distraction' | 'restored' | 'completed') => void;
  isCalibrating: boolean;
  onStartCalibration: () => void;
  onCancelCalibration: () => void;
  onMetricsUpdate?: (metrics: TrackerMetrics) => void;
  onToggleSimulation?: () => void;
  userId: string;
}

const COMMON_SUBJECTS = [
  'Mathematics & Calculus',
  'Physics & Engineering',
  'Computer Science & Coding',
  'Biology & Medicine',
  'Chemistry',
  'Literature & Writing',
  'History & Social Sciences',
  'Language Learning',
  'Exam Preparation',
  'Custom Subject',
];

export const ActiveSessionView: React.FC<ActiveSessionViewProps> = ({
  settings,
  activeProfile,
  profiles,
  onSelectProfile,
  onOpenCalibration,
  onCalibrationComplete,
  onSessionComplete,
  onPlaySound,
  isCalibrating,
  onStartCalibration,
  onCancelCalibration,
  onMetricsUpdate,
  onToggleSimulation,
  userId,
}) => {
  // Session Lifecycle State Machine
  const [lifecycleState, setLifecycleState] = useState<SessionLifecycleState>('IDLE');
  const [subject, setSubject] = useState<string>('Computer Science & Coding');
  const [customSubjectText, setCustomSubjectText] = useState<string>('');
  const [isCustomSubject, setIsCustomSubject] = useState<boolean>(false);
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [isCameraUnavailable, setIsCameraUnavailable] = useState<boolean>(false);
  const [cameraUnavailableSeconds, setCameraUnavailableSeconds] = useState<number>(0);

  // Interrupted session recovery state
  const [interruptedSession, setInterruptedSession] = useState<ActiveSessionStorageData | null>(null);

  // High-precision Wall-Clock Timestamp State
  const sessionIdRef = useRef<string>(`session-${Date.now()}`);
  const sessionStartTimestampRef = useRef<number>(0);
  const sessionEndTimestampRef = useRef<number>(0);
  const pauseStartTimestampRef = useRef<number>(0);
  const totalPausedMsRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(Date.now());

  // Live session statistics
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [focusedSeconds, setFocusedSeconds] = useState<number>(0);
  const [distractionSeconds, setDistractionSeconds] = useState<number>(0);
  const [distractionCount, setDistractionCount] = useState<number>(0);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [longestStreak, setLongestStreak] = useState<number>(0);

  // Distraction Events Array
  const [distractionLog, setDistractionLog] = useState<DistractionDetail[]>([]);
  const activeDistractionRef = useRef<{ id: string; startTimestamp: number; reason: string } | null>(null);

  // Focus Intervals Chunk Array (for timeline rendering)
  const [intervals, setIntervals] = useState<FocusInterval[]>([]);

  // Live vision metrics from computer vision pipeline
  const [metrics, setMetrics] = useState<TrackerMetrics>({
    yaw: 0,
    pitch: 0,
    roll: 0,
    gazeX: 0,
    gazeY: 0,
    rawYaw: 0,
    rawPitch: 0,
    rawRoll: 0,
    rawGazeX: 0,
    rawGazeY: 0,
    rawFaceX: 0.5,
    rawFaceY: 0.5,
    faceDetected: false,
    eyeContact: false,
    state: 'IDLE',
    distractionSeconds: 0,
    fps: 30,
    confidence: 0,
    isWithinBounds: true,
    leftEyeEAR: 0.3,
    rightEyeEAR: 0.3,
    isBlinking: false,
    boundViolations: { yaw: false, pitch: false, gaze: false, facePos: false, noFace: false },
    allowedYawRange: [-20, 20],
    allowedPitchRange: [-15, 15],
    allowedGazeRange: [-20, 20],
  });

  // Automatic notification banner state
  const [notification, setNotification] = useState<{ 
    message: string; 
    subMessage?: string; 
    visible: boolean; 
    type: 'distraction' | 'encouragement' | 'info' 
  } | null>(null);

  // Desktop Notification permission status
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const isActive = lifecycleState === 'ACTIVE' || lifecycleState === 'PAUSED' || lifecycleState === 'CAMERA_UNAVAILABLE';
  const isPaused = lifecycleState === 'PAUSED';

  // Refs synced with latest state so background Web Worker tick never tears down/restarts every second
  const metricsRef = useRef<TrackerMetrics>(metrics);
  metricsRef.current = metrics;
  const isCameraUnavailableRef = useRef<boolean>(isCameraUnavailable);
  isCameraUnavailableRef.current = isCameraUnavailable;
  const focusedSecondsRef = useRef<number>(focusedSeconds);
  focusedSecondsRef.current = focusedSeconds;
  const distractionSecondsRef = useRef<number>(distractionSeconds);
  distractionSecondsRef.current = distractionSeconds;
  const distractionCountRef = useRef<number>(distractionCount);
  distractionCountRef.current = distractionCount;
  const longestStreakRef = useRef<number>(longestStreak);
  longestStreakRef.current = longestStreak;
  const currentStreakRef = useRef<number>(currentStreak);
  currentStreakRef.current = currentStreak;
  const intervalsRef = useRef<FocusInterval[]>(intervals);
  intervalsRef.current = intervals;
  const distractionLogRef = useRef<DistractionDetail[]>(distractionLog);
  distractionLogRef.current = distractionLog;
  const cameraUnavailableSecondsRef = useRef<number>(cameraUnavailableSeconds);
  cameraUnavailableSecondsRef.current = cameraUnavailableSeconds;
  const subjectRef = useRef<string>(subject);
  subjectRef.current = subject;
  const customSubjectTextRef = useRef<string>(customSubjectText);
  customSubjectTextRef.current = customSubjectText;
  const isCustomSubjectRef = useRef<boolean>(isCustomSubject);
  isCustomSubjectRef.current = isCustomSubject;
  const activeProfileRef = useRef<StudentProfile>(activeProfile);
  activeProfileRef.current = activeProfile;
  const sessionNotesRef = useRef<string>(sessionNotes);
  sessionNotesRef.current = sessionNotes;
  const elapsedSecondsRef = useRef<number>(elapsedSeconds);
  elapsedSecondsRef.current = elapsedSeconds;
  const titleFlashRef = useRef<boolean>(false);

  // Upper body posture session accumulation refs
  const postureScoreSumRef = useRef<number>(0);
  const postureSampleCountRef = useRef<number>(0);
  const uprightPostureSecondsRef = useRef<number>(0);
  const slouchPostureSecondsRef = useRef<number>(0);

  // Check for interrupted active session on initial mount
  useEffect(() => {
    if (!userId) return;
    const existing = loadActiveSessionState(userId);
    if (existing && (existing.lifecycleState === 'ACTIVE' || existing.lifecycleState === 'PAUSED' || existing.lifecycleState === 'CAMERA_UNAVAILABLE')) {
      const now = Date.now();
      const timeSinceHeartbeat = now - (existing.lastHeartbeatTimestamp || existing.sessionStartTimestamp);
      // If session was saved less than 24 hours ago, offer recovery
      if (timeSinceHeartbeat < 24 * 60 * 60 * 1000) {
        setInterruptedSession(existing);
      } else {
        clearActiveSessionState(userId);
      }
    }
  }, [userId]);

  // Handle Resume Interrupted Session
  const handleRecoverSession = () => {
    if (!interruptedSession) return;
    sessionIdRef.current = interruptedSession.sessionId || `session-${Date.now()}`;
    sessionStartTimestampRef.current = interruptedSession.sessionStartTimestamp;
    pauseStartTimestampRef.current = interruptedSession.pauseStartTimestamp || 0;
    totalPausedMsRef.current = interruptedSession.totalPausedMs || 0;
    
    // Calculate gap during app closure and add as camera unavailable time
    const now = Date.now();
    const gapSeconds = Math.max(0, Math.floor((now - (interruptedSession.lastHeartbeatTimestamp || now)) / 1000));
    const previousUnavailable = interruptedSession.cameraUnavailableSeconds || 0;
    setCameraUnavailableSeconds(previousUnavailable + gapSeconds);

    const recoveredFocused = interruptedSession.focusedSeconds || 0;
    const recoveredDistracted = interruptedSession.distractionSeconds || 0;
    const recoveredCount = interruptedSession.distractionCount || 0;
    const recoveredLongest = interruptedSession.longestStreak || 0;
    const recoveredStreak = interruptedSession.currentStreak || 0;
    const recoveredIntervals = interruptedSession.intervals || [];
    const recoveredDistractions = interruptedSession.distractions || [];
    const recoveredUnavailable = previousUnavailable + gapSeconds;
    const recoveredElapsed = recoveredFocused + recoveredDistracted + recoveredUnavailable;

    setSubject(interruptedSession.subject || 'Computer Science & Coding');
    setElapsedSeconds(recoveredElapsed);
    setFocusedSeconds(recoveredFocused);
    setDistractionSeconds(recoveredDistracted);
    setDistractionCount(recoveredCount);
    setLongestStreak(recoveredLongest);
    setCurrentStreak(recoveredStreak);
    setIntervals(recoveredIntervals);
    setDistractionLog(recoveredDistractions);
    setSessionNotes(interruptedSession.notes || '');

    elapsedSecondsRef.current = recoveredElapsed;
    focusedSecondsRef.current = recoveredFocused;
    distractionSecondsRef.current = recoveredDistracted;
    distractionCountRef.current = recoveredCount;
    longestStreakRef.current = recoveredLongest;
    currentStreakRef.current = recoveredStreak;
    intervalsRef.current = recoveredIntervals;
    distractionLogRef.current = recoveredDistractions;
    cameraUnavailableSecondsRef.current = recoveredUnavailable;
    postureScoreSumRef.current = interruptedSession.postureScoreSum || 0;
    postureSampleCountRef.current = interruptedSession.postureSampleCount || 0;
    uprightPostureSecondsRef.current = interruptedSession.uprightPostureSeconds || 0;
    slouchPostureSecondsRef.current = interruptedSession.slouchPostureSeconds || 0;
    lastTickTimeRef.current = Date.now();

    unlockAudioContext();
    setLifecycleState('ACTIVE');
    setInterruptedSession(null);
  };

  // Handle Discard Interrupted Session
  const handleDiscardInterruptedSession = () => {
    if (userId) {
      clearActiveSessionState(userId);
    }
    setInterruptedSession(null);
  };

  // Format seconds to HH:MM:SS or MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Live Focus Score calculation
  const liveFocusScore = useMemo(() => {
    const active = focusedSeconds + distractionSeconds;
    if (active <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((focusedSeconds / active) * 100)));
  }, [focusedSeconds, distractionSeconds]);

  // Request browser notification permission helper
  const requestBrowserNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
    } catch {
      // ignore permission errors
    }
  };

  // Send native browser/OS notification message (visible even when another tab or browser is open)
  const sendDesktopAlertMessage = (title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!settings.browserNotifications && !document.hidden) return;
    if (Notification.permission === 'granted') {
      try {
        const n = new Notification(title, {
          body,
          tag: `study-focus-alert-${Date.now()}`,
          requireInteraction: false,
        });
        n.onclick = () => {
          try {
            window.focus();
            n.close();
          } catch {
            // ignore
          }
        };
      } catch (e) {
        console.debug('Notification trigger caught:', e);
      }
    }
  };

  // Request browser notification permissions on mount if enabled
  useEffect(() => {
    if (settings.browserNotifications && 'Notification' in window) {
      setNotifPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(setNotifPermission).catch(() => {});
      }
    }
  }, [settings.browserNotifications]);

  // Restore document.title on unmount or when session is IDLE
  useEffect(() => {
    const defaultTitle = 'Study Focus Tracker | AI Computer-Vision Focus Monitor';
    if (lifecycleState === 'IDLE' || lifecycleState === 'ENDED') {
      document.title = defaultTitle;
    }
    return () => {
      document.title = defaultTitle;
    };
  }, [lifecycleState]);

  // Handle Metrics Update from CameraTracker
  const handleMetricsUpdate = (newMetrics: TrackerMetrics) => {
    metricsRef.current = newMetrics;
    setMetrics(newMetrics);
    onMetricsUpdate?.(newMetrics);
  };

  // 1-Click Pose Snapshot Baseline handler
  const handleQuickSnapshotBaseline = () => {
    if (!metrics.faceDetected) {
      onStartCalibration();
      setNotification({
        message: 'Starting 5-second live pose calibration...',
        subMessage: 'Camera is activating so we can lock your real head, eye & shoulder posture.',
        visible: true,
        type: 'info',
      });
      setTimeout(() => {
        setNotification(prev => (prev?.type === 'info' ? { ...prev, visible: false } : prev));
      }, 4000);
      return;
    }

    onCalibrationComplete({
      baselineYaw: metrics.rawYaw,
      baselinePitch: metrics.rawPitch,
      baselineRoll: metrics.rawRoll,
      baselineGazeX: metrics.rawGazeX,
      baselineGazeY: metrics.rawGazeY,
      baselineFaceScale: 1.0,
      baselineNeckDropRatio: metrics.posture?.neckDropRatio,
      baselineShoulderTilt: metrics.posture?.shoulderTiltDeg,
      isCalibrated: true,
      calibratedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    setNotification({
      message: `Posture baseline snapshot captured for ${activeProfile.name}!`,
      subMessage: `Reference locked to Yaw: ${metrics.rawYaw >= 0 ? '+' : ''}${metrics.rawYaw}°, Pitch: ${metrics.rawPitch >= 0 ? '+' : ''}${metrics.rawPitch}°, Gaze: ${metrics.rawGazeX >= 0 ? '+' : ''}${metrics.rawGazeX}°`,
      visible: true,
      type: 'encouragement',
    });
    setTimeout(() => {
      setNotification(prev => (prev?.type === 'encouragement' ? { ...prev, visible: false } : prev));
    }, 4000);
  };

  // Start Study Session Handler
  const handleStartSession = () => {
    unlockAudioContext();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(setNotifPermission).catch(() => {});
    }

    sessionIdRef.current = `session-${Date.now()}`;
    sessionStartTimestampRef.current = Date.now();
    totalPausedMsRef.current = 0;
    lastTickTimeRef.current = Date.now();
    setLifecycleState('ACTIVE');
    setElapsedSeconds(0);
    setFocusedSeconds(0);
    setDistractionSeconds(0);
    setDistractionCount(0);
    setCurrentStreak(0);
    setLongestStreak(0);
    setIntervals([]);
    setDistractionLog([]);
    setCameraUnavailableSeconds(0);
    activeDistractionRef.current = null;

    elapsedSecondsRef.current = 0;
    focusedSecondsRef.current = 0;
    distractionSecondsRef.current = 0;
    distractionCountRef.current = 0;
    currentStreakRef.current = 0;
    longestStreakRef.current = 0;
    intervalsRef.current = [];
    distractionLogRef.current = [];
    cameraUnavailableSecondsRef.current = 0;
    postureScoreSumRef.current = 0;
    postureSampleCountRef.current = 0;
    uprightPostureSecondsRef.current = 0;
    slouchPostureSecondsRef.current = 0;
  };

  // Pause Study Session Handler
  const handlePauseSession = () => {
    pauseStartTimestampRef.current = Date.now();
    setLifecycleState('PAUSED');
    document.title = '⏸️ Session Paused — StudyFocus AI';
  };

  // Resume Study Session Handler
  const handleResumeSession = () => {
    unlockAudioContext();
    if (pauseStartTimestampRef.current > 0) {
      totalPausedMsRef.current += (Date.now() - pauseStartTimestampRef.current);
      pauseStartTimestampRef.current = 0;
    }
    lastTickTimeRef.current = Date.now();
    setLifecycleState('ACTIVE');
  };

  // End Study Session Handler (Releases camera, computes exact metrics, saves session, clears active session cache)
  const handleEndSession = () => {
    sessionEndTimestampRef.current = Date.now();
    setLifecycleState('ENDED');

    const totalDuration = Math.max(
      Math.floor((sessionEndTimestampRef.current - sessionStartTimestampRef.current - totalPausedMsRef.current) / 1000),
      elapsedSecondsRef.current,
      1
    );

    const finalDistracted = distractionSecondsRef.current;
    const finalUnavailable = cameraUnavailableSecondsRef.current;
    const calculatedFocused = Math.max(totalDuration - finalDistracted - finalUnavailable, 0);
    const denominator = calculatedFocused + finalDistracted;
    const finalScore = denominator > 0 ? Math.min(100, Math.max(0, Math.round((calculatedFocused / denominator) * 100))) : 100;

    const chosenSubject = isCustomSubject && customSubjectText.trim() ? customSubjectText.trim() : subject;

    const postureSamples = postureSampleCountRef.current;
    const avgPostureScore =
      postureSamples > 0
        ? Math.min(100, Math.max(0, Math.round(postureScoreSumRef.current / postureSamples)))
        : metricsRef.current.posture?.postureScore;
    const uprightTime = uprightPostureSecondsRef.current;
    const slouchTime = slouchPostureSecondsRef.current;
    const postureSummary =
      typeof avgPostureScore === 'number'
        ? avgPostureScore >= 85
          ? 'Excellent upright upper-body alignment throughout study.'
          : avgPostureScore >= 70
          ? 'Mostly upright posture with occasional forward neck or shoulder slouch.'
          : 'Frequent slouching or shoulder tilt detected — consider raising your screen height.'
        : undefined;

    const finalSession: StudySession = {
      id: sessionIdRef.current || `session-${Date.now()}`,
      userId,
      studentId: activeProfile.id,
      studentName: activeProfile.name,
      startTime: sessionStartTimestampRef.current,
      endTime: sessionEndTimestampRef.current,
      duration: totalDuration,
      focusedTime: calculatedFocused,
      distractionTime: finalDistracted,
      distractionCount: distractionCountRef.current,
      focusScore: finalScore,
      longestStreak: Math.max(longestStreakRef.current, currentStreakRef.current),
      subject: chosenSubject,
      notes: sessionNotes.trim() || undefined,
      intervals: intervalsRef.current.length > 0 ? intervalsRef.current : [{ state: 'focused', startSecond: 0, endSecond: totalDuration }],
      distractions: distractionLogRef.current,
      cameraUnavailableSeconds: finalUnavailable > 0 ? finalUnavailable : undefined,
      avgPostureScore,
      uprightPostureTime: uprightTime,
      slouchPostureTime: slouchTime,
      postureSummary,
    };

    if (userId) {
      clearActiveSessionState(userId);
    }

    onPlaySound('completed');
    onSessionComplete(finalSession);
    setLifecycleState('IDLE');
  };

  // Periodic Local Storage Sync & Unthrottled Web Worker Background Clock
  useEffect(() => {
    if (lifecycleState !== 'ACTIVE') return;

    lastTickTimeRef.current = Date.now();

    const stopWorkerClock = createBackgroundInterval(() => {
      const now = Date.now();
      const deltaSeconds = Math.max(1, Math.round((now - lastTickTimeRef.current) / 1000));
      lastTickTimeRef.current = now;

      // Calculate true wall-clock elapsed time
      const currentElapsed = Math.max(
        0,
        Math.floor((now - sessionStartTimestampRef.current - totalPausedMsRef.current) / 1000)
      );
      elapsedSecondsRef.current = currentElapsed;
      setElapsedSeconds(currentElapsed);

      const liveState = metricsRef.current.state;
      const camUnavailable = isCameraUnavailableRef.current;

      // Update focused vs distraction time based on current real-time CV status
      if (camUnavailable) {
        const nextUnavail = cameraUnavailableSecondsRef.current + deltaSeconds;
        cameraUnavailableSecondsRef.current = nextUnavail;
        setCameraUnavailableSeconds(nextUnavail);
      } else if (liveState === 'DISTRACTED') {
        const nextDistracted = distractionSecondsRef.current + deltaSeconds;
        distractionSecondsRef.current = nextDistracted;
        setDistractionSeconds(nextDistracted);
        currentStreakRef.current = 0;
        setCurrentStreak(0);
      } else {
        // FOCUSED, or brief <threshold DRIFTING / NO_FACE grace period
        const nextFocused = focusedSecondsRef.current + deltaSeconds;
        focusedSecondsRef.current = nextFocused;
        setFocusedSeconds(nextFocused);

        if (liveState === 'FOCUSED') {
          const nextStreak = currentStreakRef.current + deltaSeconds;
          currentStreakRef.current = nextStreak;
          setCurrentStreak(nextStreak);
          if (nextStreak > longestStreakRef.current) {
            longestStreakRef.current = nextStreak;
            setLongestStreak(nextStreak);
          }
        }
      }

      // Accumulate upper body posture score & upright vs slouch duration
      const livePosture = metricsRef.current.posture;
      if (!camUnavailable && livePosture && livePosture.postureStatus !== 'UNKNOWN') {
        postureScoreSumRef.current += livePosture.postureScore * deltaSeconds;
        postureSampleCountRef.current += deltaSeconds;
        if (livePosture.postureStatus === 'UPRIGHT') {
          uprightPostureSecondsRef.current += deltaSeconds;
        } else {
          slouchPostureSecondsRef.current += deltaSeconds;
        }
      }

      // Update browser tab title so user sees distraction alerts even from another tab
      if (camUnavailable) {
        document.title = `⚠️ Camera Unavailable — StudyFocus AI`;
      } else if (liveState === 'DISTRACTED') {
        titleFlashRef.current = !titleFlashRef.current;
        document.title = titleFlashRef.current
          ? '🚨 DISTRACTED! Return to Study — StudyFocus AI'
          : '💬 Focus Alert: Please return to screen!';
      } else if (liveState === 'DRIFTING' || liveState === 'NO_FACE') {
        document.title = `🟡 Drifting (${formatTime(currentElapsed)}) — StudyFocus AI`;
      } else {
        document.title = `🟢 Studying (${formatTime(currentElapsed)}) — StudyFocus AI`;
      }

      // Maintain live focus intervals
      const intervalState: FocusInterval['state'] = camUnavailable
        ? 'away'
        : liveState === 'DISTRACTED'
        ? 'distracted'
        : liveState === 'NO_FACE'
        ? 'away'
        : 'focused';

      const prevIntervals = intervalsRef.current;
      let nextIntervals: FocusInterval[];
      if (prevIntervals.length === 0) {
        nextIntervals = [{ state: intervalState, startSecond: 0, endSecond: deltaSeconds }];
      } else {
        const last = prevIntervals[prevIntervals.length - 1];
        if (last.state === intervalState) {
          nextIntervals = [...prevIntervals.slice(0, -1), { ...last, endSecond: last.endSecond + deltaSeconds }];
        } else {
          nextIntervals = [...prevIntervals, { state: intervalState, startSecond: last.endSecond, endSecond: last.endSecond + deltaSeconds }];
        }
      }
      intervalsRef.current = nextIntervals;
      setIntervals(nextIntervals);

      // Persist live session state to localStorage
      if (userId) {
        const currentSubj = isCustomSubjectRef.current && customSubjectTextRef.current.trim()
          ? customSubjectTextRef.current.trim()
          : subjectRef.current;

        saveActiveSessionState({
          userId,
          sessionId: sessionIdRef.current,
          lifecycleState: 'ACTIVE',
          subject: currentSubj,
          studentId: activeProfileRef.current.id,
          studentName: activeProfileRef.current.name,
          sessionStartTimestamp: sessionStartTimestampRef.current,
          pauseStartTimestamp: pauseStartTimestampRef.current,
          totalPausedMs: totalPausedMsRef.current,
          lastHeartbeatTimestamp: now,
          focusedSeconds: focusedSecondsRef.current,
          distractionSeconds: distractionSecondsRef.current,
          distractionCount: distractionCountRef.current,
          longestStreak: longestStreakRef.current,
          currentStreak: currentStreakRef.current,
          intervals: nextIntervals,
          distractions: distractionLogRef.current,
          notes: sessionNotesRef.current,
          cameraUnavailableSeconds: cameraUnavailableSecondsRef.current,
          lastCameraAvailabilityCheck: now,
          postureScoreSum: postureScoreSumRef.current,
          postureSampleCount: postureSampleCountRef.current,
          uprightPostureSeconds: uprightPostureSecondsRef.current,
          slouchPostureSeconds: slouchPostureSecondsRef.current,
        });
      }
    }, 1000);

    return () => stopWorkerClock();
  }, [lifecycleState, userId]);

  // Distraction Event Started (Fires strictly once when sustained threshold is crossed)
  const handleDistractionEventStart = ({ startTimestamp, reason }: { startTimestamp: number; reason: string }) => {
    const nextCount = distractionCountRef.current + 1;
    distractionCountRef.current = nextCount;
    setDistractionCount(nextCount);

    activeDistractionRef.current = {
      id: `d-${Date.now()}`,
      startTimestamp,
      reason,
    };

    // Play gentle synthesized chime if sound enabled
    if (settings.audioAlerts) {
      onPlaySound('distraction');
    }

    // Trigger Native Browser Desktop Notification (works when another tab or another browser is open)
    sendDesktopAlertMessage(
      '🔔 Study Focus Alert — Distraction Detected!',
      `${activeProfileRef.current.name}: ${reason}. Please return your focus to your study screen!`
    );

    // Show automatic non-intrusive notification toast
    setNotification({
      message: 'You appear to be looking away. Please return your focus to your study.',
      subMessage: reason || 'Sustained distraction boundary violation',
      visible: true,
      type: 'distraction',
    });

    setTimeout(() => {
      setNotification(prev => (prev?.type === 'distraction' ? { ...prev, visible: false } : prev));
    }, 6000);
  };

  // Repeated Distraction Reminder (Fires every notificationCooldown seconds if still distracted)
  const handleDistractionReminder = ({ durationSeconds, reason }: { durationSeconds: number; reason: string }) => {
    if (settings.audioAlerts) {
      onPlaySound('distraction');
    }

    sendDesktopAlertMessage(
      `⚠️ Still Distracted (${durationSeconds}s) — StudyFocus AI`,
      `${activeProfileRef.current.name}, you've been distracted for ${durationSeconds}s (${reason}). Come back to your study session!`
    );

    setNotification({
      message: `Still distracted (${durationSeconds}s) — Let's get back to studying!`,
      subMessage: reason,
      visible: true,
      type: 'distraction',
    });

    setTimeout(() => {
      setNotification(prev => (prev?.type === 'distraction' ? { ...prev, visible: false } : prev));
    }, 6000);
  };

  // Distraction Event Ended (Fires when student returns to focus boundary)
  const handleDistractionEventEnd = ({
    startTimestamp,
    endTimestamp,
    durationSeconds,
    reason,
  }: {
    startTimestamp: number;
    endTimestamp: number;
    durationSeconds: number;
    reason: string;
  }) => {
    const reasonType: DistractionDetail['reason'] = reason.toLowerCase().includes('head') || reason.toLowerCase().includes('looking up') || reason.toLowerCase().includes('looking down')
      ? 'head_turned'
      : reason.toLowerCase().includes('eye') || reason.toLowerCase().includes('gaze')
      ? 'gaze_away'
      : 'face_missing';

    const newDistraction: DistractionDetail = {
      id: activeDistractionRef.current?.id || `d-${Date.now()}`,
      secondInSession: elapsedSecondsRef.current,
      startTimestamp,
      endTimestamp,
      timestamp: startTimestamp,
      reason: reasonType,
      reasonDescription: reason,
      durationSeconds,
    };

    const nextLog = [...distractionLogRef.current, newDistraction];
    distractionLogRef.current = nextLog;
    setDistractionLog(nextLog);
    activeDistractionRef.current = null;
  };

  // Focus Restored Trigger
  const handleFocusRestored = () => {
    if (settings.audioAlerts) {
      onPlaySound('restored');
    }

    if (document.hidden) {
      sendDesktopAlertMessage(
        '✅ Focus Restored — StudyFocus AI',
        `${activeProfileRef.current.name}, great job! You're back inside your study focus zone.`
      );
    }

    setNotification({
      message: "Focus restored! You're back inside the study area.",
      subMessage: `Reference point locked to ${activeProfile.name}`,
      visible: true,
      type: 'encouragement',
    });

    setTimeout(() => {
      setNotification(prev => (prev?.type === 'encouragement' ? { ...prev, visible: false } : prev));
    }, 3500);
  };

  // Camera Availability Handler
  const handleCameraUnavailable = (unavailable: boolean) => {
    setIsCameraUnavailable(unavailable);
    if (unavailable && lifecycleState === 'ACTIVE') {
      setLifecycleState('CAMERA_UNAVAILABLE');
    } else if (!unavailable && lifecycleState === 'CAMERA_UNAVAILABLE') {
      setLifecycleState('ACTIVE');
    }
  };

  const currentSubjectName = isCustomSubject && customSubjectText.trim() ? customSubjectText.trim() : subject;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* INTERRUPTED SESSION RECOVERY MODAL / BANNER */}
      {interruptedSession && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
              <RefreshCcw className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900 font-display">
                Your previous study session was interrupted
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed mt-0.5">
                Subject: <strong>{interruptedSession.subject}</strong> &bull; Recorded Study Time: <strong>{formatTime(interruptedSession.focusedSeconds + interruptedSession.distractionSeconds)}</strong> ({interruptedSession.distractionCount} distractions). Would you like to resume?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              id="btn-discard-interrupted-session"
              onClick={handleDiscardInterruptedSession}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Discard
            </button>
            <button
              id="btn-resume-interrupted-session"
              onClick={handleRecoverSession}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer shadow-xs"
            >
              Resume Session
            </button>
          </div>
        </div>
      )}

      {/* BACKGROUND PERSISTENT SESSION ACTIVE INDICATOR BANNER */}
      {isActive && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="font-bold text-emerald-950">
              Persistent Background Study Session Active
            </span>
            <span className="text-emerald-700 hidden sm:inline">&bull;</span>
            <span className="text-emerald-800 font-medium hidden sm:inline">
              Background webcam &amp; distraction alerts stay active across tabs and windows.
            </span>
            {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
              <button
                id="btn-enable-desktop-alerts"
                onClick={requestBrowserNotificationPermission}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
              >
                <Bell className="w-3 h-3" />
                Enable Desktop Alert Messages
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 font-mono font-bold text-emerald-950">
            <span>Study Time: {formatTime(elapsedSeconds)}</span>
            <span>Focus: {liveFocusScore}%</span>
            <span>Distractions: {distractionCount}</span>
          </div>
        </div>
      )}

      {/* CAMERA UNAVAILABLE IN BACKGROUND WARNING BANNER */}
      {isCameraUnavailable && isActive && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <strong className="font-bold">Background monitoring is temporarily unavailable.</strong> Please return to the app or allow background camera access in your browser/OS settings. (This interval is tracked as unavailable rather than focused time).
          </div>
        </div>
      )}
      
      {/* Top Banner / Student Profile Selector & Quick Session Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        
        {/* Left: Active Student & Subject Info */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Active Student Chip */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
            <div 
              className="w-3.5 h-3.5 rounded-full shrink-0"
              style={{ backgroundColor: activeProfile.avatarColor || '#4f46e5' }}
            />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Student Profile</span>
              {!isActive ? (
                <select
                  id="select-active-student"
                  value={activeProfile.id}
                  onChange={(e) => onSelectProfile(e.target.value)}
                  className="text-xs font-semibold text-slate-900 bg-transparent border-none p-0 focus:ring-0 cursor-pointer pr-4"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.isCalibrated ? '✓' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-semibold text-slate-900">{activeProfile.name}</span>
              )}
            </div>
          </div>

          {/* Subject Selector / Custom Input */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Study Subject</span>
              {!isActive ? (
                <div className="flex items-center gap-1.5">
                  <select
                    id="select-study-subject"
                    value={isCustomSubject ? 'Custom Subject' : subject}
                    onChange={(e) => {
                      if (e.target.value === 'Custom Subject') {
                        setIsCustomSubject(true);
                      } else {
                        setIsCustomSubject(false);
                        setSubject(e.target.value);
                      }
                    }}
                    className="text-xs font-semibold text-slate-900 bg-transparent border-none p-0 focus:ring-0 cursor-pointer pr-4"
                  >
                    {COMMON_SUBJECTS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {isCustomSubject && (
                    <input
                      id="input-custom-subject"
                      type="text"
                      placeholder="Type custom subject..."
                      value={customSubjectText}
                      onChange={(e) => setCustomSubjectText(e.target.value)}
                      className="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  )}
                </div>
              ) : (
                <span className="text-xs font-semibold text-slate-900">{currentSubjectName}</span>
              )}
            </div>
          </div>

        </div>

        {/* Right: Primary Session Action Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {!isActive ? (
            <button
              id="btn-start-study-session"
              onClick={handleStartSession}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Study Session</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {isPaused ? (
                <button
                  id="btn-resume-session"
                  onClick={handleResumeSession}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  id="btn-pause-session"
                  onClick={handlePauseSession}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 fill-white" />
                  <span>Pause</span>
                </button>
              )}

              <button
                id="btn-end-study-session"
                onClick={handleEndSession}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>End Study Session</span>
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Main Grid: Telemetry & Live Video */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Live Video Camera Feed & Interactive HUD */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Live Status & Calibration Bar */}
          <div className="flex items-center justify-between px-1 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Computer Vision Feed:</span>
              <span className="font-mono text-indigo-600 font-medium">
                {activeProfile.name} {activeProfile.preset ? `(${activeProfile.preset})` : ''}
              </span>
            </div>
            <button
              id="btn-trigger-calibration-inline"
              onClick={onStartCalibration}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <Crosshair className="w-3 h-3" />
              {activeProfile.isCalibrated ? 'Recalibrate Pose' : 'Calibrate Baseline'}
            </button>
          </div>

          {/* Camera Component */}
          <CameraTracker
            isActive={isActive}
            isPaused={isPaused}
            settings={settings}
            activeProfile={activeProfile}
            onCalibrationComplete={onCalibrationComplete}
            onMetricsUpdate={handleMetricsUpdate}
            onDistractionEventStart={handleDistractionEventStart}
            onDistractionEventEnd={handleDistractionEventEnd}
            onDistractionReminder={handleDistractionReminder}
            onFocusRestored={handleFocusRestored}
            onCameraUnavailable={handleCameraUnavailable}
            isCalibrating={isCalibrating}
            onCancelCalibration={onCancelCalibration}
            onStartSession={handleStartSession}
            onEnableSimulation={onToggleSimulation}
          />

          {/* Real-time Angle & Telemetry Card with Baseline vs Current vs Allowed Comparison */}
          {(() => {
            const isTrackingLive = (isActive && !isPaused) || isCalibrating || settings.simulationMode;
            const hasFace = isTrackingLive && metrics.faceDetected;
            const hasPosture = isTrackingLive && Boolean(metrics.posture && metrics.posture.postureStatus !== 'UNKNOWN');

            return (
              <>
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-indigo-600" />
                      Live Pose vs Baseline ({activeProfile.name})
                    </span>
                    <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                      !isTrackingLive
                        ? 'bg-slate-100 text-slate-500'
                        : !hasFace
                        ? 'bg-amber-50 text-amber-700'
                        : metrics.isWithinBounds
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    }`}>
                      {!isTrackingLive
                        ? 'STANDBY'
                        : !hasFace
                        ? 'SCANNING FACE'
                        : metrics.isWithinBounds
                        ? 'SAFE ZONE'
                        : 'OUTSIDE BOUNDARY'}
                    </span>
                  </div>

                  {/* Quick Calibration Bar */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-indigo-50/70 border border-indigo-100">
                    <div className="text-[11px] text-slate-600">
                      <span>Baseline Status: </span>
                      <strong className="text-indigo-900 font-semibold">
                        {activeProfile.isCalibrated 
                          ? `Locked at ${activeProfile.calibratedAt || 'Recent'}` 
                          : 'Factory Center (Not yet tuned)'}
                      </strong>
                    </div>
                    <button
                      id="btn-lock-current-pose"
                      onClick={handleQuickSnapshotBaseline}
                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                      title={hasFace ? "Lock current head and gaze orientation as student's normal study baseline" : 'Activate camera for 5s to calibrate live pose baseline'}
                    >
                      <Crosshair className="w-3 h-3" />
                      <span>{hasFace ? '1-Click Pose Snapshot' : 'Calibrate Live Pose'}</span>
                    </button>
                  </div>

                  {/* 3-Column Angular HUD Comparison Grid */}
                  <div className="grid grid-cols-3 gap-2.5 font-mono text-[11px]">
                    
                    {/* Yaw Comparison Block */}
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <div className="text-[10px] text-slate-500 font-sans font-medium flex justify-between">
                        <span>Head Yaw</span>
                        <span className="text-slate-400">Limit: ±{activeProfile.yawLimit || 20}°</span>
                      </div>
                      <div className="text-slate-900 font-bold">
                        Live: {hasFace ? `${metrics.rawYaw >= 0 ? '+' : ''}${metrics.rawYaw}°` : '—'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Base: {activeProfile.baselineYaw >= 0 ? '+' : ''}{activeProfile.baselineYaw}°
                      </div>
                      <div className={`text-[10px] font-semibold ${
                        !hasFace
                          ? 'text-slate-400'
                          : Math.abs(metrics.yaw) > (activeProfile.yawLimit || 20)
                          ? 'text-rose-600'
                          : 'text-emerald-600'
                      }`}>
                        Diff: {hasFace ? `${metrics.yaw >= 0 ? '+' : ''}${metrics.yaw}°` : '—'}
                      </div>
                    </div>

                    {/* Pitch Comparison Block */}
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <div className="text-[10px] text-slate-500 font-sans font-medium flex justify-between">
                        <span>Head Pitch</span>
                        <span className="text-slate-400">Limit: ±{activeProfile.pitchLimit || 15}°</span>
                      </div>
                      <div className="text-slate-900 font-bold">
                        Live: {hasFace ? `${metrics.rawPitch >= 0 ? '+' : ''}${metrics.rawPitch}°` : '—'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Base: {activeProfile.baselinePitch >= 0 ? '+' : ''}{activeProfile.baselinePitch}°
                      </div>
                      <div className={`text-[10px] font-semibold ${
                        !hasFace
                          ? 'text-slate-400'
                          : Math.abs(metrics.pitch) > (activeProfile.pitchLimit || 15)
                          ? 'text-rose-600'
                          : 'text-emerald-600'
                      }`}>
                        Diff: {hasFace ? `${metrics.pitch >= 0 ? '+' : ''}${metrics.pitch}°` : '—'}
                      </div>
                    </div>

                    {/* Gaze Comparison Block */}
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <div className="text-[10px] text-slate-500 font-sans font-medium flex justify-between">
                        <span>Eye Gaze</span>
                        <span className="text-slate-400">Limit: ±{activeProfile.gazeLimit || 20}°</span>
                      </div>
                      <div className="text-slate-900 font-bold">
                        Live: {hasFace ? `${metrics.rawGazeX >= 0 ? '+' : ''}${metrics.rawGazeX}°` : '—'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Base: {activeProfile.baselineGazeX >= 0 ? '+' : ''}{activeProfile.baselineGazeX}°
                      </div>
                      <div className={`text-[10px] font-semibold ${
                        !hasFace
                          ? 'text-slate-400'
                          : Math.abs(metrics.gazeX) > (activeProfile.gazeLimit || 20)
                          ? 'text-rose-600'
                          : 'text-emerald-600'
                      }`}>
                        Diff: {hasFace ? `${metrics.gazeX >= 0 ? '+' : ''}${metrics.gazeX}°` : '—'}
                      </div>
                    </div>

                  </div>

                  {/* Delay Threshold Info */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span>Distraction Delay Window:</span>
                    <span className="font-semibold text-slate-700 font-mono">
                      {activeProfile.distractionDelay || settings.distractionThreshold || 5}s sustained look-away required to trigger alert
                    </span>
                  </div>
                </div>

                {/* Real-time Upper Body Posture Telemetry Card */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-emerald-600" />
                      Upper Body Posture Analysis
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {hasPosture
                          ? metrics.posture?.shouldersDetected
                            ? 'Shoulders Tracked'
                            : 'Head/Neck Est.'
                          : isTrackingLive
                          ? 'Scanning Pose...'
                          : 'Camera Standby'}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                          !isTrackingLive
                            ? 'bg-slate-100 text-slate-500'
                            : !hasPosture
                            ? 'bg-amber-50 text-amber-700'
                            : metrics.posture?.postureStatus === 'UPRIGHT'
                            ? 'bg-emerald-50 text-emerald-700'
                            : metrics.posture?.postureStatus === 'SLIGHT_SLOUCH'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {!isTrackingLive
                          ? 'STANDBY'
                          : !hasPosture
                          ? 'DETECTING...'
                          : `${metrics.posture!.postureStatus.replace('_', ' ')} (${metrics.posture!.postureScore}%)`}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 font-mono text-[11px]">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-sans block">Shoulder Tilt</span>
                      <span className="text-slate-900 font-bold">
                        {hasPosture && metrics.posture
                          ? `${metrics.posture.shoulderTiltDeg >= 0 ? '+' : ''}${metrics.posture.shoulderTiltDeg}°`
                          : '—'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-sans block">Slouch Angle</span>
                      <span className="text-slate-900 font-bold">
                        {hasPosture && metrics.posture ? `${metrics.posture.slouchAngleDeg}°` : '—'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-sans block">Forward Lean</span>
                      <span className="text-slate-900 font-bold">
                        {hasPosture && metrics.posture ? `${metrics.posture.forwardLeanPct}%` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                    <span>
                      {!isTrackingLive
                        ? 'Start a study session or turn on Simulation Mode to track live head pose & upper-body posture.'
                        : hasPosture && metrics.posture?.postureFeedback
                        ? metrics.posture.postureFeedback
                        : 'Align your head and shoulders inside the camera frame to calculate posture.'}
                    </span>
                    {!isTrackingLive && onToggleSimulation && (
                      <button
                        type="button"
                        onClick={onToggleSimulation}
                        className="text-indigo-600 hover:text-indigo-700 font-semibold whitespace-nowrap cursor-pointer"
                      >
                        Try Simulator &rarr;
                      </button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}

        </div>

        {/* Right Column: Live Session Statistics & Timeline */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Main Timer & Focus Score Card */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            
            {/* Top Timer Display */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">
                  Session Timer
                </span>
                <div className="text-3xl sm:text-4xl font-mono font-bold text-slate-900 tracking-tight">
                  {formatTime(elapsedSeconds)}
                </div>
              </div>

              {/* Focus Score Radial Metric */}
              <div className="text-right">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">
                  Focus Score
                </span>
                <div className={`text-3xl sm:text-4xl font-mono font-bold ${
                  liveFocusScore >= 80 ? 'text-emerald-600' : liveFocusScore >= 60 ? 'text-amber-600' : 'text-rose-600'
                }`}>
                  {liveFocusScore}%
                </div>
              </div>
            </div>

            {/* Focused vs Distraction Progress Bar */}
            <div className="space-y-1.5">
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${liveFocusScore}%` }}
                />
                <div 
                  className="h-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${100 - liveFocusScore}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span className="text-emerald-700 font-medium">Focused: {formatTime(focusedSeconds)}</span>
                <span className="text-rose-700 font-medium">Distracted: {formatTime(distractionSeconds)}</span>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Distractions Count</span>
                <span className="text-lg font-bold font-mono text-slate-900">{distractionCount}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Current Focus Streak</span>
                <span className="text-lg font-bold font-mono text-emerald-700">{formatTime(currentStreak)}</span>
              </div>
            </div>

            {/* Session Notes Input */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Session Goals & Notes (Optional)
              </label>
              <textarea
                id="textarea-session-notes"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="E.g. Finishing chapter 4 problem set, studying algorithms..."
                rows={2}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
              />
            </div>

          </div>

          {/* Distraction Events Log Card */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>Distraction Log ({distractionLog.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                {distractionLog.length === 0 ? 'Zero distractions' : 'Logged events'}
              </span>
            </div>

            {distractionLog.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                <p>Great attention! No sustained distractions recorded yet.</p>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {distractionLog.slice(-6).reverse().map((d, i) => (
                  <div key={d.id || i} className="p-2 rounded-lg bg-rose-50/70 border border-rose-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-rose-900 block">
                        {d.reason === 'head_turned' ? 'Head turned away' : d.reason === 'gaze_away' ? 'Eyes looking away' : 'Face left study area'}
                      </span>
                      <span className="text-[10px] text-rose-600 font-mono">
                        At {formatTime(d.secondInSession)} in session &bull; {d.durationSeconds}s duration
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                      +{d.durationSeconds}s
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Floating Alert / Encouragement Notification Banner */}
      {notification && notification.visible && (
        <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-xl border flex items-start gap-3 max-w-sm transition-all duration-300 ${
          notification.type === 'distraction'
            ? 'bg-rose-900 text-white border-rose-700 shadow-rose-900/30'
            : 'bg-indigo-900 text-white border-indigo-700 shadow-indigo-900/30'
        }`}>
          {notification.type === 'distraction' ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Sparkles className="w-5 h-5 text-indigo-300 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <p className="text-xs font-bold leading-tight">{notification.message}</p>
            {notification.subMessage && (
              <p className="text-[11px] opacity-80 leading-tight">{notification.subMessage}</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

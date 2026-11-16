import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CameraOff, Sparkles, Sliders, RefreshCw, AlertCircle, ShieldCheck, Crosshair, CheckCircle2, Play, Eye, Loader2 } from 'lucide-react';
import { AppSettings, CalibrationData, FocusState, StudentProfile, TrackerMetrics } from '../types';
import {
  analyzeFacialPose,
  analyzeUpperBodyPosture,
  drawComputerVisionHUD,
  RawLandmark,
  RawPoseLandmark,
} from '../utils/computerVision';
import { createBackgroundInterval } from '../utils/backgroundTimer';
import {
  detectVisionFrame,
  initSharedVisionModels,
  subscribeVisionModelStatus,
  VisionModelsState,
} from '../utils/mediapipeManager';

interface DistractionEventData {
  startTimestamp: number;
  endTimestamp?: number;
  durationSeconds: number;
  reason: string;
}

interface CameraTrackerProps {
  isActive: boolean;
  isPaused: boolean;
  settings: AppSettings;
  activeProfile: StudentProfile;
  onCalibrationComplete: (calib: CalibrationData) => void;
  onMetricsUpdate: (metrics: TrackerMetrics) => void;
  onDistractionEventStart: (event: { startTimestamp: number; reason: string }) => void;
  onDistractionEventEnd: (event: { startTimestamp: number; endTimestamp: number; durationSeconds: number; reason: string }) => void;
  onDistractionReminder?: (event: { durationSeconds: number; reason: string }) => void;
  onFocusRestored: () => void;
  onCameraUnavailable?: (isUnavailable: boolean) => void;
  isCalibrating: boolean;
  onCancelCalibration: () => void;
  onStartSession?: () => void;
  onEnableSimulation?: () => void;
}

export const CameraTracker: React.FC<CameraTrackerProps> = ({
  isActive,
  isPaused,
  settings,
  activeProfile,
  onCalibrationComplete,
  onMetricsUpdate,
  onDistractionEventStart,
  onDistractionEventEnd,
  onDistractionReminder,
  onFocusRestored,
  onCameraUnavailable,
  isCalibrating,
  onCancelCalibration,
  onStartSession,
  onEnableSimulation,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imageCaptureRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const lastRafTimeRef = useRef<number>(performance.now());

  // MediaPipe Tasks Vision references
  const latestPoseLandmarksRef = useRef<RawPoseLandmark[] | null>(null);
  const isProcessingFrameRef = useRef<boolean>(false);
  const lastPoseProcessedAtRef = useRef<number>(0);
  const processingStartedAtRef = useRef<number>(0);
  const [visionStatus, setVisionStatus] = useState<VisionModelsState>({
    faceReady: false,
    poseReady: false,
    loading: false,
    error: null,
  });
  const visionStatusRef = useRef<VisionModelsState>(visionStatus);
  visionStatusRef.current = visionStatus;

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

  // Calibration state
  const [calibCountdown, setCalibCountdown] = useState<number>(5);
  const [calibSamplesCount, setCalibSamplesCount] = useState<number>(0);
  const calibSamplesRef = useRef<Array<{
    yaw: number;
    pitch: number;
    roll: number;
    gazeX: number;
    gazeY: number;
    faceX: number;
    faceY: number;
    neckDropRatio?: number;
    shoulderTilt?: number;
    shoulderWidth?: number;
  }>>([]);

  // Distraction tracking state machine refs
  const distractionSecondsRef = useRef<number>(0);
  const currentStateRef = useRef<FocusState>('IDLE');
  const lastAlertTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const lastMetricsEmitRef = useRef<number>(0);
  const fpsRef = useRef<number>(30);
  const latestMetricsRef = useRef<TrackerMetrics | null>(null);

  // Distraction event tracking
  const isDistractionEventOpenRef = useRef<boolean>(false);
  const activeDistractionStartTimestampRef = useRef<number>(0);
  const activeDistractionReasonRef = useRef<string>('');

  // Simulation controls
  const [simulatedYaw, setSimulatedYaw] = useState<number>(0);
  const [simulatedPitch, setSimulatedPitch] = useState<number>(0);
  const [simulatedGaze, setSimulatedGaze] = useState<number>(0);
  const [simulatedSlouch, setSimulatedSlouch] = useState<number>(0);
  const [simulatedNoFace, setSimulatedNoFace] = useState<boolean>(false);

  // Keep props fresh in refs for async tracking loop
  const propsRef = useRef({
    isActive,
    isPaused,
    settings,
    activeProfile,
    onCalibrationComplete,
    onMetricsUpdate,
    onDistractionEventStart,
    onDistractionEventEnd,
    onDistractionReminder,
    onFocusRestored,
    onCameraUnavailable,
    isCalibrating,
  });

  useEffect(() => {
    propsRef.current = {
      isActive,
      isPaused,
      settings,
      activeProfile,
      onCalibrationComplete,
      onMetricsUpdate,
      onDistractionEventStart,
      onDistractionEventEnd,
      onDistractionReminder,
      onFocusRestored,
      onCameraUnavailable,
      isCalibrating,
    };
  });

  // Track mount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Process Landmarks through Computer Vision Pipeline
  const handleResults = useCallback((landmarks: RawLandmark[] | null) => {
    if (!isMountedRef.current) return;

    const {
      isActive: currentActive,
      isPaused: currentPaused,
      settings: currentSettings,
      activeProfile: currentProfile,
      onMetricsUpdate: emitMetrics,
      onDistractionEventStart: emitDistractionStart,
      onDistractionEventEnd: emitDistractionEnd,
      onFocusRestored: emitFocusRestored,
      isCalibrating: currentCalibrating,
    } = propsRef.current;

    const now = performance.now();
    const deltaMs = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    if (deltaMs > 0 && deltaMs < 2000) {
      fpsRef.current = Math.max(1, Math.round(1000 / deltaMs));
    } else if (deltaMs >= 2000) {
      fpsRef.current = 1;
    }

    // 1. Analyze Pose & Gaze against active profile baseline & limits
    const analysis = analyzeFacialPose(
      landmarks || [],
      currentProfile,
      currentSettings.sensitivity,
      fpsRef.current
    );

    const metrics = analysis.metrics;

    // 1b. Calculate Upper Body Posture from MediaPipe Pose (or head fallback)
    const posture = analyzeUpperBodyPosture(
      latestPoseLandmarksRef.current,
      landmarks,
      currentProfile,
      metrics
    );
    metrics.posture = posture;
    latestMetricsRef.current = metrics;

    // Collect calibration sample if in calibrating mode (collect raw pose + upper body posture)
    if (currentCalibrating && metrics.faceDetected) {
      const poseLms = latestPoseLandmarksRef.current;
      let shoulderWidth: number | undefined;
      if (poseLms && poseLms.length > 12 && (poseLms[11]?.visibility ?? 1) > 0.35 && (poseLms[12]?.visibility ?? 1) > 0.35) {
        shoulderWidth = Math.hypot(poseLms[12].x - poseLms[11].x, poseLms[12].y - poseLms[11].y);
      }

      calibSamplesRef.current.push({
        yaw: metrics.rawYaw ?? metrics.yaw,
        pitch: metrics.rawPitch ?? metrics.pitch,
        roll: metrics.rawRoll ?? metrics.roll,
        gazeX: metrics.rawGazeX ?? metrics.gazeX,
        gazeY: metrics.rawGazeY ?? metrics.gazeY,
        faceX: metrics.rawFaceX ?? 0.5,
        faceY: metrics.rawFaceY ?? 0.5,
        neckDropRatio: posture.shouldersDetected ? posture.neckDropRatio : undefined,
        shoulderTilt: posture.shouldersDetected ? posture.shoulderTiltDeg : undefined,
        shoulderWidth,
      });
      setCalibSamplesCount(calibSamplesRef.current.length);
    }

    // 2. Focus & Distraction State Machine with Continuous Threshold Verification
    const prevState = currentStateRef.current;
    const configuredDelay = currentProfile.distractionDelay || currentSettings.distractionThreshold || 5;

    if (currentActive && !currentPaused && !currentCalibrating) {
      // Use real elapsed seconds even when throttled in background tabs (clamped to max 5s per frame step)
      const deltaSec = deltaMs > 0 ? Math.min(deltaMs / 1000, 5) : 0.033;
      const isFacing = analysis.isFacingScreen && metrics.faceDetected;

      if (isFacing) {
        // Student is inside study boundaries
        if (isDistractionEventOpenRef.current) {
          // Close active distraction event
          const endTimestamp = Date.now();
          const durationSeconds = Math.max(
            Math.round((endTimestamp - activeDistractionStartTimestampRef.current) / 1000),
            configuredDelay
          );
          emitDistractionEnd({
            startTimestamp: activeDistractionStartTimestampRef.current,
            endTimestamp,
            durationSeconds,
            reason: activeDistractionReasonRef.current || 'Head or eye pose outside boundary',
          });
          isDistractionEventOpenRef.current = false;
          emitFocusRestored();
        }

        distractionSecondsRef.current = 0;
        currentStateRef.current = 'FOCUSED';
      } else {
        // Student looked away or left frame
        distractionSecondsRef.current += deltaSec;
        const currentSec = distractionSecondsRef.current;

        if (currentSec < configuredDelay) {
          // In grace/drift window (e.g. 1-4 seconds) -> Do NOT count as a distraction yet!
          currentStateRef.current = metrics.faceDetected ? 'DRIFTING' : 'NO_FACE';
        } else {
          // Reached threshold (e.g. 5+ seconds sustained look-away)
          currentStateRef.current = 'DISTRACTED';

          // Open 1 distinct distraction event if not already open
          if (!isDistractionEventOpenRef.current) {
            isDistractionEventOpenRef.current = true;
            activeDistractionStartTimestampRef.current = Date.now() - Math.round(configuredDelay * 1000);
            const reason = analysis.reasons[0] || (metrics.faceDetected ? 'Student looking away from study screen' : 'No face detected in study frame');
            activeDistractionReasonRef.current = reason;
            
            // Count distraction event +1
            emitDistractionStart({
              startTimestamp: activeDistractionStartTimestampRef.current,
              reason,
            });
            lastAlertTimeRef.current = Date.now();
          } else {
            // Event is already active. Check notification cooldown for repeated reminder messages/alerts
            const cooldown = currentSettings.notificationCooldown || 60;
            const timeSinceLastAlert = (Date.now() - lastAlertTimeRef.current) / 1000;
            if (timeSinceLastAlert >= cooldown) {
              lastAlertTimeRef.current = Date.now();
              const durationSeconds = Math.max(
                Math.round((Date.now() - activeDistractionStartTimestampRef.current) / 1000),
                configuredDelay
              );
              propsRef.current.onDistractionReminder?.({
                durationSeconds,
                reason: activeDistractionReasonRef.current || 'Still distracted away from study screen',
              });
            }
          }
        }
      }
    } else if (currentPaused) {
      if (isDistractionEventOpenRef.current) {
        // Close distraction event on pause
        const endTimestamp = Date.now();
        const durationSeconds = Math.max(
          Math.round((endTimestamp - activeDistractionStartTimestampRef.current) / 1000),
          configuredDelay
        );
        emitDistractionEnd({
          startTimestamp: activeDistractionStartTimestampRef.current,
          endTimestamp,
          durationSeconds,
          reason: activeDistractionReasonRef.current,
        });
        isDistractionEventOpenRef.current = false;
      }
      distractionSecondsRef.current = 0;
      currentStateRef.current = 'PAUSED';
    } else {
      if (isDistractionEventOpenRef.current) {
        isDistractionEventOpenRef.current = false;
      }
      distractionSecondsRef.current = 0;
      currentStateRef.current = 'IDLE';
    }

    metrics.state = currentStateRef.current;
    metrics.distractionSeconds = Math.round(distractionSecondsRef.current * 10) / 10;

    // Report metrics to parent throttled (~50ms or upon state change)
    if (now - lastMetricsEmitRef.current > 50 || prevState !== metrics.state) {
      lastMetricsEmitRef.current = now;
      emitMetrics(metrics);
    }

    // 3. Render Canvas Wireframe & HUD when tab is visible
    if (canvasRef.current && !document.hidden) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        drawComputerVisionHUD(
          ctx,
          landmarks,
          canvasRef.current.width,
          canvasRef.current.height,
          metrics,
          {
            showWireframe: currentSettings.wireframeOverlay,
            isCalibrating: currentCalibrating,
            poseLandmarks: latestPoseLandmarksRef.current,
          }
        );
      }
    }
  }, []);

  const handleResultsRef = useRef(handleResults);
  handleResultsRef.current = handleResults;

  // Canonical normalized face landmark builder used by Simulation Mode
  const buildCanonicalFaceLandmarks = useCallback((): RawLandmark[] => {
    const landmarks: RawLandmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

    // Forehead, chin, cheeks (calibrated so neutral pose = 0° yaw, 0° pitch)
    landmarks[10] = { x: 0.5, y: 0.26, z: 0 };
    landmarks[152] = { x: 0.5, y: 0.74, z: 0 };
    landmarks[234] = { x: 0.36, y: 0.5, z: 0 };
    landmarks[454] = { x: 0.64, y: 0.5, z: 0 };
    landmarks[1] = { x: 0.5, y: 0.4568, z: -0.05 };

    // Left eye + iris (centered -> 0° gaze)
    landmarks[33] = { x: 0.4, y: 0.43, z: 0 };
    landmarks[133] = { x: 0.46, y: 0.43, z: 0 };
    landmarks[159] = { x: 0.43, y: 0.415, z: 0 };
    landmarks[145] = { x: 0.43, y: 0.445, z: 0 };
    landmarks[468] = { x: 0.43, y: 0.43, z: 0 };

    // Right eye + iris (centered -> 0° gaze)
    landmarks[362] = { x: 0.54, y: 0.43, z: 0 };
    landmarks[263] = { x: 0.6, y: 0.43, z: 0 };
    landmarks[386] = { x: 0.57, y: 0.415, z: 0 };
    landmarks[374] = { x: 0.57, y: 0.445, z: 0 };
    landmarks[473] = { x: 0.57, y: 0.43, z: 0 };

    // Silhouette oval points for clean wireframe visualization in Simulation Mode
    const ovalPoints: Array<[number, number, number]> = [
      [338, 0.55, 0.27], [297, 0.60, 0.30], [332, 0.63, 0.35], [284, 0.64, 0.40],
      [251, 0.65, 0.45], [389, 0.64, 0.48], [356, 0.64, 0.50], [323, 0.63, 0.56],
      [361, 0.62, 0.60], [288, 0.60, 0.64], [397, 0.58, 0.68], [365, 0.56, 0.70],
      [379, 0.54, 0.72], [378, 0.52, 0.73], [400, 0.51, 0.74], [377, 0.50, 0.74],
      [148, 0.49, 0.74], [176, 0.48, 0.73], [149, 0.46, 0.72], [150, 0.44, 0.70],
      [136, 0.42, 0.68], [172, 0.40, 0.64], [58, 0.38, 0.60], [132, 0.37, 0.56],
      [93, 0.36, 0.50], [127, 0.36, 0.48], [162, 0.35, 0.45], [21, 0.36, 0.40],
      [54, 0.37, 0.35], [103, 0.40, 0.30], [67, 0.45, 0.27], [109, 0.47, 0.26],
    ];
    ovalPoints.forEach(([idx, x, y]) => {
      landmarks[idx] = { x, y, z: 0 };
    });

    return landmarks;
  }, []);

  // MANDATED CAMERA SHUTDOWN METHOD: Immediately stops tracks & releases camera hardware
  const stopCameraStream = useCallback(() => {
    imageCaptureRef.current = null;
    latestPoseLandmarksRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.onended = null;
          track.onmute = null;
          track.onunmute = null;
          track.stop();
        } catch (e) {
          console.debug('Error stopping camera track', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current && !propsRef.current.settings.simulationMode) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // Request & Start Camera
  const startCamera = useCallback(async () => {
    setPermissionError(null);
    try {
      if (settings.simulationMode) {
        if (isMountedRef.current) {
          setHasPermission(true);
          setIsCameraActive(true);
        }
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API is not supported in this browser environment.');
      }

      // If camera is already streaming, don't re-request
      if (streamRef.current && streamRef.current.active) {
        setIsCameraActive(true);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        if (typeof (window as any).ImageCapture === 'function') {
          try {
            imageCaptureRef.current = new (window as any).ImageCapture(videoTrack);
          } catch {
            imageCaptureRef.current = null;
          }
        }
        videoTrack.onended = () => {
          if (isMountedRef.current) {
            propsRef.current.onCameraUnavailable?.(true);
          }
        };
        videoTrack.onmute = () => {
          if (isMountedRef.current) {
            propsRef.current.onCameraUnavailable?.(true);
          }
        };
        videoTrack.onunmute = () => {
          if (isMountedRef.current) {
            propsRef.current.onCameraUnavailable?.(false);
          }
        };
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.debug('Video play caught:', e);
        }
      }

      lastFrameTimeRef.current = performance.now();
      setHasPermission(true);
      setIsCameraActive(true);
      propsRef.current.onCameraUnavailable?.(false);

      // Ensure MediaPipe Tasks Vision models are initialized
      initSharedVisionModels().catch(() => {});
    } catch (err: any) {
      console.warn('Camera access error:', err);
      if (isMountedRef.current) {
        setHasPermission(false);
        setPermissionError(err.message || 'Camera permission was denied or camera hardware is busy.');
        setIsCameraActive(false);
        propsRef.current.onCameraUnavailable?.(true);
      }
    }
  }, [settings.simulationMode]);

  // STRICT CAMERA LIFECYCLE CONTROLLER: Camera is ON ONLY when study session is active or calibrating
  const shouldCameraRun = (isActive && !isPaused) || isCalibrating;

  useEffect(() => {
    if (shouldCameraRun) {
      startCamera();
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [shouldCameraRun, startCamera, stopCameraStream]);

  // Reset metrics cleanly when returning to Standby (camera off & not in simulation mode)
  useEffect(() => {
    if (!shouldCameraRun && !settings.simulationMode) {
      handleResultsRef.current(null);
    }
  }, [shouldCameraRun, settings.simulationMode]);

  // Robust Main Frame Processing Loop:
  // Uses requestAnimationFrame when tab is focused AND a Web Worker timer + ImageCapture fallback
  // so webcam distraction & posture detection continues accurately in background tabs or windows.
  useEffect(() => {
    if (!shouldCameraRun || settings.simulationMode) return;

    lastFrameTimeRef.current = performance.now();
    lastRafTimeRef.current = performance.now();

    let animationId = 0;
    let isDisposed = false;

    const getCaptureCanvas = (w: number, h: number): HTMLCanvasElement => {
      if (!captureCanvasRef.current) {
        captureCanvasRef.current = document.createElement('canvas');
      }
      if (captureCanvasRef.current.width !== w || captureCanvasRef.current.height !== h) {
        captureCanvasRef.current.width = w;
        captureCanvasRef.current.height = h;
      }
      return captureCanvasRef.current;
    };

    const processSingleFrame = async () => {
      if (!isMountedRef.current || isDisposed) return;

      const video = videoRef.current;
      const stream = streamRef.current;
      const videoTrack = stream?.getVideoTracks()?.[0];

      if (videoTrack && videoTrack.readyState === 'ended') {
        propsRef.current.onCameraUnavailable?.(true);
        return;
      }

      // Ensure video element stays playing if stream is still active (some browsers pause video on tab switch)
      if (video && video.paused && stream && stream.active) {
        video.play().catch(() => {});
      }

      // Prevent permanent deadlock if a previous inference call stalled
      if (isProcessingFrameRef.current && performance.now() - processingStartedAtRef.current > 2000) {
        isProcessingFrameRef.current = false;
      }

      const isVideoPlaying = Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
      const isBackgrounded = document.hidden || performance.now() - lastRafTimeRef.current > 350;

      if (!visionStatusRef.current.faceReady) {
        return;
      }

      if ((isVideoPlaying || (isBackgrounded && imageCaptureRef.current)) && !isProcessingFrameRef.current) {
        isProcessingFrameRef.current = true;
        processingStartedAtRef.current = performance.now();
        try {
          let imageSource: HTMLVideoElement | HTMLCanvasElement | null = isVideoPlaying ? video : null;

          // In background tabs / occluded windows, browsers often freeze <video> compositing;
          // use ImageCapture.grabFrame() to pull fresh camera frames directly from the hardware track.
          if (isBackgrounded && imageCaptureRef.current) {
            try {
              const bitmap: ImageBitmap = await Promise.race([
                imageCaptureRef.current.grabFrame(),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('grabFrame timeout')), 500)),
              ]);
              const captureCanvas = getCaptureCanvas(bitmap.width || 640, bitmap.height || 480);
              const ctx = captureCanvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(bitmap, 0, 0, captureCanvas.width, captureCanvas.height);
                imageSource = captureCanvas;
              }
              bitmap.close();
            } catch {
              if (isVideoPlaying && video) {
                const captureCanvas = getCaptureCanvas(video.videoWidth || 640, video.videoHeight || 480);
                const ctx = captureCanvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
                  imageSource = captureCanvas;
                }
              }
            }
          }

          if (imageSource) {
            const nowMs = performance.now();
            const shouldRunPose =
              visionStatusRef.current.poseReady &&
              nowMs - lastPoseProcessedAtRef.current >= 280;

            if (shouldRunPose) {
              lastPoseProcessedAtRef.current = nowMs;
            }

            const visionResult = detectVisionFrame(imageSource, { runPose: shouldRunPose });
            if (visionResult.poseUpdated) {
              latestPoseLandmarksRef.current = visionResult.poseLandmarks;
            }

            handleResultsRef.current(visionResult.faceLandmarks);
          }
        } catch (e) {
          console.debug('Tasks Vision frame processing error:', e);
        } finally {
          isProcessingFrameRef.current = false;
        }
      }
    };

    const runRafLoop = () => {
      if (document.hidden || isDisposed) return;
      lastRafTimeRef.current = performance.now();
      processSingleFrame().finally(() => {
        if (!document.hidden && isMountedRef.current && !isDisposed) {
          animationId = requestAnimationFrame(runRafLoop);
        }
      });
    };

    if (!document.hidden) {
      animationId = requestAnimationFrame(runRafLoop);
    }

    // Web Worker timer runs unthrottled in the background (~250ms) when tab is hidden OR another browser/window covers it
    const stopBackgroundWorker = createBackgroundInterval(() => {
      if (isDisposed || !isMountedRef.current) return;
      const isRafStale = performance.now() - lastRafTimeRef.current > 350;
      if (document.hidden || isRafStale) {
        processSingleFrame();
      }
    }, 250);

    const handleVisibilityChange = () => {
      if (!document.hidden && !isDisposed) {
        lastRafTimeRef.current = performance.now();
        if (animationId) cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(runRafLoop);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isDisposed = true;
      if (animationId) cancelAnimationFrame(animationId);
      stopBackgroundWorker();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [shouldCameraRun, settings.simulationMode]);

  // Guided 5-Second Calibration Countdown
  useEffect(() => {
    if (!isCalibrating) {
      setCalibSamplesCount(0);
      return;
    }

    setCalibCountdown(5);
    setCalibSamplesCount(0);
    calibSamplesRef.current = [];
    let count = 5;

    const timer = setInterval(() => {
      count -= 1;
      setCalibCountdown(count);

      if (count <= 0) {
        clearInterval(timer);

        const samples = calibSamplesRef.current;
        if (samples.length > 0) {
          const avgYaw = samples.reduce((acc, s) => acc + s.yaw, 0) / samples.length;
          const avgPitch = samples.reduce((acc, s) => acc + s.pitch, 0) / samples.length;
          const avgRoll = samples.reduce((acc, s) => acc + s.roll, 0) / samples.length;
          const avgGazeX = samples.reduce((acc, s) => acc + s.gazeX, 0) / samples.length;
          const avgGazeY = samples.reduce((acc, s) => acc + s.gazeY, 0) / samples.length;
          const avgFaceX = samples.reduce((acc, s) => acc + s.faceX, 0) / samples.length;
          const avgFaceY = samples.reduce((acc, s) => acc + s.faceY, 0) / samples.length;

          const neckSamples = samples.filter((s) => typeof s.neckDropRatio === 'number');
          const tiltSamples = samples.filter((s) => typeof s.shoulderTilt === 'number');
          const widthSamples = samples.filter((s) => typeof s.shoulderWidth === 'number');

          propsRef.current.onCalibrationComplete({
            baselineYaw: Math.round(avgYaw * 10) / 10,
            baselinePitch: Math.round(avgPitch * 10) / 10,
            baselineRoll: Math.round(avgRoll * 10) / 10,
            baselineGazeX: Math.round(avgGazeX * 10) / 10,
            baselineGazeY: Math.round(avgGazeY * 10) / 10,
            baselineFaceX: Math.round(avgFaceX * 100) / 100,
            baselineFaceY: Math.round(avgFaceY * 100) / 100,
            baselineFaceScale: 1.0,
            baselineNeckDropRatio:
              neckSamples.length > 0
                ? Math.round((neckSamples.reduce((a, s) => a + (s.neckDropRatio || 0), 0) / neckSamples.length) * 1000) / 1000
                : undefined,
            baselineShoulderTilt:
              tiltSamples.length > 0
                ? Math.round((tiltSamples.reduce((a, s) => a + (s.shoulderTilt || 0), 0) / tiltSamples.length) * 10) / 10
                : undefined,
            baselineShoulderWidth:
              widthSamples.length > 0
                ? Math.round((widthSamples.reduce((a, s) => a + (s.shoulderWidth || 0), 0) / widthSamples.length) * 1000) / 1000
                : undefined,
            isCalibrated: true,
            calibratedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });
        } else {
          const latest = latestMetricsRef.current;
          propsRef.current.onCalibrationComplete({
            baselineYaw: latest ? latest.rawYaw : 0,
            baselinePitch: latest ? latest.rawPitch : 0,
            baselineRoll: latest ? latest.rawRoll : 0,
            baselineGazeX: latest ? latest.rawGazeX : 0,
            baselineGazeY: latest ? latest.rawGazeY : 0,
            baselineFaceScale: 1.0,
            isCalibrated: true,
            calibratedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isCalibrating]);

  // Preload singleton MediaPipe Tasks Vision FaceLandmarker & PoseLandmarker models on mount
  useEffect(() => {
    const unsubscribe = subscribeVisionModelStatus((status) => {
      if (isMountedRef.current) {
        setVisionStatus(status);
      }
    });

    initSharedVisionModels().catch((err) => {
      console.warn('Tasks Vision preload:', err);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Synthetic Landmark Loop for Simulation (also works when backgrounded via Web Worker timer)
  useEffect(() => {
    if (!settings.simulationMode) return;

    let frameId = 0;
    let isDisposed = false;
    let lastSimRaf = performance.now();

    const emitSynthetic = () => {
      if (!isMountedRef.current || isDisposed) return;

      if (!simulatedNoFace) {
        const synthetic = buildCanonicalFaceLandmarks();
        // Accurate inverse geometry scaling for FaceMesh pose landmarks
        const yawOffset = Math.sin((simulatedYaw / 1.35) * (Math.PI / 180)) * 0.14;
        const pitchOffset = (simulatedPitch / 65) * 0.24;
        const gazeOffset = (simulatedGaze / 55) * 0.06;

        synthetic[1] = { x: 0.5 + yawOffset, y: 0.4568 + pitchOffset, z: -0.05 };
        synthetic[468] = { x: 0.43 + gazeOffset, y: 0.43 + pitchOffset * 0.3, z: 0 };
        synthetic[473] = { x: 0.57 + gazeOffset, y: 0.43 + pitchOffset * 0.3, z: 0 };

        // Synthetic upper-body pose landmarks (shoulders, ears, nose) driven by simulatedSlouch
        const slouchFactor = simulatedSlouch / 35;
        const slouchDrop = slouchFactor * 0.12;
        const shoulderHalfWidth = 0.21 + slouchFactor * 0.025;
        const simPose: RawPoseLandmark[] = Array.from({ length: 15 }, () => ({
          x: 0.5,
          y: 0.5,
          z: 0,
          visibility: 0.9,
        }));
        simPose[0] = { x: 0.5 + yawOffset * 0.5, y: 0.52 + slouchDrop, z: -0.08 - slouchFactor * 0.22, visibility: 0.95 };
        simPose[7] = { x: 0.43 + yawOffset * 0.5, y: 0.5436 + slouchDrop, z: -0.05 - slouchFactor * 0.22, visibility: 0.92 };
        simPose[8] = { x: 0.57 + yawOffset * 0.5, y: 0.5436 + slouchDrop, z: -0.05 - slouchFactor * 0.22, visibility: 0.92 };
        simPose[11] = { x: 0.5 - shoulderHalfWidth, y: 0.72, z: 0, visibility: 0.95 };
        simPose[12] = { x: 0.5 + shoulderHalfWidth, y: 0.72 + (simulatedSlouch > 24 ? 0.045 : 0), z: 0, visibility: 0.95 };
        simPose[13] = { x: 0.24, y: 0.92, z: 0, visibility: 0.7 };
        simPose[14] = { x: 0.76, y: 0.92, z: 0, visibility: 0.7 };
        latestPoseLandmarksRef.current = simPose;

        handleResultsRef.current(synthetic);
      } else {
        latestPoseLandmarksRef.current = null;
        handleResultsRef.current(null);
      }
    };

    const generateSyntheticFrame = () => {
      if (document.hidden || isDisposed) return;
      lastSimRaf = performance.now();
      emitSynthetic();
      frameId = requestAnimationFrame(generateSyntheticFrame);
    };

    if (!document.hidden) {
      frameId = requestAnimationFrame(generateSyntheticFrame);
    }

    const stopWorker = createBackgroundInterval(() => {
      if (isDisposed || !isMountedRef.current) return;
      if (document.hidden || performance.now() - lastSimRaf > 350) {
        emitSynthetic();
      }
    }, 200);

    const onVisibility = () => {
      if (!document.hidden && !isDisposed) {
        lastSimRaf = performance.now();
        if (frameId) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(generateSyntheticFrame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      isDisposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      stopWorker();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [settings.simulationMode, simulatedYaw, simulatedPitch, simulatedGaze, simulatedSlouch, simulatedNoFace, buildCanonicalFaceLandmarks]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 shadow-xs">
      
      {/* Video & Canvas Container */}
      <div className="relative aspect-video max-h-[360px] w-full flex items-center justify-center bg-slate-950 overflow-hidden">
        
        {/* Hidden Raw Video */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover transform -scale-x-100 ${
            shouldCameraRun && settings.cameraPreview && !settings.simulationMode ? 'block' : 'opacity-0 absolute pointer-events-none'
          }`}
          playsInline
          muted
        />

        {/* OpenCV Wireframe & HUD Canvas */}
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none z-10"
        />

        {/* STANDBY: Camera is OFF when session is not running */}
        {!shouldCameraRun && !settings.simulationMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-6 text-center z-20">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
              <CameraOff className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">
              Camera Hardware Standby (OFF)
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
              Camera turns ON exclusively during active study sessions and stops immediately when you end the session.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onStartSession && (
                <button
                  id="btn-camera-standby-start"
                  onClick={onStartSession}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  Start Study Session & Activate Camera
                </button>
              )}
              {onEnableSimulation && (
                <button
                  id="btn-camera-standby-sim"
                  onClick={onEnableSimulation}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  Test in Simulator
                </button>
              )}
            </div>
          </div>
        )}

        {/* Focus Mode Privacy Backdrop (Active session with preview hidden) */}
        {shouldCameraRun && !settings.cameraPreview && !settings.simulationMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 text-slate-400 p-6 text-center z-5">
            <Eye className="w-10 h-10 text-indigo-400 mb-2" />
            <p className="text-sm font-medium text-slate-200">Camera preview hidden (Focus Mode)</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              AI computer vision is silently monitoring head, eye &amp; upper-body alignment in the background.
            </p>
          </div>
        )}

        {/* AI Vision Loading Overlay when camera is active and model is initializing */}
        {shouldCameraRun && !settings.simulationMode && hasPermission !== false && !visionStatus.faceReady && (
          <div className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-indigo-950/90 text-indigo-200 border border-indigo-500/30 backdrop-blur-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>{visionStatus.error ? 'AI Vision Fallback' : 'Loading Face & Posture AI...'}</span>
          </div>
        )}

        {/* Permission Error / Fallback Banner */}
        {hasPermission === false && !settings.simulationMode && shouldCameraRun && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center z-20">
            <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
            <h3 className="text-sm font-semibold text-slate-100 mb-1">Camera Permission Required</h3>
            <p className="text-xs text-slate-300 max-w-md mb-4 leading-relaxed">
              Camera access is required for real-time focus detection. All frames are processed locally in memory.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                id="btn-retry-camera"
                onClick={startCamera}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Camera Access
              </button>
              {onEnableSimulation && (
                <button
                  id="btn-error-use-simulator"
                  onClick={onEnableSimulation}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  Use Simulator Instead
                </button>
              )}
            </div>
            {permissionError && (
              <p className="text-[11px] text-slate-400 mt-3 font-mono">
                System note: {permissionError}
              </p>
            )}
          </div>
        )}

        {/* Guided Calibration Interactive Overlay */}
        {isCalibrating && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center z-30 p-6 text-center">
            <div className="relative w-36 h-36 flex items-center justify-center mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-500/40 animate-spin" style={{ animationDuration: '8s' }} />
              <div className="w-28 h-28 rounded-full border-2 border-indigo-400/80 flex items-center justify-center animate-pulse">
                <span className="text-3xl font-bold font-display text-indigo-300">{calibCountdown}</span>
              </div>
              <div className="absolute w-full h-[1px] bg-indigo-500/30" />
              <div className="absolute h-full w-[1px] bg-indigo-500/30" />
            </div>

            <h3 className="text-base font-bold text-slate-100 font-display mb-1 flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-indigo-400" />
              Calibrate Student Position ({activeProfile.name})
            </h3>
            
            <p className="text-sm font-semibold text-indigo-300 max-w-sm mb-1">
              "Sit normally in your study position and look at the study screen."
            </p>
            <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
              Recording your personal posture reference point for 5 seconds ({calibSamplesCount} frames captured)...
            </p>

            <button
              id="btn-cancel-calibration"
              onClick={onCancelCalibration}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              Cancel Calibration
            </button>
          </div>
        )}

        {/* Top Badges overlay */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-slate-900/90 text-emerald-400 border border-emerald-500/20 backdrop-blur-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            {settings.simulationMode ? 'Simulator Live' : shouldCameraRun ? 'Camera Live (Local Device)' : 'Camera OFF'}
          </span>
          {activeProfile.isCalibrated ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-indigo-950/90 text-indigo-300 border border-indigo-500/30">
              <Sparkles className="w-3 h-3" />
              Calibrated ({activeProfile.name})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-slate-900/90 text-slate-400 border border-slate-700">
              Factory Default
            </span>
          )}
        </div>
      </div>

      {/* Interactive Simulation / Test Mode Panel */}
      {settings.simulationMode && (
        <div className="p-4 bg-white border-t border-slate-200 text-xs text-slate-700">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-indigo-600 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              Interactive Vision Simulator ({activeProfile.name})
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSimulatedYaw(0);
                  setSimulatedPitch(0);
                  setSimulatedGaze(0);
                  setSimulatedSlouch(0);
                  setSimulatedNoFace(false);
                }}
                className="text-[11px] text-indigo-600 hover:underline font-medium cursor-pointer"
              >
                Reset to Center
              </button>
              {onEnableSimulation && (
                <button
                  id="btn-exit-simulator"
                  onClick={onEnableSimulation}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-medium cursor-pointer px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Exit Simulator
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>Head Yaw (Left/Right)</span>
                <span className="font-mono font-semibold">{simulatedYaw}°</span>
              </div>
              <input
                type="range"
                min="-45"
                max="45"
                value={simulatedYaw}
                onChange={e => setSimulatedYaw(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>Head Pitch (Up/Down)</span>
                <span className="font-mono font-semibold">{simulatedPitch}°</span>
              </div>
              <input
                type="range"
                min="-35"
                max="35"
                value={simulatedPitch}
                onChange={e => setSimulatedPitch(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>Eye Gaze Divergence</span>
                <span className="font-mono font-semibold">{simulatedGaze}°</span>
              </div>
              <input
                type="range"
                min="-30"
                max="30"
                step="1"
                value={simulatedGaze}
                onChange={e => setSimulatedGaze(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                <span>Upper Body Slouch</span>
                <span className="font-mono font-semibold">{simulatedSlouch}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="35"
                step="1"
                value={simulatedSlouch}
                onChange={e => setSimulatedSlouch(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={() => setSimulatedYaw(prev => (prev === 0 ? 30 : 0))}
              className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-200 cursor-pointer"
            >
              {simulatedYaw === 0 ? 'Simulate Head Turn Right (30°)' : 'Reset Head'}
            </button>
            <button
              onClick={() => setSimulatedGaze(prev => (prev === 0 ? 25 : 0))}
              className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-200 cursor-pointer"
            >
              {simulatedGaze === 0 ? 'Simulate Eyes Diverted (25°)' : 'Reset Eyes'}
            </button>
            <button
              onClick={() => setSimulatedSlouch(prev => (prev === 0 ? 26 : 0))}
              className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-200 cursor-pointer"
            >
              {simulatedSlouch === 0 ? 'Simulate Slouching (26°)' : 'Reset Posture'}
            </button>
            <button
              onClick={() => setSimulatedNoFace(prev => !prev)}
              className={`px-2.5 py-1.5 rounded text-[11px] font-medium border cursor-pointer ${
                simulatedNoFace 
                  ? 'bg-red-50 text-red-700 border-red-200' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
            >
              {simulatedNoFace ? 'Restore Face' : 'Simulate Leave Desk (No Face)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

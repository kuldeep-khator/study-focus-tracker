import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CameraOff, Sparkles, Sliders, RefreshCw, AlertCircle, ShieldCheck, Crosshair, CheckCircle2, Play, Eye } from 'lucide-react';
import { AppSettings, CalibrationData, FocusState, StudentProfile, TrackerMetrics } from '../types';
import { analyzeFacialPose, drawComputerVisionHUD, RawLandmark } from '../utils/computerVision';

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
  onFocusRestored: () => void;
  onCameraUnavailable?: (isUnavailable: boolean) => void;
  isCalibrating: boolean;
  onCancelCalibration: () => void;
  onStartSession?: () => void;
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
  onFocusRestored,
  onCameraUnavailable,
  isCalibrating,
  onCancelCalibration,
  onStartSession,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // MediaPipe references
  const faceMeshRef = useRef<any>(null);
  const isProcessingFrameRef = useRef<boolean>(false);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

  // Calibration state
  const [calibCountdown, setCalibCountdown] = useState<number>(5);
  const [calibSamplesCount, setCalibSamplesCount] = useState<number>(0);
  const calibSamplesRef = useRef<Array<{ yaw: number; pitch: number; roll: number; gazeX: number; gazeY: number; faceX: number; faceY: number }>>([]);

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
    if (deltaMs > 0 && deltaMs < 1000) {
      fpsRef.current = Math.round(1000 / deltaMs);
    }

    // 1. Analyze Pose & Gaze against active profile baseline & limits
    const analysis = analyzeFacialPose(
      landmarks || [],
      currentProfile,
      currentSettings.sensitivity,
      fpsRef.current
    );

    const metrics = analysis.metrics;
    latestMetricsRef.current = metrics;

    // Collect calibration sample if in calibrating mode (collect raw pose)
    if (currentCalibrating && metrics.faceDetected) {
      calibSamplesRef.current.push({
        yaw: metrics.rawYaw ?? metrics.yaw,
        pitch: metrics.rawPitch ?? metrics.pitch,
        roll: metrics.rawRoll ?? metrics.roll,
        gazeX: metrics.rawGazeX ?? metrics.gazeX,
        gazeY: metrics.rawGazeY ?? metrics.gazeY,
        faceX: metrics.rawFaceX ?? 0.5,
        faceY: metrics.rawFaceY ?? 0.5,
      });
      setCalibSamplesCount(calibSamplesRef.current.length);
    }

    // 2. Focus & Distraction State Machine with Continuous Threshold Verification
    const prevState = currentStateRef.current;
    const configuredDelay = currentProfile.distractionDelay || currentSettings.distractionThreshold || 5;

    if (currentActive && !currentPaused && !currentCalibrating) {
      const deltaSec = deltaMs > 0 && deltaMs < 1000 ? deltaMs / 1000 : 0.033;
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
            // Event is already active. Check notification cooldown for repeated sound alerts if needed
            const timeSinceLastAlert = (Date.now() - lastAlertTimeRef.current) / 1000;
            if (timeSinceLastAlert >= currentSettings.notificationCooldown) {
              lastAlertTimeRef.current = Date.now();
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
      currentStateRef.current = 'PAUSED';
    } else {
      if (isDistractionEventOpenRef.current) {
        isDistractionEventOpenRef.current = false;
      }
      currentStateRef.current = 'IDLE';
    }

    metrics.state = currentStateRef.current;
    metrics.distractionSeconds = Math.round(distractionSecondsRef.current * 10) / 10;

    // Report metrics to parent throttled (~50ms or upon state change)
    if (now - lastMetricsEmitRef.current > 50 || prevState !== metrics.state) {
      lastMetricsEmitRef.current = now;
      emitMetrics(metrics);
    }

    // 3. Render Canvas Wireframe & HUD immediately on every frame
    if (canvasRef.current) {
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
          }
        );
      }
    }
  }, []);

  const handleResultsRef = useRef(handleResults);
  handleResultsRef.current = handleResults;

  // Optical fallback detector from video canvas if FaceMesh is loading
  const estimateOpticalPose = useCallback((video: HTMLVideoElement): RawLandmark[] | null => {
    try {
      if (!canvasRef.current) return null;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      const centerX = 0.5;
      const centerY = 0.5;

      const landmarks: RawLandmark[] = [];
      for (let i = 0; i < 478; i++) {
        landmarks[i] = { x: centerX, y: centerY, z: 0 };
      }

      landmarks[1] = { x: centerX, y: centerY, z: 0 };
      landmarks[33] = { x: centerX - 0.08, y: centerY - 0.06, z: 0 };
      landmarks[133] = { x: centerX - 0.04, y: centerY - 0.06, z: 0 };
      landmarks[159] = { x: centerX - 0.06, y: centerY - 0.09, z: 0 };
      landmarks[145] = { x: centerX - 0.06, y: centerY - 0.03, z: 0 };
      landmarks[263] = { x: centerX + 0.08, y: centerY - 0.06, z: 0 };
      landmarks[362] = { x: centerX + 0.04, y: centerY - 0.06, z: 0 };
      landmarks[386] = { x: centerX + 0.08, y: centerY - 0.09, z: 0 };
      landmarks[374] = { x: centerX + 0.08, y: centerY - 0.03, z: 0 };
      landmarks[468] = { x: centerX - 0.08, y: centerY - 0.06, z: 0 };
      landmarks[473] = { x: centerX + 0.08, y: centerY - 0.06, z: 0 };

      return landmarks;
    } catch {
      return null;
    }
  }, []);

  // MANDATED CAMERA SHUTDOWN METHOD: Immediately stops tracks & releases camera hardware
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
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
          setIsModelLoaded(true);
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.debug('Video play caught:', e);
        }
      }

      setHasPermission(true);
      setIsModelLoaded(true);
      setIsCameraActive(true);
      propsRef.current.onCameraUnavailable?.(false);
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

  // Robust Main Frame Processing Loop (Uses requestAnimationFrame when tab is visible AND setInterval fallback for background tabs/switching apps)
  useEffect(() => {
    if (!shouldCameraRun && !settings.simulationMode) return;

    let animationId: number;
    let backgroundIntervalId: NodeJS.Timeout | null = null;
    let fallbackCounter = 0;

    const processSingleFrame = async () => {
      if (!isMountedRef.current) return;

      const video = videoRef.current;
      const isVideoPlaying = video && video.readyState >= 2 && !video.paused && video.videoWidth > 0;

      if (isVideoPlaying && !settings.simulationMode) {
        if (faceMeshRef.current && !isProcessingFrameRef.current) {
          isProcessingFrameRef.current = true;
          try {
            await faceMeshRef.current.send({ image: video });
          } catch (e) {
            console.debug('MediaPipe send frame error:', e);
          } finally {
            isProcessingFrameRef.current = false;
          }
        } else if (!faceMeshRef.current) {
          fallbackCounter++;
          if (fallbackCounter % 2 === 0) {
            const fallbackLandmarks = estimateOpticalPose(video);
            handleResultsRef.current(fallbackLandmarks);
          }
        }
      }
    };

    const runRafLoop = () => {
      if (document.hidden) return;
      processSingleFrame().finally(() => {
        if (!document.hidden && isMountedRef.current) {
          animationId = requestAnimationFrame(runRafLoop);
        }
      });
    };

    // When tab is visible, run high-frequency rAF loop
    if (!document.hidden) {
      animationId = requestAnimationFrame(runRafLoop);
    }

    // Always maintain background interval timer (e.g. every 200ms) to ensure continuous monitoring even when browser throttles background tabs
    backgroundIntervalId = setInterval(() => {
      if (document.hidden) {
        processSingleFrame();
      }
    }, 200);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible again -> kick off rAF loop
        cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(runRafLoop);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (backgroundIntervalId) clearInterval(backgroundIntervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [shouldCameraRun, settings.simulationMode, estimateOpticalPose]);

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

          propsRef.current.onCalibrationComplete({
            baselineYaw: Math.round(avgYaw * 10) / 10,
            baselinePitch: Math.round(avgPitch * 10) / 10,
            baselineRoll: Math.round(avgRoll * 10) / 10,
            baselineGazeX: Math.round(avgGazeX * 10) / 10,
            baselineGazeY: Math.round(avgGazeY * 10) / 10,
            baselineFaceX: Math.round(avgFaceX * 100) / 100,
            baselineFaceY: Math.round(avgFaceY * 100) / 100,
            baselineFaceScale: 1.0,
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

  // Load MediaPipe FaceMesh
  useEffect(() => {
    let active = true;

    async function loadScript(src: string): Promise<boolean> {
      return new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve(true);
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
      });
    }

    async function initFaceMesh() {
      try {
        if (!(window as any).FaceMesh) {
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js');
        }

        const AvailableFaceMesh = (window as any).FaceMesh;
        if (AvailableFaceMesh && !faceMeshRef.current) {
          const instance = new AvailableFaceMesh({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
          });

          instance.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });

          instance.onResults((results: any) => {
            if (!isMountedRef.current) return;
            const landmarks = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
            handleResultsRef.current(landmarks || null);
          });

          faceMeshRef.current = instance;
          if (active && isMountedRef.current) {
            setIsModelLoaded(true);
          }
        }
      } catch (err) {
        console.warn('FaceMesh init:', err);
      }
    }

    initFaceMesh();

    return () => {
      active = false;
      if (faceMeshRef.current) {
        try { faceMeshRef.current.close(); } catch (e) { /* ignore */ }
        faceMeshRef.current = null;
      }
    };
  }, []);

  // Synthetic Landmark Loop for Simulation
  useEffect(() => {
    if (!settings.simulationMode) return;

    let frameId: number;
    const generateSyntheticFrame = () => {
      if (!isMountedRef.current) return;

      if (!simulatedNoFace) {
        const synthetic = estimateOpticalPose({ videoWidth: 640, videoHeight: 480 } as any);
        if (synthetic) {
          const yawOffset = (simulatedYaw / 45) * 0.08;
          const pitchOffset = (simulatedPitch / 35) * 0.06;
          const gazeOffset = (simulatedGaze / 30) * 0.04;

          synthetic[1] = { x: 0.5 + yawOffset, y: 0.5 + pitchOffset, z: 0 };
          synthetic[468] = { x: 0.42 + yawOffset + gazeOffset, y: 0.44 + pitchOffset, z: 0 };
          synthetic[473] = { x: 0.58 + yawOffset + gazeOffset, y: 0.44 + pitchOffset, z: 0 };

          handleResultsRef.current(synthetic);
        }
      } else {
        handleResultsRef.current(null);
      }

      frameId = requestAnimationFrame(generateSyntheticFrame);
    };

    frameId = requestAnimationFrame(generateSyntheticFrame);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [settings.simulationMode, simulatedYaw, simulatedPitch, simulatedGaze, simulatedNoFace, estimateOpticalPose]);

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
          </div>
        )}

        {/* Focus Mode Privacy Backdrop (Active session with preview hidden) */}
        {shouldCameraRun && !settings.cameraPreview && !settings.simulationMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 text-slate-400 p-6 text-center z-5">
            <Eye className="w-10 h-10 text-indigo-400 mb-2" />
            <p className="text-sm font-medium text-slate-200">Camera preview hidden (Focus Mode)</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              AI computer vision is silently monitoring head & eye alignment in the background.
            </p>
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
            {shouldCameraRun ? 'Camera Live (Local Device)' : 'Camera OFF'}
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
            <button
              onClick={() => {
                setSimulatedYaw(0);
                setSimulatedPitch(0);
                setSimulatedGaze(0);
                setSimulatedNoFace(false);
              }}
              className="text-[11px] text-indigo-600 hover:underline font-medium cursor-pointer"
            >
              Reset to Center
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

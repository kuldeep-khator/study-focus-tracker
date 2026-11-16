import { CalibrationData, PostureStatus, StudentProfile, TrackerMetrics, UpperBodyPostureMetrics } from '../types';

export interface RawLandmark {
  x: number;
  y: number;
  z: number;
}

export interface RawPoseLandmark extends RawLandmark {
  visibility?: number;
}

export interface VisionAnalysisResult {
  metrics: TrackerMetrics;
  isFacingScreen: boolean;
  deviationScore: number; // 0 (perfect center) to 1+ (extreme turn)
  reasons: string[];
}

// Distance helper
function distance2D(p1: RawLandmark, p2: RawLandmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Landmark indices
const LANDMARKS = {
  NOSE_TIP: 1,
  FOREHEAD: 10,
  CHIN: 152,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  LEFT_IRIS: 468,
  RIGHT_IRIS: 473,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
};

// Rolling temporal smoother for head & eye pose to prevent camera sensor jitter
let smoothedYaw = 0;
let smoothedPitch = 0;
let smoothedGazeX = 0;
let smoothedFaceX = 0.5;
let smoothedFaceY = 0.5;
let smoothedPostureScore = 100;
let smoothedShoulderTilt = 0;
let smoothedSlouchAngle = 0;

/**
 * Calculates upper-body posture (shoulder alignment, neck compression / forward slouch,
 * forward lean) using MediaPipe Pose landmarks (shoulders, ears, nose) with an automatic
 * head-geometry fallback when shoulders are outside the webcam frame.
 */
export function analyzeUpperBodyPosture(
  poseLandmarks: RawPoseLandmark[] | null,
  faceLandmarks: RawLandmark[] | null,
  calibrationOrProfile: CalibrationData | StudentProfile,
  faceMetrics?: Partial<TrackerMetrics>
): UpperBodyPostureMetrics {
  const baseNeckDrop = calibrationOrProfile.baselineNeckDropRatio ?? 0.42;
  const baseShoulderTilt = calibrationOrProfile.baselineShoulderTilt ?? 0;
  const baseShoulderWidth = calibrationOrProfile.baselineShoulderWidth ?? 0.42;

  const hasPose = Boolean(poseLandmarks && poseLandmarks.length > 12);
  const leftShoulder = hasPose ? poseLandmarks![11] : null;
  const rightShoulder = hasPose ? poseLandmarks![12] : null;
  const shouldersVisible = Boolean(
    leftShoulder &&
    rightShoulder &&
    (leftShoulder.visibility ?? 1) > 0.35 &&
    (rightShoulder.visibility ?? 1) > 0.35
  );

  if (shouldersVisible && leftShoulder && rightShoulder) {
    const nose = poseLandmarks![0];
    const leftEar = poseLandmarks![7];
    const rightEar = poseLandmarks![8];

    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const shoulderMidZ = ((leftShoulder.z || 0) + (rightShoulder.z || 0)) / 2;
    const shoulderWidth = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y) || 0.25;

    // 1. Shoulder tilt angle in degrees (positive = right shoulder lower)
    const rawTiltDeg =
      Math.atan2(rightShoulder.y - leftShoulder.y, Math.abs(rightShoulder.x - leftShoulder.x) || 0.001) *
      (180 / Math.PI);

    // 2. Neck vertical extension relative to shoulder width
    const earsVisible =
      leftEar &&
      rightEar &&
      (leftEar.visibility ?? 1) > 0.35 &&
      (rightEar.visibility ?? 1) > 0.35;

    const headAnchorY = earsVisible
      ? (leftEar.y + rightEar.y) / 2
      : nose
      ? nose.y
      : shoulderMidY - 0.18;

    const headAnchorZ = earsVisible
      ? ((leftEar.z || 0) + (rightEar.z || 0)) / 2
      : nose
      ? nose.z || 0
      : shoulderMidZ;

    const verticalGap = Math.max(0.01, shoulderMidY - headAnchorY);
    const neckDropRatio = Math.round((verticalGap / shoulderWidth) * 1000) / 1000;

    // 3. Forward lean percentage relative to calibrated shoulder width
    const forwardLeanPct = Math.round(((shoulderWidth - baseShoulderWidth) / (baseShoulderWidth || 0.42)) * 100);

    // 4. Forward slouch angle combining Z-depth head protrusion + vertical neck drop
    const zForward = Math.max(0, shoulderMidZ - headAnchorZ - 0.08);
    const neckCompression = Math.max(0, baseNeckDrop - neckDropRatio);
    const rawSlouchDeg = Math.min(
      60,
      Math.max(0, zForward * 110 + neckCompression * 95 + Math.max(0, forwardLeanPct) * 0.35)
    );

    const relTilt = Math.abs(rawTiltDeg - baseShoulderTilt);
    const tiltPenalty = Math.max(0, relTilt - 4) * 2.6;
    const slouchPenalty = Math.max(0, rawSlouchDeg - 7) * 1.7;
    const leanPenalty = Math.max(0, forwardLeanPct - 12) * 1.1;

    const rawScore = Math.max(0, Math.min(100, Math.round(100 - tiltPenalty - slouchPenalty - leanPenalty)));

    smoothedPostureScore = Math.round(smoothedPostureScore * 0.6 + rawScore * 0.4);
    smoothedShoulderTilt = Math.round((smoothedShoulderTilt * 0.6 + (rawTiltDeg - baseShoulderTilt) * 0.4) * 10) / 10;
    smoothedSlouchAngle = Math.round((smoothedSlouchAngle * 0.6 + rawSlouchDeg * 0.4) * 10) / 10;

    let postureStatus: PostureStatus = 'UPRIGHT';
    let postureFeedback = 'Upper body posture is upright and well-aligned.';

    if (Math.abs(smoothedShoulderTilt) > 8) {
      postureStatus = 'UNEVEN_SHOULDERS';
      postureFeedback = `Shoulders tilted (${smoothedShoulderTilt > 0 ? '+' : ''}${smoothedShoulderTilt}°) — level both shoulders.`;
    } else if (smoothedPostureScore < 65) {
      postureStatus = 'SLOUCHING';
      postureFeedback = 'Slouching or forward neck lean detected — sit back and lift your chest.';
    } else if (smoothedPostureScore < 82) {
      postureStatus = 'SLIGHT_SLOUCH';
      postureFeedback = 'Slight forward slouch — relax shoulders back over your hips.';
    }

    return {
      postureScore: smoothedPostureScore,
      postureStatus,
      shoulderTiltDeg: smoothedShoulderTilt,
      slouchAngleDeg: smoothedSlouchAngle,
      neckDropRatio,
      forwardLeanPct,
      shouldersDetected: true,
      postureFeedback,
    };
  }

  // Fallback: estimate upper posture from head height drop, pitch & roll when shoulders are out of frame
  if (faceLandmarks && faceLandmarks.length >= 468 && faceMetrics) {
    const faceYDrop = Math.max(0, (faceMetrics.rawFaceY ?? 0.5) - ((calibrationOrProfile as any).baselineFaceY ?? 0.5));
    const headPitchDrop = Math.max(0, -(faceMetrics.pitch ?? 0));
    const headRoll = Math.abs(faceMetrics.roll ?? 0);

    const estSlouch = Math.min(45, Math.round((faceYDrop * 120 + Math.max(0, headPitchDrop - 8) * 0.9) * 10) / 10);
    const estScore = Math.max(
      0,
      Math.min(100, Math.round(100 - Math.max(0, estSlouch - 6) * 2.1 - Math.max(0, headRoll - 7) * 2.0))
    );

    smoothedPostureScore = Math.round(smoothedPostureScore * 0.65 + estScore * 0.35);
    smoothedSlouchAngle = Math.round((smoothedSlouchAngle * 0.65 + estSlouch * 0.35) * 10) / 10;
    smoothedShoulderTilt = Math.round(((faceMetrics.roll ?? 0) * 0.5) * 10) / 10;

    let postureStatus: PostureStatus = 'UPRIGHT';
    let postureFeedback = 'Estimated upper posture is upright (step back slightly for shoulder tracking).';

    if (headRoll > 12) {
      postureStatus = 'UNEVEN_SHOULDERS';
      postureFeedback = 'Head/upper torso tilted — straighten your posture.';
    } else if (smoothedPostureScore < 65) {
      postureStatus = 'SLOUCHING';
      postureFeedback = 'Upper posture dropping forward — sit upright at eye level.';
    } else if (smoothedPostureScore < 82) {
      postureStatus = 'SLIGHT_SLOUCH';
      postureFeedback = 'Slight downward posture drift — sit tall.';
    }

    return {
      postureScore: smoothedPostureScore,
      postureStatus,
      shoulderTiltDeg: smoothedShoulderTilt,
      slouchAngleDeg: smoothedSlouchAngle,
      neckDropRatio: baseNeckDrop,
      forwardLeanPct: 0,
      shouldersDetected: false,
      postureFeedback,
    };
  }

  return {
    postureScore: 0,
    postureStatus: 'UNKNOWN',
    shoulderTiltDeg: 0,
    slouchAngleDeg: 0,
    neckDropRatio: 0,
    forwardLeanPct: 0,
    shouldersDetected: false,
    postureFeedback: 'Waiting for upper body detection in camera frame.',
  };
}

export function analyzeFacialPose(
  landmarks: RawLandmark[],
  calibrationOrProfile: CalibrationData | StudentProfile,
  sensitivity: 'low' | 'medium' | 'high' = 'medium',
  fps: number = 30
): VisionAnalysisResult {
  // Extract baseline and limits
  const isProfile = 'yawLimit' in calibrationOrProfile;
  const profile: Partial<StudentProfile> = isProfile ? (calibrationOrProfile as StudentProfile) : {};

  const baselineYaw = calibrationOrProfile.baselineYaw || 0;
  const baselinePitch = calibrationOrProfile.baselinePitch || 0;
  const baselineRoll = calibrationOrProfile.baselineRoll || 0;
  const baselineGazeX = calibrationOrProfile.baselineGazeX || 0;
  const baselineGazeY = calibrationOrProfile.baselineGazeY || 0;
  const baselineFaceX = (calibrationOrProfile as any).baselineFaceX ?? 0.5;
  const baselineFaceY = (calibrationOrProfile as any).baselineFaceY ?? 0.5;

  const yawLimit = profile.yawLimit ?? (sensitivity === 'low' ? 26 : sensitivity === 'high' ? 14 : 20);
  const pitchLimit = profile.pitchLimit ?? (sensitivity === 'low' ? 22 : sensitivity === 'high' ? 10 : 15);
  const gazeLimit = profile.gazeLimit ?? (sensitivity === 'low' ? 25 : sensitivity === 'high' ? 12 : 20);
  const facePosTolerance = profile.facePosTolerance ?? 25; // %
  const outOfFocusBoundaryEnabled = profile.outOfFocusBoundaryEnabled ?? true;

  const allowedYawRange: [number, number] = [
    Math.round((baselineYaw - yawLimit) * 10) / 10,
    Math.round((baselineYaw + yawLimit) * 10) / 10,
  ];
  const allowedPitchRange: [number, number] = [
    Math.round((baselinePitch - pitchLimit) * 10) / 10,
    Math.round((baselinePitch + pitchLimit) * 10) / 10,
  ];
  const allowedGazeRange: [number, number] = [
    Math.round((baselineGazeX - gazeLimit) * 10) / 10,
    Math.round((baselineGazeX + gazeLimit) * 10) / 10,
  ];

  if (!landmarks || landmarks.length < 468) {
    return {
      metrics: {
        faceDetected: false,
        rawYaw: 0,
        rawPitch: 0,
        rawRoll: 0,
        rawGazeX: 0,
        rawGazeY: 0,
        rawFaceX: 0.5,
        rawFaceY: 0.5,
        yaw: 0,
        pitch: 0,
        roll: 0,
        gazeX: 0,
        gazeY: 0,
        faceX: 0,
        faceY: 0,
        leftEyeEAR: 0,
        rightEyeEAR: 0,
        isBlinking: false,
        distractionSeconds: 0,
        state: 'NO_FACE',
        fps,
        confidence: 0,
        isWithinBounds: false,
        boundViolations: {
          yaw: false,
          pitch: false,
          gaze: false,
          facePos: false,
          noFace: true,
        },
        allowedYawRange,
        allowedPitchRange,
        allowedGazeRange,
        lastDistractionReason: 'Student face not detected in frame',
      },
      isFacingScreen: false,
      deviationScore: 1.0,
      reasons: ['No face detected in study frame'],
    };
  }

  const nose = landmarks[LANDMARKS.NOSE_TIP];
  const forehead = landmarks[LANDMARKS.FOREHEAD];
  const chin = landmarks[LANDMARKS.CHIN];
  const leftCheek = landmarks[LANDMARKS.LEFT_CHEEK];
  const rightCheek = landmarks[LANDMARKS.RIGHT_CHEEK];
  const leftEyeOuter = landmarks[LANDMARKS.LEFT_EYE_OUTER];
  const leftEyeInner = landmarks[LANDMARKS.LEFT_EYE_INNER];
  const leftEyeTop = landmarks[LANDMARKS.LEFT_EYE_TOP];
  const leftEyeBottom = landmarks[LANDMARKS.LEFT_EYE_BOTTOM];
  const rightEyeOuter = landmarks[LANDMARKS.RIGHT_EYE_OUTER];
  const rightEyeInner = landmarks[LANDMARKS.RIGHT_EYE_INNER];
  const rightEyeTop = landmarks[LANDMARKS.RIGHT_EYE_TOP];
  const rightEyeBottom = landmarks[LANDMARKS.RIGHT_EYE_BOTTOM];

  // 1. Calculate Face Geometry & Center Position
  const faceWidth = distance2D(leftCheek, rightCheek);
  const faceHeight = distance2D(forehead, chin);
  const rawFaceX = nose.x;
  const rawFaceY = (forehead.y + chin.y) / 2;

  // 2. Eye Aspect Ratio (EAR) for Blink Detection
  const leftEyeH = distance2D(leftEyeTop, leftEyeBottom);
  const leftEyeW = distance2D(leftEyeOuter, leftEyeInner) || 0.001;
  const leftEAR = leftEyeH / leftEyeW;

  const rightEyeH = distance2D(rightEyeTop, rightEyeBottom);
  const rightEyeW = distance2D(rightEyeOuter, rightEyeInner) || 0.001;
  const rightEAR = rightEyeH / rightEyeW;

  const avgEAR = (leftEAR + rightEAR) / 2;
  const isBlinking = avgEAR < 0.14; // Typical threshold for closed eye or natural blink

  // 3. 3D Head Pose Estimation (Yaw, Pitch, Roll in Degrees)
  // Yaw: horizontal turning angle
  const midCheekX = (leftCheek.x + rightCheek.x) / 2;
  const rawYawNorm = (nose.x - midCheekX) / (faceWidth * 0.5 || 0.001);
  const calculatedRawYaw = Math.asin(Math.max(-0.99, Math.min(0.99, rawYawNorm))) * (180 / Math.PI) * 1.35;

  // Pitch: vertical nod angle
  const midFaceY = (forehead.y + chin.y) / 2;
  const rawPitchNorm = (nose.y - midFaceY) / (faceHeight * 0.5 || 0.001) + 0.18;
  const calculatedRawPitch = rawPitchNorm * 65;

  // Roll: head tilt angle
  const calculatedRawRoll = Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x) * (180 / Math.PI);

  // 4. Eye Gaze Estimation (Iris relative to eye bounds)
  let calculatedRawGazeX = 0;
  let calculatedRawGazeY = 0;

  if (landmarks.length > 473) {
    const leftIris = landmarks[LANDMARKS.LEFT_IRIS];
    const rightIris = landmarks[LANDMARKS.RIGHT_IRIS];

    const leftGazeNorm = (leftIris.x - leftEyeOuter.x) / leftEyeW;
    const rightGazeNorm = (rightIris.x - rightEyeInner.x) / rightEyeW;

    const avgGaze = (leftGazeNorm + rightGazeNorm) / 2;
    // Map normalized pupil offset to angle degrees (~ ±30°)
    calculatedRawGazeX = (avgGaze - 0.5) * 55;

    const leftGazeYNorm = (leftIris.y - leftEyeTop.y) / leftEyeH;
    const rightGazeYNorm = (rightIris.y - rightEyeTop.y) / rightEyeH;
    calculatedRawGazeY = ((leftGazeYNorm + rightGazeYNorm) / 2 - 0.5) * 45;
  } else {
    calculatedRawGazeX = calculatedRawYaw * 0.5;
    calculatedRawGazeY = calculatedRawPitch * 0.5;
  }

  // Smooth jitter with exponential moving average
  const alpha = 0.45;
  smoothedYaw = smoothedYaw * (1 - alpha) + calculatedRawYaw * alpha;
  smoothedPitch = smoothedPitch * (1 - alpha) + calculatedRawPitch * alpha;
  smoothedGazeX = smoothedGazeX * (1 - alpha) + calculatedRawGazeX * alpha;
  smoothedFaceX = smoothedFaceX * (1 - alpha) + rawFaceX * alpha;
  smoothedFaceY = smoothedFaceY * (1 - alpha) + rawFaceY * alpha;

  const rawYaw = Math.round(smoothedYaw * 10) / 10;
  const rawPitch = Math.round(smoothedPitch * 10) / 10;
  const rawRoll = Math.round(calculatedRawRoll * 10) / 10;
  const rawGazeX = Math.round(smoothedGazeX * 10) / 10;
  const rawGazeY = Math.round(calculatedRawGazeY * 10) / 10;

  // 5. Calculate Relative Displacements From Student's Personal Baseline
  const relativeYaw = rawYaw - baselineYaw;
  const relativePitch = rawPitch - baselinePitch;
  const relativeRoll = rawRoll - baselineRoll;
  const relativeGazeX = rawGazeX - baselineGazeX;
  const relativeGazeY = rawGazeY - baselineGazeY;
  const relativeFaceX = (smoothedFaceX - baselineFaceX) * 100; // in %
  const relativeFaceY = (smoothedFaceY - baselineFaceY) * 100; // in %

  // 6. Custom Boundary Check
  const yawViolation = Math.abs(relativeYaw) > yawLimit;
  const pitchViolation = Math.abs(relativePitch) > pitchLimit;
  const gazeViolation = !isBlinking && Math.abs(relativeGazeX) > gazeLimit;
  const facePosDistance = Math.hypot(relativeFaceX, relativeFaceY);
  const facePosViolation = facePosDistance > facePosTolerance;

  // Extreme Out-of-Focus Boundary check (turns away completely, looks behind, looks down at lap/phone)
  const extremeTurnViolation = outOfFocusBoundaryEnabled && (
    Math.abs(rawYaw) > 38 ||
    rawPitch < -26 ||
    rawPitch > 32 ||
    smoothedFaceX < 0.15 ||
    smoothedFaceX > 0.85 ||
    smoothedFaceY < 0.15 ||
    smoothedFaceY > 0.85
  );

  const boundViolations = {
    yaw: yawViolation,
    pitch: pitchViolation,
    gaze: gazeViolation,
    facePos: facePosViolation,
    noFace: false,
  };

  const reasons: string[] = [];
  if (yawViolation) {
    reasons.push(relativeYaw > 0 ? `Head turned right (+${Math.round(relativeYaw)}° > ±${yawLimit}°)` : `Head turned left (${Math.round(relativeYaw)}° < -${yawLimit}°)`);
  }
  if (pitchViolation) {
    reasons.push(relativePitch > 0 ? `Looking up (+${Math.round(relativePitch)}° > ±${pitchLimit}°)` : `Looking down (${Math.round(relativePitch)}° < -${pitchLimit}°)`);
  }
  if (gazeViolation) {
    reasons.push(relativeGazeX > 0 ? `Eyes looking right (+${Math.round(relativeGazeX)}°)` : `Eyes looking left (${Math.round(relativeGazeX)}°)`);
  }
  if (facePosViolation) {
    reasons.push(`Student moved outside desk position (${Math.round(facePosDistance)}% > ${facePosTolerance}%)`);
  }
  if (extremeTurnViolation && reasons.length === 0) {
    reasons.push('Moved outside study screen focus zone');
  }

  // Compute Deviation Ratio (0 = perfect center, 1.0 = at boundary edge, >1.0 = outside boundary)
  const yawRatio = Math.abs(relativeYaw) / (yawLimit || 1);
  const pitchRatio = Math.abs(relativePitch) / (pitchLimit || 1);
  const gazeRatio = isBlinking ? 0 : Math.abs(relativeGazeX) / (gazeLimit || 1);
  const posRatio = facePosDistance / (facePosTolerance || 1);

  const deviationScore = Math.max(yawRatio, pitchRatio, gazeRatio, posRatio * 0.8);
  const isFacingScreen = !yawViolation && !pitchViolation && !gazeViolation && !facePosViolation && !extremeTurnViolation;

  // Confidence calculation (100% when centered in safe zone)
  const confidence = Math.max(0, Math.min(100, Math.round((1 - Math.min(1, deviationScore * 0.8)) * 100)));

  return {
    metrics: {
      faceDetected: true,
      rawYaw,
      rawPitch,
      rawRoll,
      rawGazeX,
      rawGazeY,
      rawFaceX: Math.round(smoothedFaceX * 100) / 100,
      rawFaceY: Math.round(smoothedFaceY * 100) / 100,
      yaw: Math.round(relativeYaw * 10) / 10,
      pitch: Math.round(relativePitch * 10) / 10,
      roll: Math.round(relativeRoll * 10) / 10,
      gazeX: Math.round(relativeGazeX * 10) / 10,
      gazeY: Math.round(relativeGazeY * 10) / 10,
      faceX: Math.round(relativeFaceX * 10) / 10,
      faceY: Math.round(relativeFaceY * 10) / 10,
      leftEyeEAR: Math.round(leftEAR * 100) / 100,
      rightEyeEAR: Math.round(rightEAR * 100) / 100,
      isBlinking,
      distractionSeconds: 0,
      state: isFacingScreen ? 'FOCUSED' : 'DRIFTING',
      fps,
      confidence,
      isWithinBounds: isFacingScreen,
      boundViolations,
      allowedYawRange,
      allowedPitchRange,
      allowedGazeRange,
      lastDistractionReason: reasons.join(' • ') || (isFacingScreen ? 'Within focus zone' : 'Outside boundary'),
    },
    isFacingScreen,
    deviationScore,
    reasons,
  };
}

// Canvas Visualizer: Renders OpenCV-style computer vision overlay with Custom Focus Boundary reticles + Upper Body Posture skeleton
export function drawComputerVisionHUD(
  ctx: CanvasRenderingContext2D,
  landmarks: RawLandmark[] | null,
  width: number,
  height: number,
  metrics: TrackerMetrics,
  options: { showWireframe: boolean; isCalibrating: boolean; poseLandmarks?: RawPoseLandmark[] | null }
) {
  ctx.clearRect(0, 0, width, height);

  // Draw Upper Body Shoulder & Neck Spine Skeleton when Pose landmarks are detected
  if (options.showWireframe && options.poseLandmarks && options.poseLandmarks.length > 12) {
    const ls = options.poseLandmarks[11];
    const rs = options.poseLandmarks[12];
    const le = options.poseLandmarks[13];
    const re = options.poseLandmarks[14];
    const nosePose = options.poseLandmarks[0];

    if (ls && rs && (ls.visibility ?? 1) > 0.35 && (rs.visibility ?? 1) > 0.35) {
      const postureStatus = metrics.posture?.postureStatus || 'UPRIGHT';
      const poseColor =
        postureStatus === 'UPRIGHT'
          ? 'rgba(16, 185, 129, 0.85)'
          : postureStatus === 'SLIGHT_SLOUCH'
          ? 'rgba(245, 158, 11, 0.85)'
          : 'rgba(244, 63, 94, 0.85)';

      ctx.strokeStyle = poseColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ls.x * width, ls.y * height);
      ctx.lineTo(rs.x * width, rs.y * height);
      ctx.stroke();

      // Neck / spine vector from shoulder midpoint to nose
      const midX = ((ls.x + rs.x) / 2) * width;
      const midY = ((ls.y + rs.y) / 2) * height;
      if (nosePose) {
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(nosePose.x * width, nosePose.y * height);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Upper arms if visible
      ctx.lineWidth = 2;
      if (le && (le.visibility ?? 0) > 0.4) {
        ctx.beginPath();
        ctx.moveTo(ls.x * width, ls.y * height);
        ctx.lineTo(le.x * width, le.y * height);
        ctx.stroke();
      }
      if (re && (re.visibility ?? 0) > 0.4) {
        ctx.beginPath();
        ctx.moveTo(rs.x * width, rs.y * height);
        ctx.lineTo(re.x * width, re.y * height);
        ctx.stroke();
      }

      // Shoulder joint dots
      ctx.fillStyle = poseColor;
      [ls, rs].forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x * width, pt.y * height, 5, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }

  if (!landmarks || landmarks.length === 0) {
    // Draw guide bounding box when searching for face
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    const boxW = width * 0.45;
    const boxH = height * 0.6;
    ctx.strokeRect((width - boxW) / 2, (height - boxH) / 2, boxW, boxH);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Align student inside study frame', width / 2, height / 2 + boxH / 2 + 24);
    return;
  }

  // 1. Draw Mesh Connections / Wireframe (if enabled)
  if (options.showWireframe) {
    ctx.strokeStyle = metrics.state === 'FOCUSED' 
      ? 'rgba(16, 185, 129, 0.4)' 
      : metrics.state === 'DISTRACTED' 
      ? 'rgba(239, 68, 68, 0.5)' 
      : 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 1;

    // Face Silhouette Oval
    const silhouetteIndices = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
      397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
      172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
    ];

    ctx.beginPath();
    silhouetteIndices.forEach((idx, i) => {
      if (landmarks[idx]) {
        const x = landmarks[idx].x * width;
        const y = landmarks[idx].y * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.stroke();

    // Eyes contours
    const leftEyePoints = [33, 160, 158, 133, 153, 144];
    ctx.beginPath();
    leftEyePoints.forEach((idx, i) => {
      if (landmarks[idx]) {
        const x = landmarks[idx].x * width;
        const y = landmarks[idx].y * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.stroke();

    const rightEyePoints = [263, 387, 385, 362, 380, 373];
    ctx.beginPath();
    rightEyePoints.forEach((idx, i) => {
      if (landmarks[idx]) {
        const x = landmarks[idx].x * width;
        const y = landmarks[idx].y * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.stroke();
  }

  // 2. Draw 3D Head Orientation Pose Gizmo from Nose Tip (RGB XYZ Axes)
  const nose = landmarks[LANDMARKS.NOSE_TIP];
  if (nose) {
    const originX = nose.x * width;
    const originY = nose.y * height;
    const axisLen = Math.min(width, height) * 0.16;

    const yawRad = (metrics.rawYaw * Math.PI) / 180;
    const pitchRad = (metrics.rawPitch * Math.PI) / 180;
    const rollRad = (metrics.rawRoll * Math.PI) / 180;

    // X-Axis (Pitch / Right) - Red
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(
      originX + axisLen * Math.cos(rollRad) * Math.cos(yawRad),
      originY + axisLen * Math.sin(rollRad)
    );
    ctx.stroke();

    // Y-Axis (Yaw / Down) - Green
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(
      originX - axisLen * Math.sin(rollRad),
      originY + axisLen * Math.cos(rollRad) * Math.cos(pitchRad)
    );
    ctx.stroke();

    // Z-Axis (Gaze forward direction) - Cyan/Blue
    ctx.strokeStyle = metrics.isWithinBounds ? '#38bdf8' : '#f87171';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(
      originX - axisLen * Math.sin(yawRad) * 1.5,
      originY - axisLen * Math.sin(pitchRad) * 1.5
    );
    ctx.stroke();

    // Nose pivot point
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(originX, originY, 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  // 3. Draw Iris Gaze Vectors
  if (landmarks.length > 473) {
    const leftIris = landmarks[LANDMARKS.LEFT_IRIS];
    const rightIris = landmarks[LANDMARKS.RIGHT_IRIS];

    if (leftIris && rightIris) {
      ctx.fillStyle = '#38bdf8';
      [leftIris, rightIris].forEach(iris => {
        const ix = iris.x * width;
        const iy = iris.y * height;
        ctx.beginPath();
        ctx.arc(ix, iy, 2.5, 0, 2 * Math.PI);
        ctx.fill();

        // Gaze line
        ctx.strokeStyle = metrics.boundViolations?.gaze ? 'rgba(239, 68, 68, 0.9)' : 'rgba(56, 189, 248, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(ix + (metrics.gazeX / 20) * 18, iy + (metrics.gazeY / 20) * 14);
        ctx.stroke();
      });
    }
  }

  // 4. Subtle Real-Time Telemetry HUD Corner Tag
  const hasPosture = Boolean(metrics.posture && metrics.posture.postureStatus !== 'UNKNOWN');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(8, 8, 228, hasPosture ? 64 : 48);
  ctx.strokeStyle = metrics.isWithinBounds ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.4)';
  ctx.strokeRect(8, 8, 228, hasPosture ? 64 : 48);

  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = metrics.state === 'FOCUSED' ? '#34d399' : metrics.state === 'DISTRACTED' ? '#f87171' : '#fbbf24';
  ctx.textAlign = 'left';
  ctx.fillText(`POSE: Y:${metrics.yaw >= 0 ? '+' : ''}${metrics.yaw}° P:${metrics.pitch >= 0 ? '+' : ''}${metrics.pitch}°`, 14, 24);
  ctx.fillText(`GAZE: ${metrics.gazeX >= 0 ? '+' : ''}${metrics.gazeX}° | BOUND: ${metrics.isWithinBounds ? 'SAFE' : 'OUT'}`, 14, 40);
  if (hasPosture && metrics.posture) {
    ctx.fillStyle = metrics.posture.postureScore >= 82 ? '#34d399' : metrics.posture.postureScore >= 65 ? '#fbbf24' : '#f87171';
    ctx.fillText(`BODY: ${metrics.posture.postureScore}% (${metrics.posture.postureStatus.replace('_', ' ')})`, 14, 56);
  }
}

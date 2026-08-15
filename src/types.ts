export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

export type SessionLifecycleState = 
  | 'IDLE' 
  | 'STARTING' 
  | 'ACTIVE' 
  | 'PAUSED' 
  | 'RESUMED' 
  | 'ENDED' 
  | 'CAMERA_UNAVAILABLE';

export type FocusState = 
  | 'IDLE' 
  | 'CALIBRATING' 
  | 'FOCUSED' 
  | 'DRIFTING' 
  | 'DISTRACTED' 
  | 'NO_FACE' 
  | 'PAUSED';

export interface FocusInterval {
  state: 'focused' | 'distracted' | 'away';
  startSecond: number;
  endSecond: number;
}

export interface DistractionDetail {
  id: string;
  secondInSession: number;
  startTimestamp: number;
  endTimestamp?: number;
  timestamp: number;
  reason: 'head_turned' | 'gaze_away' | 'face_missing' | 'posture_drift';
  reasonDescription?: string;
  durationSeconds: number;
}

export interface StudySession {
  id: string;
  userId: string;
  studentId?: string;
  studentName?: string;
  startTime: number;
  endTime: number;
  duration: number; // in seconds
  focusedTime: number; // in seconds
  distractionTime: number; // in seconds
  distractionCount: number;
  focusScore: number; // 0 - 100
  longestStreak: number; // in seconds
  subject: string;
  notes?: string;
  intervals: FocusInterval[];
  distractions: DistractionDetail[];
  cameraUnavailableSeconds?: number;
  aiSummary?: string;
}

export interface CalibrationData {
  baselineYaw: number;
  baselinePitch: number;
  baselineRoll: number;
  baselineGazeX: number;
  baselineGazeY: number;
  baselineFaceX?: number;
  baselineFaceY?: number;
  baselineFaceScale: number;
  isCalibrated: boolean;
  calibratedAt?: string;
}

export type SensitivityPreset = 'relaxed' | 'normal' | 'strict' | 'custom';

export interface FocusBoundaries {
  yawLimit: number; // ± degrees (e.g., 20)
  pitchLimit: number; // ± degrees (e.g., 15)
  gazeLimit: number; // ± degrees (e.g., 20)
  facePosTolerance: number; // ± % position tolerance (e.g., 25)
  distractionDelay: number; // seconds before sustained distraction (e.g., 5)
  outOfFocusBoundaryEnabled: boolean;
}

export interface StudentProfile {
  id: string;
  name: string;
  avatarColor?: string;
  // Personal baseline
  baselineYaw: number;
  baselinePitch: number;
  baselineRoll: number;
  baselineGazeX: number;
  baselineGazeY: number;
  baselineFaceX: number;
  baselineFaceY: number;
  baselineFaceScale: number;
  isCalibrated: boolean;
  calibratedAt?: string;
  // Custom detection limits
  yawLimit: number; // e.g. 20°
  pitchLimit: number; // e.g. 15°
  gazeLimit: number; // e.g. 20°
  facePosTolerance: number; // e.g. 25%
  distractionDelay: number; // e.g. 5s
  preset: SensitivityPreset;
  outOfFocusBoundaryEnabled: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  distractionThreshold: number; // 3, 5, 10, 15
  notificationCooldown: number; // 30, 60, 120
  sensitivity: 'low' | 'medium' | 'high';
  cameraPreview: boolean;
  wireframeOverlay: boolean;
  audioAlerts: boolean;
  browserNotifications: boolean;
  dailyGoalMinutes: number;
  simulationMode: boolean;
}

export interface BoundViolations {
  yaw: boolean;
  pitch: boolean;
  gaze: boolean;
  facePos: boolean;
  noFace: boolean;
}

export interface TrackerMetrics {
  faceDetected: boolean;
  // Raw orientation
  rawYaw: number;
  rawPitch: number;
  rawRoll: number;
  rawGazeX: number;
  rawGazeY: number;
  rawFaceX: number;
  rawFaceY: number;
  // Relative to baseline
  yaw: number; // degrees
  pitch: number; // degrees
  roll: number; // degrees
  gazeX: number; // degrees
  gazeY: number; // degrees
  faceX: number;
  faceY: number;
  leftEyeEAR: number;
  rightEyeEAR: number;
  isBlinking: boolean;
  distractionSeconds: number;
  state: FocusState;
  fps: number;
  confidence: number;
  // Boundary calculations
  isWithinBounds: boolean;
  boundViolations: BoundViolations;
  allowedYawRange: [number, number];
  allowedPitchRange: [number, number];
  allowedGazeRange: [number, number];
  lastDistractionReason?: string;
}


import { StudySession, StudentProfile, DistractionDetail, FocusInterval, SessionLifecycleState, TrackerMetrics } from '../types';

export interface ActiveSessionStorageData {
  userId: string;
  sessionId: string;
  lifecycleState: SessionLifecycleState;
  subject: string;
  studentId: string;
  studentName: string;
  sessionStartTimestamp: number;
  pauseStartTimestamp: number;
  totalPausedMs: number;
  lastHeartbeatTimestamp: number;
  focusedSeconds: number;
  distractionSeconds: number;
  distractionCount: number;
  longestStreak: number;
  currentStreak: number;
  intervals: FocusInterval[];
  distractions: DistractionDetail[];
  notes?: string;
  cameraUnavailableSeconds: number;
  lastCameraAvailabilityCheck: number;
}

const STORAGE_KEY_PREFIX = 'studyfocus_active_session_';

/**
 * Returns storage key for a user's active session
 */
export function getActiveSessionStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

/**
 * Persists live active study session state to localStorage
 */
export function saveActiveSessionState(data: ActiveSessionStorageData): void {
  try {
    if (!data.userId) return;
    localStorage.setItem(getActiveSessionStorageKey(data.userId), JSON.stringify(data));
  } catch (err) {
    console.debug('Failed to save active session state to localStorage:', err);
  }
}

/**
 * Loads any active or interrupted study session state for a user
 */
export function loadActiveSessionState(userId: string): ActiveSessionStorageData | null {
  try {
    if (!userId) return null;
    const raw = localStorage.getItem(getActiveSessionStorageKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSessionStorageData;
  } catch (err) {
    console.debug('Failed to load active session state:', err);
    return null;
  }
}

/**
 * Clears active session state from localStorage upon graceful completion or discard
 */
export function clearActiveSessionState(userId: string): void {
  try {
    if (!userId) return;
    localStorage.removeItem(getActiveSessionStorageKey(userId));
  } catch (err) {
    console.debug('Failed to clear active session state:', err);
  }
}

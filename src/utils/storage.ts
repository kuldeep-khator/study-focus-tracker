import { AppSettings, CalibrationData, StudentProfile, StudySession, SensitivityPreset, User } from '../types';

const GLOBAL_STORAGE_KEYS = {
  USERS: 'study_focus_users_v2',
  CURRENT_USER_ID: 'study_focus_current_user_id_v2',
};

function getUserStorageKey(userId: string, keyName: string): string {
  return `study_focus_u_${userId}_${keyName}_v2`;
}

export const PRESET_CONFIGS: Record<Exclude<SensitivityPreset, 'custom'>, {
  yawLimit: number;
  pitchLimit: number;
  gazeLimit: number;
  facePosTolerance: number;
  distractionDelay: number;
}> = {
  relaxed: {
    yawLimit: 28,
    pitchLimit: 22,
    gazeLimit: 25,
    facePosTolerance: 35,
    distractionDelay: 6,
  },
  normal: {
    yawLimit: 20,
    pitchLimit: 15,
    gazeLimit: 20,
    facePosTolerance: 25,
    distractionDelay: 5,
  },
  strict: {
    yawLimit: 14,
    pitchLimit: 10,
    gazeLimit: 12,
    facePosTolerance: 15,
    distractionDelay: 3,
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  distractionThreshold: 5, // 5s look-away tolerance
  notificationCooldown: 45, // 45s between notifications
  sensitivity: 'medium',
  cameraPreview: true,
  wireframeOverlay: true,
  audioAlerts: true,
  browserNotifications: true,
  dailyGoalMinutes: 45,
  simulationMode: false,
};

export const DEFAULT_CALIBRATION: CalibrationData = {
  baselineYaw: 0,
  baselinePitch: 0,
  baselineRoll: 0,
  baselineGazeX: 0,
  baselineGazeY: 0,
  baselineFaceX: 0.5,
  baselineFaceY: 0.5,
  baselineFaceScale: 1.0,
  isCalibrated: false,
};

export function getDefaultProfilesForUser(user: { id: string; name: string }): StudentProfile[] {
  return [
    {
      id: `profile-${user.id}-primary`,
      name: user.name || 'Student Profile',
      avatarColor: '#4f46e5',
      baselineYaw: 0,
      baselinePitch: 0,
      baselineRoll: 0,
      baselineGazeX: 0,
      baselineGazeY: 0,
      baselineFaceX: 0.5,
      baselineFaceY: 0.5,
      baselineFaceScale: 1.0,
      isCalibrated: false,
      yawLimit: 20,
      pitchLimit: 15,
      gazeLimit: 20,
      facePosTolerance: 25,
      distractionDelay: 5,
      preset: 'normal',
      outOfFocusBoundaryEnabled: true,
      notes: 'Primary study position',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}

// ----------------------------------------------------
// USER AUTHENTICATION & MULTI-TENANT STORAGE ENGINE
// ----------------------------------------------------

export function getRegisteredUsers(): User[] {
  try {
    const raw = localStorage.getItem(GLOBAL_STORAGE_KEYS.USERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to parse registered users', e);
  }
  return [];
}

export function saveRegisteredUsers(users: User[]): void {
  try {
    localStorage.setItem(GLOBAL_STORAGE_KEYS.USERS, JSON.stringify(users));
  } catch (e) {
    console.error('Failed to save users', e);
  }
}

export function getCurrentUser(): User | null {
  try {
    const currentId = localStorage.getItem(GLOBAL_STORAGE_KEYS.CURRENT_USER_ID);
    if (!currentId) return null;
    const users = getRegisteredUsers();
    return users.find(u => u.id === currentId) || null;
  } catch (e) {
    console.error('Failed to get current user', e);
    return null;
  }
}

export function setCurrentUserId(userId: string | null): void {
  try {
    if (userId) {
      localStorage.setItem(GLOBAL_STORAGE_KEYS.CURRENT_USER_ID, userId);
    } else {
      localStorage.removeItem(GLOBAL_STORAGE_KEYS.CURRENT_USER_ID);
    }
  } catch (e) {
    console.error('Failed to set current user ID', e);
  }
}

export function registerUser(name: string, email: string, password: string): { success: boolean; user?: User; error?: string } {
  const normalizedEmail = email.trim().toLowerCase();
  if (!name.trim()) return { success: false, error: 'Full name is required.' };
  if (!normalizedEmail || !normalizedEmail.includes('@')) return { success: false, error: 'A valid email address is required.' };
  if (!password || password.length < 6) return { success: false, error: 'Password must be at least 6 characters long.' };

  const users = getRegisteredUsers();
  const existing = users.find(u => u.email.toLowerCase() === normalizedEmail);
  if (existing) {
    return { success: false, error: 'An account with this email already exists. Please log in instead.' };
  }

  const newUser: User = {
    id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: btoa(password), // simple client-safe encoding for local storage isolation
    createdAt: Date.now(),
  };

  const updatedUsers = [...users, newUser];
  saveRegisteredUsers(updatedUsers);
  setCurrentUserId(newUser.id);

  // Initialize initial user configuration
  const defaultProfiles = getDefaultProfilesForUser(newUser);
  saveStoredStudentProfiles(defaultProfiles, newUser.id);
  saveStoredActiveStudentId(defaultProfiles[0].id, newUser.id);
  saveStoredSettings(DEFAULT_SETTINGS, newUser.id);
  saveStoredCalibration(DEFAULT_CALIBRATION, newUser.id);
  saveStoredSessions([], newUser.id);

  return { success: true, user: newUser };
}

export function loginUser(email: string, password: string): { success: boolean; user?: User; error?: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const users = getRegisteredUsers();
  const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

  if (!user) {
    return { success: false, error: 'No account found with this email address.' };
  }

  if (user.passwordHash !== btoa(password)) {
    return { success: false, error: 'Incorrect password. Please verify and try again.' };
  }

  setCurrentUserId(user.id);
  return { success: true, user };
}

export function resetUserPassword(email: string, newPassword: string): { success: boolean; error?: string } {
  const normalizedEmail = email.trim().toLowerCase();
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters long.' };
  }

  const users = getRegisteredUsers();
  const userIndex = users.findIndex(u => u.email.toLowerCase() === normalizedEmail);

  if (userIndex === -1) {
    return { success: false, error: 'No account found with this email address.' };
  }

  users[userIndex].passwordHash = btoa(newPassword);
  saveRegisteredUsers(users);
  return { success: true };
}

export function logoutUser(): void {
  setCurrentUserId(null);
}

// ----------------------------------------------------
// USER-SCOPED STORAGE ACCESSORS
// ----------------------------------------------------

function resolveUserId(explicitUserId?: string): string {
  if (explicitUserId) return explicitUserId;
  const current = getCurrentUser();
  return current ? current.id : 'guest';
}

export function getStoredStudentProfiles(userId?: string): StudentProfile[] {
  const uid = resolveUserId(userId);
  try {
    const raw = localStorage.getItem(getUserStorageKey(uid, 'profiles'));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to read student profiles from storage', e);
  }
  const user = getCurrentUser();
  const defaults = getDefaultProfilesForUser(user || { id: uid, name: 'Student' });
  saveStoredStudentProfiles(defaults, uid);
  return defaults;
}

export function saveStoredStudentProfiles(profiles: StudentProfile[], userId?: string): void {
  const uid = resolveUserId(userId);
  try {
    localStorage.setItem(getUserStorageKey(uid, 'profiles'), JSON.stringify(profiles));
  } catch (e) {
    console.error('Failed to save student profiles to storage', e);
  }
}

export function getStoredActiveStudentId(userId?: string): string {
  const uid = resolveUserId(userId);
  try {
    const id = localStorage.getItem(getUserStorageKey(uid, 'active_student'));
    if (id) return id;
  } catch (e) {
    console.error('Failed to read active student ID from storage', e);
  }
  const profiles = getStoredStudentProfiles(uid);
  return profiles[0]?.id || `profile-${uid}-primary`;
}

export function saveStoredActiveStudentId(id: string, userId?: string): void {
  const uid = resolveUserId(userId);
  try {
    localStorage.setItem(getUserStorageKey(uid, 'active_student'), id);
  } catch (e) {
    console.error('Failed to save active student ID to storage', e);
  }
}

export function getStoredSettings(userId?: string): AppSettings {
  const uid = resolveUserId(userId);
  try {
    const raw = localStorage.getItem(getUserStorageKey(uid, 'settings'));
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to read settings from storage', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveStoredSettings(settings: AppSettings, userId?: string): void {
  const uid = resolveUserId(userId);
  try {
    localStorage.setItem(getUserStorageKey(uid, 'settings'), JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings to storage', e);
  }
}

export function getStoredCalibration(userId?: string): CalibrationData {
  const uid = resolveUserId(userId);
  try {
    const raw = localStorage.getItem(getUserStorageKey(uid, 'calibration'));
    if (raw) {
      return { ...DEFAULT_CALIBRATION, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to read calibration from storage', e);
  }
  return DEFAULT_CALIBRATION;
}

export function saveStoredCalibration(calib: CalibrationData, userId?: string): void {
  const uid = resolveUserId(userId);
  try {
    localStorage.setItem(getUserStorageKey(uid, 'calibration'), JSON.stringify(calib));
  } catch (e) {
    console.error('Failed to save calibration to storage', e);
  }
}

export function getStoredSessions(userId?: string): StudySession[] {
  const uid = resolveUserId(userId);
  try {
    const raw = localStorage.getItem(getUserStorageKey(uid, 'sessions'));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to read sessions from storage', e);
  }
  // ZERO FAKE DATA: Return empty array for authentic user tracking
  return [];
}

export function saveStoredSessions(sessions: StudySession[], userId?: string): void {
  const uid = resolveUserId(userId);
  try {
    localStorage.setItem(getUserStorageKey(uid, 'sessions'), JSON.stringify(sessions));
  } catch (e) {
    console.error('Failed to save sessions to storage', e);
  }
}

export function addStudySession(session: StudySession, userId?: string): StudySession[] {
  const uid = resolveUserId(userId);
  const current = getStoredSessions(uid);
  const updated = [{ ...session, userId: uid }, ...current];
  saveStoredSessions(updated, uid);
  return updated;
}

export function deleteStudySession(id: string, userId?: string): StudySession[] {
  const uid = resolveUserId(userId);
  const current = getStoredSessions(uid);
  const updated = current.filter(s => s.id !== id);
  saveStoredSessions(updated, uid);
  return updated;
}

export function clearAllUserSessions(userId?: string): void {
  const uid = resolveUserId(userId);
  try {
    localStorage.removeItem(getUserStorageKey(uid, 'sessions'));
  } catch (e) {
    console.error('Failed to clear sessions', e);
  }
}

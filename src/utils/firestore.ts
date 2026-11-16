import { db, auth } from "../lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  writeBatch
} from "firebase/firestore";
import { AppSettings, CalibrationData, StudentProfile, StudySession, User } from "../types";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively removes keys with `undefined` values so Firestore setDoc() never
 * rejects payloads with "Unsupported field value: undefined".
 */
function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = sanitizeForFirestore(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

/**
 * 1. User Profile Operations (Firestore: users/{uid})
 */
export async function createFirestoreUserProfile(uid: string, profile: {
  name: string;
  email: string;
  emailVerified: boolean;
}): Promise<void> {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, "users", uid);
    const now = Date.now();
    await setDoc(userRef, sanitizeForFirestore({
      uid,
      name: profile.name,
      email: profile.email,
      emailVerified: profile.emailVerified,
      createdAt: now,
      profileCreatedAt: new Date().toISOString(),
      lastLoginAt: now,
    }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getFirestoreUserProfile(uid: string): Promise<User | null> {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        id: uid,
        name: data.name || "Student",
        email: data.email || "",
        createdAt: data.createdAt || Date.now(),
        lastLoginAt: data.lastLoginAt || Date.now(),
      };
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("permission")) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.error("Error getting user profile from Firestore:", error);
    return null;
  }
}

export async function updateFirestoreUserVerification(uid: string, verified: boolean): Promise<void> {
  const path = `users/${uid}`;
  try {
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, sanitizeForFirestore({
      emailVerified: verified,
      lastLoginAt: Date.now(),
    }), { merge: true });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("permission")) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    console.error("Error updating user verification in Firestore:", error);
  }
}

/**
 * 2. Student Profiles Operations (Firestore: users/{uid}/studentProfiles/{profileId})
 */
export async function getFirestoreStudentProfiles(uid: string): Promise<StudentProfile[]> {
  const path = `users/${uid}/studentProfiles`;
  try {
    const profilesCol = collection(db, "users", uid, "studentProfiles");
    const snap = await getDocs(profilesCol);
    if (snap.empty) {
      return [];
    }
    return snap.docs.map(doc => doc.data() as StudentProfile);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("permission")) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
    console.error("Error getting student profiles from Firestore:", error);
    return [];
  }
}

export async function saveFirestoreStudentProfile(uid: string, profile: StudentProfile): Promise<void> {
  const path = `users/${uid}/studentProfiles/${profile.id}`;
  try {
    const profileRef = doc(db, "users", uid, "studentProfiles", profile.id);
    await setDoc(profileRef, sanitizeForFirestore({
      ...profile,
      updatedAt: Date.now(),
    }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFirestoreStudentProfile(uid: string, profileId: string): Promise<void> {
  const path = `users/${uid}/studentProfiles/${profileId}`;
  try {
    const profileRef = doc(db, "users", uid, "studentProfiles", profileId);
    await deleteDoc(profileRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * 3. Settings Operations (Firestore: users/{uid}/settings/preferences)
 */
export async function getFirestoreSettings(uid: string): Promise<AppSettings | null> {
  const path = `users/${uid}/settings/preferences`;
  try {
    const settingsRef = doc(db, "users", uid, "settings", "preferences");
    const snap = await getDoc(settingsRef);
    if (snap.exists()) {
      return snap.data() as AppSettings;
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("permission")) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.error("Error getting settings from Firestore:", error);
    return null;
  }
}

export async function saveFirestoreSettings(uid: string, settings: AppSettings): Promise<void> {
  const path = `users/${uid}/settings/preferences`;
  try {
    const settingsRef = doc(db, "users", uid, "settings", "preferences");
    await setDoc(settingsRef, sanitizeForFirestore(settings), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * 4. Calibration Operations (Firestore: users/{uid}/calibration/baseline)
 */
export async function getFirestoreCalibration(uid: string): Promise<CalibrationData | null> {
  const path = `users/${uid}/calibration/baseline`;
  try {
    const calibRef = doc(db, "users", uid, "calibration", "baseline");
    const snap = await getDoc(calibRef);
    if (snap.exists()) {
      return snap.data() as CalibrationData;
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("permission")) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.error("Error getting calibration from Firestore:", error);
    return null;
  }
}

export async function saveFirestoreCalibration(uid: string, calib: CalibrationData): Promise<void> {
  const path = `users/${uid}/calibration/baseline`;
  try {
    const calibRef = doc(db, "users", uid, "calibration", "baseline");
    await setDoc(calibRef, sanitizeForFirestore(calib), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * 5. Study Sessions Operations (Firestore: users/{uid}/studySessions/{sessionId})
 */
export async function getFirestoreStudySessions(uid: string): Promise<StudySession[]> {
  const path = `users/${uid}/studySessions`;
  try {
    const sessionsCol = collection(db, "users", uid, "studySessions");
    const q = query(sessionsCol, orderBy("startTime", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as StudySession);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("permission")) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
    console.error("Error getting study sessions from Firestore:", error);
    return [];
  }
}

export async function saveFirestoreStudySession(uid: string, session: StudySession): Promise<void> {
  const path = `users/${uid}/studySessions/${session.id}`;
  try {
    const sessionRef = doc(db, "users", uid, "studySessions", session.id);
    await setDoc(sessionRef, sanitizeForFirestore({
      ...session,
      userId: uid,
    }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFirestoreStudySession(uid: string, sessionId: string): Promise<void> {
  const path = `users/${uid}/studySessions/${sessionId}`;
  try {
    const sessionRef = doc(db, "users", uid, "studySessions", sessionId);
    await deleteDoc(sessionRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearAllFirestoreStudySessions(uid: string): Promise<void> {
  const path = `users/${uid}/studySessions`;
  try {
    const sessionsCol = collection(db, "users", uid, "studySessions");
    const snap = await getDocs(sessionsCol);
    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

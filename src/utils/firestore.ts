import { db } from "../lib/firebase";
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

/**
 * 1. User Profile Operations (Firestore: users/{uid})
 */
export async function createFirestoreUserProfile(uid: string, profile: {
  name: string;
  email: string;
  emailVerified: boolean;
}): Promise<void> {
  const userRef = doc(db, "users", uid);
  const now = Date.now();
  await setDoc(userRef, {
    uid,
    name: profile.name,
    email: profile.email,
    emailVerified: profile.emailVerified,
    createdAt: now,
    profileCreatedAt: new Date().toISOString(),
    lastLoginAt: now,
  }, { merge: true });
}

export async function getFirestoreUserProfile(uid: string): Promise<User | null> {
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
    console.error("Error getting user profile from Firestore:", error);
    return null;
  }
}

export async function updateFirestoreUserVerification(uid: string, verified: boolean): Promise<void> {
  try {
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
      emailVerified: verified,
      lastLoginAt: Date.now(),
    }, { merge: true });
  } catch (error) {
    console.error("Error updating user verification in Firestore:", error);
  }
}

/**
 * 2. Student Profiles Operations (Firestore: users/{uid}/studentProfiles/{profileId})
 */
export async function getFirestoreStudentProfiles(uid: string): Promise<StudentProfile[]> {
  try {
    const profilesCol = collection(db, "users", uid, "studentProfiles");
    const snap = await getDocs(profilesCol);
    if (snap.empty) {
      return [];
    }
    return snap.docs.map(doc => doc.data() as StudentProfile);
  } catch (error) {
    console.error("Error getting student profiles from Firestore:", error);
    return [];
  }
}

export async function saveFirestoreStudentProfile(uid: string, profile: StudentProfile): Promise<void> {
  try {
    const profileRef = doc(db, "users", uid, "studentProfiles", profile.id);
    await setDoc(profileRef, {
      ...profile,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (error) {
    console.error("Error saving student profile to Firestore:", error);
    throw error;
  }
}

export async function deleteFirestoreStudentProfile(uid: string, profileId: string): Promise<void> {
  try {
    const profileRef = doc(db, "users", uid, "studentProfiles", profileId);
    await deleteDoc(profileRef);
  } catch (error) {
    console.error("Error deleting student profile from Firestore:", error);
    throw error;
  }
}

/**
 * 3. Settings Operations (Firestore: users/{uid}/settings/preferences)
 */
export async function getFirestoreSettings(uid: string): Promise<AppSettings | null> {
  try {
    const settingsRef = doc(db, "users", uid, "settings", "preferences");
    const snap = await getDoc(settingsRef);
    if (snap.exists()) {
      return snap.data() as AppSettings;
    }
    return null;
  } catch (error) {
    console.error("Error getting settings from Firestore:", error);
    return null;
  }
}

export async function saveFirestoreSettings(uid: string, settings: AppSettings): Promise<void> {
  try {
    const settingsRef = doc(db, "users", uid, "settings", "preferences");
    await setDoc(settingsRef, settings, { merge: true });
  } catch (error) {
    console.error("Error saving settings to Firestore:", error);
    throw error;
  }
}

/**
 * 4. Calibration Operations (Firestore: users/{uid}/calibration/baseline)
 */
export async function getFirestoreCalibration(uid: string): Promise<CalibrationData | null> {
  try {
    const calibRef = doc(db, "users", uid, "calibration", "baseline");
    const snap = await getDoc(calibRef);
    if (snap.exists()) {
      return snap.data() as CalibrationData;
    }
    return null;
  } catch (error) {
    console.error("Error getting calibration from Firestore:", error);
    return null;
  }
}

export async function saveFirestoreCalibration(uid: string, calib: CalibrationData): Promise<void> {
  try {
    const calibRef = doc(db, "users", uid, "calibration", "baseline");
    await setDoc(calibRef, calib, { merge: true });
  } catch (error) {
    console.error("Error saving calibration to Firestore:", error);
    throw error;
  }
}

/**
 * 5. Study Sessions Operations (Firestore: users/{uid}/studySessions/{sessionId})
 */
export async function getFirestoreStudySessions(uid: string): Promise<StudySession[]> {
  try {
    const sessionsCol = collection(db, "users", uid, "studySessions");
    const q = query(sessionsCol, orderBy("startTime", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as StudySession);
  } catch (error) {
    console.error("Error getting study sessions from Firestore:", error);
    return [];
  }
}

export async function saveFirestoreStudySession(uid: string, session: StudySession): Promise<void> {
  try {
    const sessionRef = doc(db, "users", uid, "studySessions", session.id);
    await setDoc(sessionRef, {
      ...session,
      userId: uid,
    }, { merge: true });
  } catch (error) {
    console.error("Error saving study session to Firestore:", error);
    throw error;
  }
}

export async function deleteFirestoreStudySession(uid: string, sessionId: string): Promise<void> {
  try {
    const sessionRef = doc(db, "users", uid, "studySessions", sessionId);
    await deleteDoc(sessionRef);
  } catch (error) {
    console.error("Error deleting study session from Firestore:", error);
    throw error;
  }
}

export async function clearAllFirestoreStudySessions(uid: string): Promise<void> {
  try {
    const sessionsCol = collection(db, "users", uid, "studySessions");
    const snap = await getDocs(sessionsCol);
    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    console.error("Error clearing all study sessions in Firestore:", error);
    throw error;
  }
}

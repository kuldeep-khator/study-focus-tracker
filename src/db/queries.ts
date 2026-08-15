import { db } from "./index.ts";
import { users, studentProfiles, studySessions, userSettings } from "./schema.ts";
import { eq, desc, and } from "drizzle-orm";

// 1. Users Queries
export async function getOrCreateUser(uid: string, email: string, name?: string) {
  try {
    const existing = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    const now = Date.now();

    if (existing.length > 0) {
      await db.update(users).set({
        lastLoginAt: now,
        name: name || existing[0].name,
      }).where(eq(users.id, uid));
      return existing[0];
    }

    const [newUser] = await db.insert(users).values({
      id: uid,
      email: email || `${uid}@studyaid.app`,
      name: name || "Student",
      passwordHash: "oauth-managed",
      createdAt: now,
      lastLoginAt: now,
    }).returning();

    // Create default student profile for new user
    await db.insert(studentProfiles).values({
      id: `profile-${uid}-primary`,
      userId: uid,
      name: name || "Student Profile",
      avatarColor: "#4f46e5",
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
      preset: "normal",
      outOfFocusBoundaryEnabled: true,
      createdAt: now,
      updatedAt: now,
    });

    // Create default settings for user
    await db.insert(userSettings).values({
      userId: uid,
      audioAlerts: true,
      alertVolume: 0.7,
      visualBannerAlerts: true,
      autoPauseOnNoFace: true,
      soundType: "gentle-chime",
      selectedCameraId: "",
      mirrorCamera: true,
      showFaceMeshOverlay: true,
      theme: "light",
      pomodoroWorkDuration: 25,
      pomodoroBreakDuration: 5,
      updatedAt: now,
    });

    return newUser;
  } catch (error) {
    console.error("Database user operation failed:", error);
    throw new Error("Failed to authenticate or fetch user profile.", { cause: error });
  }
}

// 2. Student Profiles Queries
export async function getStudentProfiles(userId: string) {
  try {
    return await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId));
  } catch (error) {
    console.error("Database getStudentProfiles failed:", error);
    throw new Error("Failed to load student profiles.", { cause: error });
  }
}

export async function upsertStudentProfile(userId: string, profile: any) {
  try {
    const existing = await db.select().from(studentProfiles).where(
      and(eq(studentProfiles.id, profile.id), eq(studentProfiles.userId, userId))
    ).limit(1);

    const now = Date.now();
    if (existing.length > 0) {
      const [updated] = await db.update(studentProfiles).set({
        name: profile.name,
        avatarColor: profile.avatarColor || "#4f46e5",
        baselineYaw: profile.baselineYaw ?? 0,
        baselinePitch: profile.baselinePitch ?? 0,
        baselineRoll: profile.baselineRoll ?? 0,
        baselineGazeX: profile.baselineGazeX ?? 0,
        baselineGazeY: profile.baselineGazeY ?? 0,
        baselineFaceX: profile.baselineFaceX ?? 0.5,
        baselineFaceY: profile.baselineFaceY ?? 0.5,
        baselineFaceScale: profile.baselineFaceScale ?? 1.0,
        isCalibrated: Boolean(profile.isCalibrated),
        calibratedAt: profile.calibratedAt || null,
        yawLimit: profile.yawLimit ?? 20,
        pitchLimit: profile.pitchLimit ?? 15,
        gazeLimit: profile.gazeLimit ?? 20,
        facePosTolerance: profile.facePosTolerance ?? 25,
        distractionDelay: profile.distractionDelay ?? 5,
        preset: profile.preset || "normal",
        outOfFocusBoundaryEnabled: profile.outOfFocusBoundaryEnabled !== false,
        updatedAt: now,
      }).where(eq(studentProfiles.id, profile.id)).returning();
      return updated;
    } else {
      const [inserted] = await db.insert(studentProfiles).values({
        id: profile.id,
        userId: userId,
        name: profile.name || "Student Profile",
        avatarColor: profile.avatarColor || "#4f46e5",
        baselineYaw: profile.baselineYaw ?? 0,
        baselinePitch: profile.baselinePitch ?? 0,
        baselineRoll: profile.baselineRoll ?? 0,
        baselineGazeX: profile.baselineGazeX ?? 0,
        baselineGazeY: profile.baselineGazeY ?? 0,
        baselineFaceX: profile.baselineFaceX ?? 0.5,
        baselineFaceY: profile.baselineFaceY ?? 0.5,
        baselineFaceScale: profile.baselineFaceScale ?? 1.0,
        isCalibrated: Boolean(profile.isCalibrated),
        calibratedAt: profile.calibratedAt || null,
        yawLimit: profile.yawLimit ?? 20,
        pitchLimit: profile.pitchLimit ?? 15,
        gazeLimit: profile.gazeLimit ?? 20,
        facePosTolerance: profile.facePosTolerance ?? 25,
        distractionDelay: profile.distractionDelay ?? 5,
        preset: profile.preset || "normal",
        outOfFocusBoundaryEnabled: profile.outOfFocusBoundaryEnabled !== false,
        createdAt: now,
        updatedAt: now,
      }).returning();
      return inserted;
    }
  } catch (error) {
    console.error("Database upsertStudentProfile failed:", error);
    throw new Error("Failed to save student profile.", { cause: error });
  }
}

export async function deleteStudentProfileDb(userId: string, profileId: string) {
  try {
    await db.delete(studentProfiles).where(
      and(eq(studentProfiles.id, profileId), eq(studentProfiles.userId, userId))
    );
    return true;
  } catch (error) {
    console.error("Database deleteStudentProfileDb failed:", error);
    throw new Error("Failed to delete student profile.", { cause: error });
  }
}

// 3. Study Sessions Queries
export async function getStudySessions(userId: string) {
  try {
    return await db.select().from(studySessions).where(eq(studySessions.userId, userId)).orderBy(desc(studySessions.startTime));
  } catch (error) {
    console.error("Database getStudySessions failed:", error);
    throw new Error("Failed to load study sessions.", { cause: error });
  }
}

export async function saveStudySessionDb(userId: string, session: any) {
  try {
    const existing = await db.select().from(studySessions).where(
      and(eq(studySessions.id, session.id), eq(studySessions.userId, userId))
    ).limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(studySessions).set({
        subject: session.subject || "General Study",
        notes: session.notes || "",
        aiSummary: session.aiSummary || null,
      }).where(eq(studySessions.id, session.id)).returning();
      return updated;
    }

    const [saved] = await db.insert(studySessions).values({
      id: session.id,
      userId: userId,
      studentId: session.studentId || null,
      subject: session.subject || "General Study",
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration || 0,
      focusedTime: session.focusedTime || 0,
      distractionTime: session.distractionTime || 0,
      distractionCount: session.distractionCount || 0,
      focusScore: session.focusScore || 0,
      longestStreak: session.longestStreak || 0,
      notes: session.notes || "",
      aiSummary: session.aiSummary || null,
      distractionEvents: session.distractionEvents || [],
      timeline: session.timeline || [],
      createdAt: session.createdAt || Date.now(),
    }).returning();
    return saved;
  } catch (error) {
    console.error("Database saveStudySessionDb failed:", error);
    throw new Error("Failed to save study session.", { cause: error });
  }
}

export async function deleteStudySessionDb(userId: string, sessionId: string) {
  try {
    await db.delete(studySessions).where(
      and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId))
    );
    return true;
  } catch (error) {
    console.error("Database deleteStudySessionDb failed:", error);
    throw new Error("Failed to delete study session.", { cause: error });
  }
}

export async function clearAllStudySessionsDb(userId: string) {
  try {
    await db.delete(studySessions).where(eq(studySessions.userId, userId));
    return true;
  } catch (error) {
    console.error("Database clearAllStudySessionsDb failed:", error);
    throw new Error("Failed to clear study sessions.", { cause: error });
  }
}

// 4. User Settings Queries
export async function getUserSettingsDb(userId: string) {
  try {
    const res = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    return res[0] || null;
  } catch (error) {
    console.error("Database getUserSettingsDb failed:", error);
    throw new Error("Failed to load user settings.", { cause: error });
  }
}

export async function updateUserSettingsDb(userId: string, settings: any) {
  try {
    const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    const now = Date.now();

    if (existing.length > 0) {
      const [updated] = await db.update(userSettings).set({
        audioAlerts: settings.audioAlerts !== false,
        alertVolume: settings.alertVolume ?? 0.7,
        visualBannerAlerts: settings.visualBannerAlerts !== false,
        autoPauseOnNoFace: settings.autoPauseOnNoFace !== false,
        soundType: settings.soundType || "gentle-chime",
        selectedCameraId: settings.selectedCameraId || "",
        mirrorCamera: settings.mirrorCamera !== false,
        showFaceMeshOverlay: settings.showFaceMeshOverlay !== false,
        theme: settings.theme || "light",
        pomodoroWorkDuration: settings.pomodoroWorkDuration || 25,
        pomodoroBreakDuration: settings.pomodoroBreakDuration || 5,
        updatedAt: now,
      }).where(eq(userSettings.userId, userId)).returning();
      return updated;
    } else {
      const [inserted] = await db.insert(userSettings).values({
        userId: userId,
        audioAlerts: settings.audioAlerts !== false,
        alertVolume: settings.alertVolume ?? 0.7,
        visualBannerAlerts: settings.visualBannerAlerts !== false,
        autoPauseOnNoFace: settings.autoPauseOnNoFace !== false,
        soundType: settings.soundType || "gentle-chime",
        selectedCameraId: settings.selectedCameraId || "",
        mirrorCamera: settings.mirrorCamera !== false,
        showFaceMeshOverlay: settings.showFaceMeshOverlay !== false,
        theme: settings.theme || "light",
        pomodoroWorkDuration: settings.pomodoroWorkDuration || 25,
        pomodoroBreakDuration: settings.pomodoroBreakDuration || 5,
        updatedAt: now,
      }).returning();
      return inserted;
    }
  } catch (error) {
    console.error("Database updateUserSettingsDb failed:", error);
    throw new Error("Failed to save settings.", { cause: error });
  }
}

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import {
  getOrCreateUser,
  getStudentProfiles,
  upsertStudentProfile,
  deleteStudentProfileDb,
  getStudySessions,
  saveStudySessionDb,
  deleteStudySessionDb,
  clearAllStudySessionsDb,
  getUserSettingsDb,
  updateUserSettingsDb,
} from "./src/db/queries.ts";

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API: Sync/Fetch authenticated user & initialize cloud record
  app.post("/api/auth/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || `${uid}@studyaid.app`;
      const name = req.body?.name || req.user!.name || "Student";
      const user = await getOrCreateUser(uid, email, name);
      res.json({ user });
    } catch (error: any) {
      console.error("Auth sync error:", error);
      res.status(500).json({ error: error.message || "Failed to sync user" });
    }
  });

  // API: Student Profiles
  app.get("/api/profiles", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const profiles = await getStudentProfiles(uid);
      res.json({ profiles });
    } catch (error: any) {
      console.error("Get profiles error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch profiles" });
    }
  });

  app.post("/api/profiles", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const profile = req.body;
      const saved = await upsertStudentProfile(uid, profile);
      res.json({ profile: saved });
    } catch (error: any) {
      console.error("Save profile error:", error);
      res.status(500).json({ error: error.message || "Failed to save profile" });
    }
  });

  app.delete("/api/profiles/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const profileId = req.params.id;
      await deleteStudentProfileDb(uid, profileId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete profile error:", error);
      res.status(500).json({ error: error.message || "Failed to delete profile" });
    }
  });

  // API: Study Sessions
  app.get("/api/sessions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const sessions = await getStudySessions(uid);
      res.json({ sessions });
    } catch (error: any) {
      console.error("Get sessions error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch study sessions" });
    }
  });

  app.post("/api/sessions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const session = req.body;
      const saved = await saveStudySessionDb(uid, session);
      res.json({ session: saved });
    } catch (error: any) {
      console.error("Save session error:", error);
      res.status(500).json({ error: error.message || "Failed to save study session" });
    }
  });

  app.delete("/api/sessions/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const sessionId = req.params.id;
      await deleteStudySessionDb(uid, sessionId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete session error:", error);
      res.status(500).json({ error: error.message || "Failed to delete study session" });
    }
  });

  app.delete("/api/sessions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      await clearAllStudySessionsDb(uid);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Clear sessions error:", error);
      res.status(500).json({ error: error.message || "Failed to clear study sessions" });
    }
  });

  // API: User Settings
  app.get("/api/settings", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const settings = await getUserSettingsDb(uid);
      res.json({ settings });
    } catch (error: any) {
      console.error("Get settings error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const settings = req.body;
      const saved = await updateUserSettingsDb(uid, settings);
      res.json({ settings: saved });
    } catch (error: any) {
      console.error("Save settings error:", error);
      res.status(500).json({ error: error.message || "Failed to save settings" });
    }
  });

  // API: AI Study Coach Analysis
  app.post("/api/ai/coach-advice", async (req, res) => {
    try {
      const { sessionStats, recentHistory } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          feedback: generateLocalCoachFeedback(sessionStats),
          source: "local-heuristic",
        });
      }

      const prompt = `You are an encouraging and thoughtful study habits coach for a student using a focus tracker.
Analyze their study session statistics:
- Study Duration: ${Math.round((sessionStats?.duration || 0) / 60)} minutes (${sessionStats?.duration || 0} seconds)
- Focused Time: ${Math.round((sessionStats?.focusedTime || 0) / 60)} minutes (${sessionStats?.focusedTime || 0} seconds)
- Distraction Time: ${Math.round((sessionStats?.distractionTime || 0) / 60)} minutes (${sessionStats?.distractionTime || 0} seconds)
- Focus Score: ${sessionStats?.focusScore || 0}%
- Distraction Events: ${sessionStats?.distractionCount || 0}
- Longest Focused Streak: ${Math.round((sessionStats?.longestStreak || 0) / 60)} minutes
- Upper Body Posture Score: ${typeof sessionStats?.avgPostureScore === "number" ? `${sessionStats.avgPostureScore}% (${sessionStats?.postureSummary || "Monitored"})` : "Not recorded"}
- Subject/Topic: ${sessionStats?.subject || "General Study"}

Recent sessions context: ${recentHistory ? JSON.stringify(recentHistory) : "First recorded session"}

Provide:
1. A warm 2-sentence celebration or gentle reflection on their focus ratio and upper body posture.
2. 2 concrete, bite-sized recommendations for their next session based on their specific distraction and posture patterns (e.g. Pomodoro intervals, desk ergonomics, eye-level screen height, shoulder alignment, or micro-breaks).
3. A motivational closing mantra. Keep it concise, friendly, and empowering. Avoid clichés or medical claims.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an empathetic, evidence-informed study coach for students. Be concise, warm, practical, and inspiring.",
          temperature: 0.7,
        },
      });

      res.json({
        feedback: response.text || generateLocalCoachFeedback(sessionStats),
        source: "gemini",
      });
    } catch (error) {
      console.error("Gemini Coach Error:", error);
      res.json({
        feedback: generateLocalCoachFeedback(req.body?.sessionStats),
        source: "local-heuristic-fallback",
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Study Focus Tracker server running on http://localhost:${PORT}`);
  });
}

function generateLocalCoachFeedback(stats: any): string {
  const score = stats?.focusScore || 0;
  const durationMin = Math.round((stats?.duration || 0) / 60);
  const distractions = stats?.distractionCount || 0;
  const postureScore = typeof stats?.avgPostureScore === "number" ? stats.avgPostureScore : null;

  let assessment = "";
  if (score >= 85) {
    assessment = `Outstanding concentration! You achieved an impressive ${score}% focus score across ${durationMin} minutes of studying. Your sustained attention is building powerful deep-work endurance.`;
  } else if (score >= 70) {
    assessment = `Solid study session! You maintained focus for ${score}% of your ${durationMin}-minute block with only ${distractions} brief distraction periods.`;
  } else {
    assessment = `Good effort showing up! You completed ${durationMin} minutes of study time with a ${score}% focus score. Distractions happen when cognitive fatigue sets in.`;
  }

  const tip1 = score < 75 
    ? "Try using 25-minute Pomodoro intervals to prevent attention fatigue before distractions mount."
    : "Your gaze alignment remained steady—keep positioning your study notes directly within your natural line of sight.";
  const tip2 = postureScore !== null && postureScore < 75
    ? `Your upper body posture averaged ${postureScore}%. Raise your screen closer to eye level and roll your shoulders back every 15 minutes.`
    : distractions > 5
    ? "Place your phone in another room or use website blockers to minimize peripheral movement triggers."
    : "Stay well-hydrated and do a 2-minute posture stretch before your next deep work sprint.";

  return `${assessment}\n\n• ${tip1}\n• ${tip2}\n\nStay persistent—every focused minute compounds into mastery!`;
}

startServer();

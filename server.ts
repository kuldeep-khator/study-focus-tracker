import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

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
          'User-Agent': 'aistudio-build',
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

  // API: AI Study Coach Analysis (Only receives statistics, NEVER raw video/images!)
  app.post("/api/ai/coach-advice", async (req, res) => {
    try {
      const { sessionStats, recentHistory } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        // Return structured smart feedback locally if Gemini API key isn't provided
        return res.json({
          feedback: generateLocalCoachFeedback(sessionStats),
          source: "local-heuristic"
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
- Subject/Topic: ${sessionStats?.subject || "General Study"}

Recent sessions context: ${recentHistory ? JSON.stringify(recentHistory) : "First recorded session"}

Provide:
1. A warm 2-sentence celebration or gentle reflection on their focus ratio.
2. 2 concrete, bite-sized recommendations for their next session based on their specific distraction patterns (e.g. Pomodoro intervals, desk ergonomics, screen distance, or micro-breaks).
3. A motivational closing mantra. Keep it concise, friendly, and empowering. Avoid clichés or medical claims.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an empathetic, evidence-informed study coach for students. Be concise, warm, practical, and inspiring.",
          temperature: 0.7,
        }
      });

      res.json({
        feedback: response.text || generateLocalCoachFeedback(sessionStats),
        source: "gemini"
      });
    } catch (error) {
      console.error("Gemini Coach Error:", error);
      res.json({
        feedback: generateLocalCoachFeedback(req.body?.sessionStats),
        source: "local-heuristic-fallback"
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
  const tip2 = distractions > 5
    ? "Place your phone in another room or use website blockers to minimize peripheral movement triggers."
    : "Stay well-hydrated and do a 2-minute posture stretch before your next deep work sprint.";

  return `${assessment}\n\n• ${tip1}\n• ${tip2}\n\nStay persistent—every focused minute compounds into mastery!`;
}

startServer();

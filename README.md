# StudyFocus AI — Study Focus Tracker

An AI-powered, privacy-first study focus tracker that uses real-time client-side webcam computer vision to analyze head pose, eye gaze, and face presence—helping students stay locked into deep work with customizable focus boundaries, persistent background monitoring, desktop distraction alerts, and personalized AI study coaching.

---

## Key Features

- **100% Client-Side Computer Vision (Privacy-First)**
  - Uses **MediaPipe FaceMesh** (468/478-point 3D facial landmarks) directly in the browser via WebAssembly/WebGL.
  - Raw video frames never leave your device—no video streams or images are uploaded to any server.
  - Strict camera lifecycle: webcam hardware turns **ON** only during active study sessions or calibration and releases immediately when paused or ended.

- **3D Head Pose, Eye Gaze & Upper Body Posture Tracking**
  - Uses **MediaPipe FaceMesh** + **MediaPipe Pose** to estimate live **Head Yaw**, **Head Pitch**, **Head Roll**, **Eye Iris Gaze**, **Blink (EAR)**, **Desk Position**, **Shoulder Tilt**, **Neck/Spine Slouch Angle**, and **Forward Lean %** relative to your calibrated baseline.
  - Includes a configurable **grace/drift window** (default `5s`) so natural blinking or brief note checks don't trigger false distractions.
  - **1-Click Pose Snapshot** and **5-Second Guided Calibration** capture both head/gaze and upper-body posture baselines plus multi-student profile presets (`relaxed`, `normal`, `strict`, `custom`).

- **Persistent Background Monitoring & Cross-Tab Alerts**
  - Powered by a **Web Worker background timer** and **`ImageCapture` frame grabbing** so webcam distraction calculation and session timing continue accurately even when you switch tabs, open another browser, or minimize the window.
  - Sends multi-channel alerts when sustained distraction is detected in the background:
    - **Desktop / OS Notifications** (`Notification` API) with click-to-focus support and cooldown reminders.
    - **Dynamic Browser Tab Title Alerts** flashing distraction warnings when viewing other tabs.
    - **Synthesized Web Audio Chimes** (zero external audio assets) for distraction, focus restoration, and session completion.
  - **Interrupted Session Recovery**: Automatically detects unexpectedly closed sessions and offers one-click recovery on relaunch.

- **AI Study Habits Coach (Gemini API)**
  - Generates personalized post-session feedback, focus ratio reflections, and actionable ergonomic/study recommendations via a server-side `/api/ai/coach-advice` endpoint powered by `@google/genai` (with an automatic local heuristic fallback when no API key is configured).

- **Gmail Study Log Delivery**
  - Send any saved study session log (duration, focus score, distraction timeline, upper body posture metrics, notes, and AI Coach feedback) directly to your email via Gmail after explicit user confirmation, and track email delivery receipts (`emailedTo`, `emailedAt`) in Cloud Firestore.

- **Authentication, Analytics & History**
  - **Firebase Authentication** (Email/Password with email verification, Google Sign-In, Password Reset) and **Cloud Firestore** persistence.
  - Interactive **Analytics Dashboard** (`recharts`) with 7-day / 30-day / all-time trends, focus timelines, distraction reason breakdowns, and JSON data export.
  - **Interactive Camera Simulation Mode** to test head-turn, eye-gaze, upper-body slouch, and no-face triggers without webcam hardware.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts, Canvas Confetti
- **Computer Vision:** MediaPipe FaceMesh (`@mediapipe/face_mesh`), MediaPipe Pose (`@mediapipe/pose`), custom 3D head/posture/gaze geometry engine, Web Worker background clock
- **Backend:** Node.js, Express (`server.ts`), Google GenAI SDK (`@google/genai`)
- **Auth, Email & Persistence:** Firebase Authentication, Google OAuth + Gmail API (`gmail.send`), Cloud Firestore (`firebase`, `firebase-admin`), `localStorage` active-session recovery cache

---

## Project Structure

```text
├── server.ts                        # Express server + Vite dev middleware + Gemini AI Coach API
├── index.html                       # App entry HTML & MediaPipe CDN loaders
├── firestore.rules                  # Cloud Firestore security rules
├── firebase-applet-config.json      # Firebase project configuration
├── src/
│   ├── App.tsx                      # Root app, auth state, Firestore sync, navigation
│   ├── types.ts                     # TypeScript interfaces for sessions, profiles, metrics
│   ├── components/
│   │   ├── ActiveSessionView.tsx    # Live session controller, background clock, alert dispatcher
│   │   ├── CameraTracker.tsx        # Webcam lifecycle, MediaPipe loop, background ImageCapture
│   │   ├── AnalyticsDashboard.tsx   # Trends & focus performance charts
│   │   ├── PersonalDashboard.tsx    # Today/weekly overview & quick session launch
│   │   ├── SessionHistoryView.tsx   # Past sessions, posture badges, email resend & logs
│   │   ├── SessionSummaryModal.tsx  # Post-session stats, posture card, notes & AI Coach
│   │   ├── EmailSessionModal.tsx    # Explicit confirmation dialog for Gmail log sending
│   │   ├── SettingsModal.tsx        # Thresholds, Gmail settings, audio/desktop alerts
│   │   ├── AuthView.tsx             # Firebase login, signup, email verification & Google OAuth
│   │   └── Navbar.tsx               # Top navigation & live focus state badge
│   └── utils/
│       ├── computerVision.ts        # 3D pose, upper body posture, eye gaze, EAR & HUD
│       ├── gmail.ts                 # Client-side Gmail OAuth connect & MIME message sender
│       ├── backgroundTimer.ts       # Unthrottled Web Worker interval timer
│       ├── audio.ts                 # Web Audio API synthesized chimes
│       ├── sessionManager.ts        # Active session localStorage persistence & recovery
│       └── firestore.ts             # Firestore CRUD helpers
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm** (or bun)
- A **Firebase** project with Authentication (Email/Password and/or Google) and Firestore enabled
- *(Optional)* A **Gemini API key** for server-side AI Study Coach insights

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd <repository-folder>
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

   ```env
   GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
   APP_URL="http://localhost:3000"
   ```

   > If `GEMINI_API_KEY` is omitted, the AI Study Coach automatically falls back to built-in heuristic feedback so the app remains fully functional.

4. **Configure Firebase**

   Update `firebase-applet-config.json` with your Firebase project's web config (`projectId`, `apiKey`, `authDomain`, `appId`, etc.) and deploy `firestore.rules` to your Firebase project if needed.

### Running Locally

- **Development Server** (Express + Vite middleware on port `3000`):
  ```bash
  npm run dev
  ```
  Open [http://localhost:3000](http://localhost:3000).

- **Typecheck / Lint**:
  ```bash
  npm run lint
  ```

- **Production Build & Start**:
  ```bash
  npm run build
  npm start
  ```

---

## Background Tab & Cross-Browser Monitoring Tips

To receive distraction messages while working in **another tab**, **another browser**, or **another application**:

1. **Allow Camera Access** when starting your first study session.
2. **Allow Browser Notifications** when prompted (or click **Enable Desktop Alert Messages** in the active session banner / **Settings → Alerts & Visual Feedback → Test Message**).
3. Keep **Audio Chimes** enabled if you also want an audible reminder chime when looking away past your configured delay threshold.

---

## Privacy Guarantee

- **Zero Video Uploads:** Webcam frames are analyzed strictly in browser memory and immediately discarded.
- **No Facial Recognition:** Only geometric head orientation angles, iris offsets, and bounding coordinates are computed—no biometric identity data is stored or transmitted.
- **Full Data Control:** Export all stored session data as JSON or wipe your session logs anytime from **Settings & Privacy Hub**.

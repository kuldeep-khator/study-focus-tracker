import { pgTable, text, integer, real, boolean, bigint, timestamp, jsonb } from "drizzle-orm/pg-core";

// App Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastLoginAt: bigint("last_login_at", { mode: "number" }).notNull(),
});

// Student Profiles
export const studentProfiles = pgTable("student_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  avatarColor: text("avatar_color").notNull().default("#4f46e5"),
  baselineYaw: real("baseline_yaw").notNull().default(0),
  baselinePitch: real("baseline_pitch").notNull().default(0),
  baselineRoll: real("baseline_roll").notNull().default(0),
  baselineGazeX: real("baseline_gaze_x").notNull().default(0),
  baselineGazeY: real("baseline_gaze_y").notNull().default(0),
  baselineFaceX: real("baseline_face_x").notNull().default(0.5),
  baselineFaceY: real("baseline_face_y").notNull().default(0.5),
  baselineFaceScale: real("baseline_face_scale").notNull().default(1.0),
  isCalibrated: boolean("is_calibrated").notNull().default(false),
  calibratedAt: bigint("calibrated_at", { mode: "number" }),
  yawLimit: integer("yaw_limit").notNull().default(20),
  pitchLimit: integer("pitch_limit").notNull().default(15),
  gazeLimit: integer("gaze_limit").notNull().default(20),
  facePosTolerance: integer("face_pos_tolerance").notNull().default(25),
  distractionDelay: integer("distraction_delay").notNull().default(5),
  preset: text("preset").notNull().default("normal"),
  outOfFocusBoundaryEnabled: boolean("out_of_focus_boundary_enabled").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// Study Sessions
export const studySessions = pgTable("study_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  studentId: text("student_id"),
  subject: text("subject").notNull().default("General Study"),
  startTime: bigint("start_time", { mode: "number" }).notNull(),
  endTime: bigint("end_time", { mode: "number" }).notNull(),
  duration: integer("duration").notNull().default(0), // Total study duration in seconds
  focusedTime: integer("focused_time").notNull().default(0), // Focused duration in seconds
  distractionTime: integer("distraction_time").notNull().default(0), // Distracted duration in seconds
  distractionCount: integer("distraction_count").notNull().default(0),
  focusScore: integer("focus_score").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  notes: text("notes").notNull().default(""),
  aiSummary: text("ai_summary"),
  distractionEvents: jsonb("distraction_events").notNull().default([]),
  timeline: jsonb("timeline").notNull().default([]),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// User App Settings
export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  audioAlerts: boolean("audio_alerts").notNull().default(true),
  alertVolume: real("alert_volume").notNull().default(0.7),
  visualBannerAlerts: boolean("visual_banner_alerts").notNull().default(true),
  autoPauseOnNoFace: boolean("auto_pause_on_no_face").notNull().default(true),
  soundType: text("sound_type").notNull().default("gentle-chime"),
  selectedCameraId: text("selected_camera_id").notNull().default(""),
  mirrorCamera: boolean("mirror_camera").notNull().default(true),
  showFaceMeshOverlay: boolean("show_face_mesh_overlay").notNull().default(true),
  theme: text("theme").notNull().default("light"),
  pomodoroWorkDuration: integer("pomodoro_work_duration").notNull().default(25),
  pomodoroBreakDuration: integer("pomodoro_break_duration").notNull().default(5),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

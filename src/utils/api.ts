import { auth } from "../lib/firebase";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User is not authenticated");
  }
  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function syncUserWithBackend(name?: string) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/auth/sync", {
    method: "POST",
    headers,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to sync user");
  return res.json();
}

export async function fetchStudentProfilesApi() {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/profiles", { headers });
  if (!res.ok) throw new Error("Failed to fetch student profiles");
  const data = await res.json();
  return data.profiles;
}

export async function saveStudentProfileApi(profile: any) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/profiles", {
    method: "POST",
    headers,
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error("Failed to save student profile");
  const data = await res.json();
  return data.profile;
}

export async function deleteStudentProfileApi(profileId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/profiles/${profileId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error("Failed to delete student profile");
  return res.json();
}

export async function fetchStudySessionsApi() {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/sessions", { headers });
  if (!res.ok) throw new Error("Failed to fetch study sessions");
  const data = await res.json();
  return data.sessions;
}

export async function saveStudySessionApi(session: any) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify(session),
  });
  if (!res.ok) throw new Error("Failed to save study session");
  const data = await res.json();
  return data.session;
}

export async function deleteStudySessionApi(sessionId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/sessions/${sessionId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error("Failed to delete study session");
  return res.json();
}

export async function clearAllStudySessionsApi() {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/sessions", {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error("Failed to clear study sessions");
  return res.json();
}

export async function fetchUserSettingsApi() {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/settings", { headers });
  if (!res.ok) throw new Error("Failed to fetch user settings");
  const data = await res.json();
  return data.settings;
}

export async function saveUserSettingsApi(settings: any) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/settings", {
    method: "POST",
    headers,
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  const data = await res.json();
  return data.settings;
}

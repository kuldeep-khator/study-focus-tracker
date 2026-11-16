import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  signInWithPopup,
} from "firebase/auth";
import {
  auth,
  googleAuthProvider,
  getGmailAccessToken,
  setGmailAccessToken,
} from "../lib/firebase";
import { StudySession } from "../types";

/**
 * Ensures an in-memory Gmail OAuth access token is available by triggering
 * Google OAuth popup only on explicit user interaction.
 * Never persists the access token to localStorage or sessionStorage.
 */
export async function connectGmailAccount(): Promise<string> {
  const existingToken = getGmailAccessToken();
  if (existingToken) return existingToken;

  const currentUser = auth.currentUser;
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/gmail.send");
  provider.setCustomParameters({ prompt: "consent" });

  try {
    if (currentUser) {
      const hasGoogleProvider = currentUser.providerData.some(
        (p) => p.providerId === "google.com"
      );

      if (hasGoogleProvider) {
        const result = await reauthenticateWithPopup(currentUser, provider);
        const cred = GoogleAuthProvider.credentialFromResult(result);
        if (cred?.accessToken) {
          setGmailAccessToken(cred.accessToken);
          return cred.accessToken;
        }
      } else {
        try {
          const result = await linkWithPopup(currentUser, provider);
          const cred = GoogleAuthProvider.credentialFromResult(result);
          if (cred?.accessToken) {
            setGmailAccessToken(cred.accessToken);
            return cred.accessToken;
          }
        } catch (linkErr: any) {
          // If Google account already exists separately, credentialFromError may still carry the OAuth token
          const errCred = GoogleAuthProvider.credentialFromError(linkErr);
          if (errCred?.accessToken) {
            setGmailAccessToken(errCred.accessToken);
            return errCred.accessToken;
          }
          // Fall back to signInWithPopup if linking was blocked
          const fallbackResult = await signInWithPopup(auth, googleAuthProvider);
          const fallbackCred = GoogleAuthProvider.credentialFromResult(fallbackResult);
          if (fallbackCred?.accessToken) {
            setGmailAccessToken(fallbackCred.accessToken);
            return fallbackCred.accessToken;
          }
          throw linkErr;
        }
      }
    }

    const result = await signInWithPopup(auth, googleAuthProvider);
    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.accessToken) {
      throw new Error("Could not obtain Gmail send permission token from Google.");
    }
    setGmailAccessToken(cred.accessToken);
    return cred.accessToken;
  } catch (err: any) {
    if (err?.code === "auth/popup-closed-by-user") {
      throw new Error("Google authorization popup was closed before completing.");
    }
    throw new Error(err?.message || "Failed to connect Gmail account.");
  }
}

function formatDuration(secs: number): string {
  const s = Math.max(0, Math.round(secs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}h ${m}m ${rem}s`;
  if (m > 0) return `${m}m ${rem}s`;
  return `${rem}s`;
}

function encodeBase64UrlUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSessionEmailPayload(
  session: StudySession,
  recipientEmail: string,
  studentEmail?: string
): { subject: string; htmlBody: string; textBody: string } {
  const startDate = new Date(session.startTime).toLocaleString();
  const endDate = new Date(session.endTime).toLocaleTimeString();
  const subjectLine = `StudyFocus AI Log: ${session.subject || "General Study"} (${session.focusScore}% Focus${
    typeof session.avgPostureScore === "number" ? ` | ${session.avgPostureScore}% Posture` : ""
  })`;

  const postureSectionText =
    typeof session.avgPostureScore === "number"
      ? `Upper Body Posture Score: ${session.avgPostureScore}%\nUpright Posture Time: ${formatDuration(
          session.uprightPostureTime || 0
        )}\nSlouch / Uneven Posture Time: ${formatDuration(
          session.slouchPostureTime || 0
        )}\nPosture Summary: ${session.postureSummary || "Tracked"}\n`
      : "";

  const distractionLines =
    session.distractions && session.distractions.length > 0
      ? session.distractions
          .map(
            (d, i) =>
              `  ${i + 1}. [${formatDuration(d.secondInSession)}] ${
                d.reasonDescription || d.reason
              } (${d.durationSeconds}s)`
          )
          .join("\n")
      : "  None — zero sustained distractions recorded.";

  const textBody = `StudyFocus AI — Saved Study Session Log
===========================================
Account Email: ${studentEmail || recipientEmail}
Student Profile: ${session.studentName || "Student"}
Subject: ${session.subject || "General Study"}
Session Window: ${startDate} - ${endDate}

Focus & Attention Summary
-------------------------
Total Study Duration: ${formatDuration(session.duration)}
Focused Time: ${formatDuration(session.focusedTime)}
Distracted Time: ${formatDuration(session.distractionTime)}
Focus Score: ${session.focusScore}%
Distraction Events: ${session.distractionCount}
Longest Focus Streak: ${formatDuration(session.longestStreak)}
${postureSectionText}
Distraction Events Log
----------------------
${distractionLines}

Notes
-----
${session.notes || "(No notes recorded)"}

AI Study Coach Feedback
-----------------------
${session.aiSummary || "(No AI Coach summary generated)"}

Session ID: ${session.id}
`;

  const postureHtmlRow =
    typeof session.avgPostureScore === "number"
      ? `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;"><strong>Upper Body Posture Score</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;"><strong>${session.avgPostureScore}%</strong> (Upright: ${formatDuration(
          session.uprightPostureTime || 0
        )}, Slouch/Uneven: ${formatDuration(session.slouchPostureTime || 0)})</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;"><strong>Posture Assessment</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${escapeHtml(
          session.postureSummary || "Monitored"
        )}</td>
      </tr>`
      : "";

  const distractionHtmlList =
    session.distractions && session.distractions.length > 0
      ? `<ul style="margin:6px 0 0 18px;padding:0;color:#334155;font-size:13px;">${session.distractions
          .map(
            (d) =>
              `<li style="margin-bottom:4px;"><strong>${formatDuration(
                d.secondInSession
              )}</strong>: ${escapeHtml(
                d.reasonDescription || d.reason
              )} (${d.durationSeconds}s)</li>`
          )
          .join("")}</ul>`
      : `<p style="margin:6px 0 0;color:#059669;font-size:13px;">No sustained distractions recorded during this session.</p>`;

  const htmlBody = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:16px;color:#0f172a;">
    <div style="background:#1e1b4b;color:#ffffff;padding:20px 24px;border-radius:12px;margin-bottom:20px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#a5b4fc;font-weight:700;">StudyFocus AI — Saved Study Log</div>
      <h1 style="margin:6px 0 4px;font-size:20px;line-height:1.3;">${escapeHtml(
        session.subject || "General Study"
      )}</h1>
      <div style="font-size:13px;color:#c7d2fe;">${escapeHtml(
        session.studentName || "Student"
      )} &bull; ${escapeHtml(startDate)}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-size:14px;margin-bottom:16px;">
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;"><strong>Study Duration</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${formatDuration(
          session.duration
        )}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;"><strong>Focus Score</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#059669;"><strong>${
          session.focusScore
        }%</strong> (Focused: ${formatDuration(
    session.focusedTime
  )} / Distracted: ${formatDuration(session.distractionTime)})</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;"><strong>Distraction Events</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${
          session.distractionCount
        } events &bull; Longest Streak: ${formatDuration(
    session.longestStreak
  )}</td>
      </tr>
      ${postureHtmlRow}
    </table>

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
      <div style="font-size:13px;font-weight:700;color:#1e293b;">Distraction Events Log</div>
      ${distractionHtmlList}
    </div>

    ${
      session.notes
        ? `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:4px;">Session Notes</div>
            <div style="font-size:13px;color:#334155;white-space:pre-line;">${escapeHtml(
              session.notes
            )}</div>
          </div>`
        : ""
    }

    ${
      session.aiSummary
        ? `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
            <div style="font-size:13px;font-weight:700;color:#3730a3;margin-bottom:4px;">AI Study Habits Coach</div>
            <div style="font-size:13px;color:#312e81;white-space:pre-line;">${escapeHtml(
              session.aiSummary
            )}</div>
          </div>`
        : ""
    }

    <div style="font-size:11px;color:#64748b;text-align:center;margin-top:16px;">
      Logged from StudyFocus AI &bull; Session ID: ${escapeHtml(session.id)}
    </div>
  </div>`;

  return { subject: subjectLine, htmlBody, textBody };
}

/**
 * Sends a MIME email via Gmail API using an authorized in-memory OAuth Bearer token.
 * Always invoke only after explicit user confirmation.
 */
export async function sendGmailMessage(params: {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}): Promise<{ id: string }> {
  let accessToken = getGmailAccessToken();
  if (!accessToken) {
    accessToken = await connectGmailAccount();
  }

  const boundary = `studyfocus_${Date.now()}`;
  const mimeLines = [
    `To: ${params.to}`,
    `Subject: =?UTF-8?B?${btoa(
      unescape(encodeURIComponent(params.subject))
    )}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    params.textBody,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    params.htmlBody,
    "",
    `--${boundary}--`,
  ];

  const raw = encodeBase64UrlUtf8(mimeLines.join("\r\n"));

  const doSend = async (token: string) =>
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

  let res = await doSend(accessToken);

  // Retry once if token expired
  if (res.status === 401) {
    setGmailAccessToken(null);
    accessToken = await connectGmailAccount();
    res = await doSend(accessToken);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return { id: data.id || `msg-${Date.now()}` };
}

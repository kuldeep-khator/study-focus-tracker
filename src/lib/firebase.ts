import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope("https://www.googleapis.com/auth/gmail.send");

// Initialize Firestore database with specific databaseId if provided
const configuredDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = configuredDatabaseId
  ? getFirestore(app, configuredDatabaseId)
  : getFirestore(app);

// Validate connection to Firestore on initial boot
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
if (typeof window !== "undefined") {
  testFirestoreConnection();
}

// In-memory-only OAuth access token cache for Gmail API (never persisted to localStorage/sessionStorage)
let cachedGmailAccessToken: string | null = null;

export function setGmailAccessToken(token: string | null): void {
  cachedGmailAccessToken = token;
}

export function getGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function clearGmailAccessToken(): void {
  cachedGmailAccessToken = null;
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedGmailAccessToken = null;
  }
});

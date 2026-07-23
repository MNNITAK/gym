import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import {
  getFirestore,
  Timestamp,
  type Firestore,
  type DocumentData,
  type QueryDocumentSnapshot,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

// Lazy singleton — initialized on first use so app entrypoints can load the
// root .env BEFORE the SDK reads credentials from the environment.
let _db: Firestore | undefined;

/**
 * Read a service account from the environment. Serverless hosts (Vercel) have no
 * filesystem to point GOOGLE_APPLICATION_CREDENTIALS at, so FIREBASE_SERVICE_ACCOUNT
 * carries the JSON directly — raw or base64-encoded.
 */
function serviceAccountFromEnv(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const json = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  try {
    const parsed = JSON.parse(json) as Record<string, string>;
    // Env vars flatten newlines in the PEM key — restore them.
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON (or base64 JSON).");
  }
}

export function getDb(): Firestore {
  if (_db) return _db;
  if (!getApps().length) {
    const svc = serviceAccountFromEnv();
    const projectId =
      process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? svc?.project_id;
    if (!projectId) {
      throw new Error(
        "FIREBASE_PROJECT_ID is not set. Point .env at your Firebase project.",
      );
    }
    // Prefer an inline service account (serverless), else GOOGLE_APPLICATION_CREDENTIALS
    // / the ambient Application Default Credentials on the host.
    initializeApp({
      credential: svc
        ? cert({
            projectId: svc.project_id,
            clientEmail: svc.client_email,
            privateKey: svc.private_key,
          })
        : applicationDefault(),
      projectId,
    });
  }
  _db = getFirestore();
  return _db;
}

// ── Collection names (single source of truth) ────────────────────────────────
export const COLLECTIONS = {
  gyms: "gyms",
  staffUsers: "staffUsers",
  members: "members",
  memberMemories: "memberMemories",
  metabolicTwins: "metabolicTwins",
  plans: "plans",
  logs: "logs",
  notes: "notes",
  events: "events",
  protocols: "protocols",
  rituals: "rituals",
  ritualCompletions: "ritualCompletions",
  churnScores: "churnScores",
  milestones: "milestones",
  conversationTurns: "conversationTurns",
  outboundMessages: "outboundMessages",
  anonymizedPatterns: "anonymizedPatterns",
} as const;

// ── (De)serialization: convert Firestore Timestamps ⇄ JS Dates ───────────────
function convertTimestamps(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(convertTimestamps);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = convertTimestamps(v);
    }
    return out;
  }
  return value;
}

/** Map a snapshot to a typed model with `id`, converting Timestamps to Dates. */
export function toModel<T>(
  snap: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>,
): T {
  const data = convertTimestamps(snap.data() ?? {}) as Record<string, unknown>;
  return { id: snap.id, ...data } as T;
}

/** Firestore rejects `undefined` fields — strip them before writing. */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Safe document id: Firestore ids may not contain "/". */
export function docId(...parts: string[]): string {
  return parts.map((p) => p.replace(/\//g, "_")).join("__");
}

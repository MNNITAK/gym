"use client";

import { useEffect, useRef, useState } from "react";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithCustomToken, type Auth } from "firebase/auth";
import {
  getFirestore,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  type Firestore,
} from "firebase/firestore";
import { getMemberToken } from "./member-api";
import { getToken as getStaffToken } from "./api";

// ── Live updates ─────────────────────────────────────────────────────────────
// The member's waiting screen and the coach's queue both need to react the
// instant something changes. Firestore listeners give genuine server push.
//
// Every hook here degrades to polling if the listener can't be established —
// Auth not enabled, rules not deployed, a blocked websocket on conference wifi.
// A demo must not depend on console configuration having landed correctly, and
// the two paths are indistinguishable to the person watching.

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | undefined;
let _authed: Promise<{ auth: Auth; db: Firestore }> | undefined;

function configured(): boolean {
  return !!(config.apiKey && config.projectId);
}

/**
 * Sign the browser in with a server-minted custom token. Memoised: several hooks
 * on one page must share a single sign-in rather than racing each other.
 */
function connect(kind: "member" | "staff"): Promise<{ auth: Auth; db: Firestore }> {
  if (_authed) return _authed;

  _authed = (async () => {
    if (!configured()) throw new Error("Firebase web config missing");

    if (!_app) _app = getApps()[0] ?? initializeApp(config);
    const auth = getAuth(_app);
    const db = getFirestore(_app);

    const endpoint = kind === "member" ? "/api/me/realtime-token" : "/api/realtime-token";
    const bearer = kind === "member" ? getMemberToken() : getStaffToken();
    if (!bearer) throw new Error("not signed in");

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) throw new Error(`realtime token ${res.status}`);
    const payload = (await res.json()) as {
      available: boolean;
      token?: string;
      reason?: string;
    };

    // The server tells us plainly when live push isn't available (a console
    // setting, not a fault). Throwing here routes us into polling.
    if (!payload.available || !payload.token) {
      throw new Error(`realtime unavailable: ${payload.reason ?? "unknown"}`);
    }

    await signInWithCustomToken(auth, payload.token);
    return { auth, db };
  })();

  // A failed attempt must not poison every later one.
  _authed.catch(() => {
    _authed = undefined;
  });
  return _authed;
}

export type RealtimeMode = "live" | "polling" | "connecting";

/**
 * Watch one plan request. Calls `onChange` whenever it changes — the waiting
 * screen uses this to swap to the plan the moment the coach approves.
 */
export function usePlanRequestLive(
  requestId: string | null | undefined,
  onChange: () => void,
): RealtimeMode {
  const [mode, setMode] = useState<RealtimeMode>("connecting");
  // Kept in a ref so re-renders don't tear down and rebuild the listener.
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!requestId) return;
    let unsub: (() => void) | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const startPolling = () => {
      if (cancelled || poll) return;
      setMode("polling");
      poll = setInterval(() => cb.current(), 3000);
    };

    connect("member")
      .then(({ db }) => {
        if (cancelled) return;
        unsub = onSnapshot(
          doc(db, "planRequests", requestId),
          () => {
            setMode("live");
            cb.current();
          },
          // A listener that errors mid-flight (rules changed, token expired)
          // must not silently stop updating the screen.
          () => startPolling(),
        );
      })
      .catch(startPolling);

    return () => {
      cancelled = true;
      unsub?.();
      if (poll) clearInterval(poll);
    };
  }, [requestId]);

  return mode;
}

/** Watch a gym's open plan requests — the coach's queue badge. */
export function useRequestQueueLive(gymId: string | null | undefined, onChange: () => void): RealtimeMode {
  const [mode, setMode] = useState<RealtimeMode>("connecting");
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!gymId) return;
    let unsub: (() => void) | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const startPolling = () => {
      if (cancelled || poll) return;
      setMode("polling");
      poll = setInterval(() => cb.current(), 5000);
    };

    connect("staff")
      .then(({ db }) => {
        if (cancelled) return;
        unsub = onSnapshot(
          query(collection(db, "planRequests"), where("gymId", "==", gymId)),
          () => {
            setMode("live");
            cb.current();
          },
          () => startPolling(),
        );
      })
      .catch(startPolling);

    return () => {
      cancelled = true;
      unsub?.();
      if (poll) clearInterval(poll);
    };
  }, [gymId]);

  return mode;
}

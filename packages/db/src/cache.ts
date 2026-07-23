// ── Very short-lived read cache ──────────────────────────────────────────────
// Firestore round trips from outside Google's network cost 50-150ms each, and a
// single screen legitimately needs the same data several times (a member's logs
// feed the metabolic twin, adherence, cravings AND the progress chart).
//
// This holds reads for a couple of seconds so one page load makes one query
// instead of four. It is deliberately tiny: long enough to collapse the
// duplicates within a request, far too short to serve a member stale data after
// they log something. Writes clear the affected key immediately.

const DEFAULT_TTL_MS = 3_000;

interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();

export const requestCache = {
  get<T>(key: string): T | undefined {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      store.delete(key);
      return undefined;
    }
    return hit.value as T;
  },

  set(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS): void {
    store.set(key, { value, expires: Date.now() + ttlMs });
    // Keep the map from growing without bound in a long-lived process.
    if (store.size > 500) {
      const now = Date.now();
      for (const [k, v] of store) if (now > v.expires) store.delete(k);
    }
  },

  /** Drop everything for one entity — call after any write that touches it. */
  invalidate(prefix: string): void {
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  },

  clear(): void {
    store.clear();
  },
};

// ── Cross-gym learning layer (Phase 4) ───────────────────────────────────────
// The flywheel substrate: anonymized, aggregated patterns that improve every
// gym's AI without any member PII ever leaving its tenant. These functions are
// the privacy gate — the aggregation is deterministic and the PII assertion runs
// on every pattern before it is persisted.

// ── PII safety gate ──────────────────────────────────────────────────────────
// A pattern is a small aggregate keyed by cohort. It must never carry an
// identifier that could re-link to a member or a single gym.
const PII_KEY_PATTERN = /phone|email|name|address|memberId|gymId|whatsapp|dob|birth/i;
const PHONE_LIKE = /\+?\d[\d\s\-()]{7,}\d/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export class PiiLeakError extends Error {
  constructor(where: string) {
    super(`Refusing to persist a cross-gym pattern: possible PII at ${where}`);
    this.name = "PiiLeakError";
  }
}

/** Throw if an object that is about to cross the tenant boundary carries PII. */
export function assertNoPii(obj: unknown, path = "root"): void {
  if (obj == null) return;
  if (typeof obj === "string") {
    if (PHONE_LIKE.test(obj) || EMAIL_LIKE.test(obj)) throw new PiiLeakError(`${path} (value)`);
    return;
  }
  if (typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoPii(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (PII_KEY_PATTERN.test(k)) throw new PiiLeakError(`${path}.${k} (key)`);
    assertNoPii(v, `${path}.${k}`);
  }
}

// ── k-anonymity ──────────────────────────────────────────────────────────────
// A cohort must aggregate at least K distinct members before it is publishable,
// so no pattern can be traced back to an individual.
export const MIN_COHORT_SIZE = 5;

// ── Aggregation ──────────────────────────────────────────────────────────────
export interface PatternObservation {
  /** the cohort this observation belongs to, e.g. "diet:mini-cut:goal=lose" */
  cohort: string;
  /** distinct member id — used ONLY to count k-anonymity, never persisted */
  memberId: string;
  /** did the intervention "stick" / succeed for this member? */
  success: boolean;
  /** optional numeric outcome to average (e.g. adherence delta) */
  value?: number;
}

export interface AggregatedPattern {
  cohort: string;
  cohortSize: number;
  successRate: number;
  avgValue: number | null;
  observations: number;
}

/**
 * Aggregate raw per-member observations into publishable cross-gym patterns.
 * Cohorts below the k-anonymity floor are dropped. The output carries counts and
 * rates only — no ids — and is safe to share as a prior across every tenant.
 */
export function aggregatePatterns(
  observations: PatternObservation[],
): AggregatedPattern[] {
  const byCohort = new Map<
    string,
    { members: Set<string>; successes: number; values: number[]; count: number }
  >();

  for (const o of observations) {
    const bucket =
      byCohort.get(o.cohort) ??
      { members: new Set<string>(), successes: 0, values: [], count: 0 };
    bucket.members.add(o.memberId);
    if (o.success) bucket.successes += 1;
    if (typeof o.value === "number") bucket.values.push(o.value);
    bucket.count += 1;
    byCohort.set(o.cohort, bucket);
  }

  const out: AggregatedPattern[] = [];
  for (const [cohort, b] of byCohort) {
    if (b.members.size < MIN_COHORT_SIZE) continue; // k-anonymity floor
    out.push({
      cohort,
      cohortSize: b.members.size,
      successRate: round2(b.successes / b.count),
      avgValue: b.values.length ? round2(b.values.reduce((a, v) => a + v, 0) / b.values.length) : null,
      observations: b.count,
    });
  }
  // Deterministic order: strongest, best-attested patterns first.
  return out.sort((a, b) => b.successRate - a.successRate || b.cohortSize - a.cohortSize);
}

const round2 = (x: number) => Math.round(x * 100) / 100;

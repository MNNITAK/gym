// ── Churn scoring (heuristic v1) ─────────────────────────────────────────────
// Intervene at ~day 20 of a downward trend, not day 90. Starts as a transparent
// weighted heuristic; graduates to a trained model only if pilot data demands it.

export type ChurnRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ChurnFeatures {
  /** 0..1 — recent attendance vs the member's own baseline (1 = steady) */
  attendanceRatio: number;
  /** 0..1 — recent adherence to plan */
  adherence: number;
  /** hours since last WhatsApp reply, normalized: 0 = instant, 1 = very stale */
  responseLatencyNorm: number;
  /** -1..1 — sentiment in recent messages (1 = positive) */
  sentiment: number;
  /** days since joining (new members churn differently) */
  tenureDays: number;
}

export interface ChurnResult {
  score: number; // 0..1
  risk: ChurnRisk;
  contributions: Record<string, number>;
  suggestion: string;
}

const WEIGHTS = {
  attendance: 0.35,
  adherence: 0.25,
  latency: 0.2,
  sentiment: 0.2,
} as const;

export function scoreChurn(f: ChurnFeatures): ChurnResult {
  // Each term contributes 0 (safe) .. 1 (risky).
  const attendanceRisk = clamp01(1 - f.attendanceRatio);
  const adherenceRisk = clamp01(1 - f.adherence);
  const latencyRisk = clamp01(f.responseLatencyNorm);
  const sentimentRisk = clamp01((1 - f.sentiment) / 2); // map -1..1 → 1..0

  const contributions = {
    attendance: attendanceRisk * WEIGHTS.attendance,
    adherence: adherenceRisk * WEIGHTS.adherence,
    latency: latencyRisk * WEIGHTS.latency,
    sentiment: sentimentRisk * WEIGHTS.sentiment,
  };

  let score =
    contributions.attendance +
    contributions.adherence +
    contributions.latency +
    contributions.sentiment;

  // Early-tenure members are more fragile — nudge risk up in the first 6 weeks.
  if (f.tenureDays < 42) score = clamp01(score * 1.15);

  const risk: ChurnRisk =
    score >= 0.75
      ? "CRITICAL"
      : score >= 0.5
        ? "HIGH"
        : score >= 0.3
          ? "MEDIUM"
          : "LOW";

  return { score: round2(score), risk, contributions, suggestion: suggest(contributions, f) };
}

function suggest(c: Record<string, number>, f: ChurnFeatures): string {
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
  switch (top) {
    case "attendance":
      return "Attendance is drifting — have the coach send a personal check-in and offer to reschedule sessions.";
    case "adherence":
      return "Adherence is slipping — simplify the plan and trigger the adherence behavior conversation, not a harder plan.";
    case "latency":
      return "Going quiet on WhatsApp — a light, low-pressure message re-opens the loop.";
    case "sentiment":
      return "Recent messages read negative — coach should reach out personally before the next renewal date.";
    default:
      return f.tenureDays < 42
        ? "New member still forming the habit — reinforce daily rituals."
        : "Maintain current cadence.";
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

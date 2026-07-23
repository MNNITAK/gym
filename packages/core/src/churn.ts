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
  // Only NEGATIVE sentiment is a risk signal. Mapping neutral to 0.5 (as a plain
  // -1..1 → 1..0 rescale does) meant a member who simply hadn't said anything
  // emotional carried half the sentiment risk — which then dominated the
  // contributions for healthy members and produced "messages read negative"
  // advice on a LOW-risk score.
  const sentimentRisk = clamp01(-f.sentiment);

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

  return { score: round2(score), risk, contributions, suggestion: suggest(contributions, f, risk) };
}

/** A driver has to actually matter before we name it in coach-facing advice. */
const MEANINGFUL_CONTRIBUTION = 0.08;

function suggest(
  c: Record<string, number>,
  f: ChurnFeatures,
  risk: ChurnRisk,
): string {
  const [top, topValue] = Object.entries(c).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];

  // Don't invent a problem for a healthy member. Naming the largest contributor
  // regardless of size produced advice that flatly contradicted a LOW score.
  if (risk === "LOW" || topValue < MEANINGFUL_CONTRIBUTION) {
    return f.tenureDays < 42
      ? "New member and engaging well — keep reinforcing the daily rituals while the habit sets."
      : "Engaged and steady — no intervention needed. Maintain the current cadence.";
  }

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

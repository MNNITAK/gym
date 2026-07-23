// ── Adherence-gated plan adjustment (IP candidate #1) ────────────────────────
// The hard rule that upgrades on average coaching practice: if adherence is low
// and progress stalls, DO NOT cut calories — route to a behavior conversation.
// Only high-adherence plateaus trigger numerical adjustments. Deterministic + tested.

export const ADHERENCE_THRESHOLD = 0.6;

export type AdjustmentDecision =
  | "increase"
  | "decrease"
  | "hold"
  | "behavior_intervention";

export interface AdherenceInput {
  /** 0..1 — share of days the member logged / hit their targets */
  adherence: number;
  /** kg change over the window; negative = weight loss */
  weightChangeKg: number;
  /** the member's directional goal */
  goal: "lose" | "gain" | "maintain";
  /** minimum weekly change (kg) considered "progress" for the goal */
  expectedWeeklyChangeKg?: number;
}

export interface AdherenceDecision {
  decision: AdjustmentDecision;
  reason: string;
}

/**
 * Decide whether to change plan numbers or defer to a behavior conversation.
 * Core invariant: sub-threshold adherence NEVER yields a calorie cut.
 */
export function decideAdjustment(input: AdherenceInput): AdherenceDecision {
  const { adherence, weightChangeKg, goal, expectedWeeklyChangeKg = 0.35 } =
    input;

  // Progress check relative to goal direction
  const isProgressing =
    goal === "lose"
      ? weightChangeKg <= -expectedWeeklyChangeKg
      : goal === "gain"
        ? weightChangeKg >= expectedWeeklyChangeKg
        : Math.abs(weightChangeKg) <= expectedWeeklyChangeKg;

  if (adherence < ADHERENCE_THRESHOLD) {
    // The whole point: never punish low adherence with harder numbers.
    return {
      decision: "behavior_intervention",
      reason: `Adherence ${(adherence * 100).toFixed(
        0,
      )}% is below ${(ADHERENCE_THRESHOLD * 100).toFixed(
        0,
      )}%. Flagging a coach behavior conversation instead of changing targets.`,
    };
  }

  if (isProgressing) {
    return {
      decision: "hold",
      reason: "High adherence and on-track progress — hold the plan.",
    };
  }

  // High adherence but stalled ⇒ a genuine numerical plateau; adjust toward the goal.
  if (goal === "lose") {
    return {
      decision: "decrease",
      reason:
        "High adherence with a stalled plateau — reduce intake to resume fat loss.",
    };
  }
  if (goal === "gain") {
    return {
      decision: "increase",
      reason:
        "High adherence with a stalled plateau — increase intake to resume gaining.",
    };
  }
  return {
    decision: "hold",
    reason: "Maintenance goal within tolerance — hold.",
  };
}

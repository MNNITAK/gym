// ── Retention Engine deterministic rules (Phase 3) ───────────────────────────
// Streaks, tiers, milestone detection, and a transparent sentiment heuristic.
// The compounding switching cost (extracted member memory) and the churn score
// live in their own modules; this is the gamification + signal layer.

// ── Streaks ──────────────────────────────────────────────────────────────────
export interface StreakState {
  currentStreak: number;
  longestStreak: number;
}

/**
 * Update a member's engagement streak given the day of a new activity.
 * A same-day activity is a no-op; the next calendar day extends the streak;
 * any longer gap resets it to 1.
 */
export function updateStreak(
  state: StreakState,
  lastActiveDay: Date | null,
  activityDay: Date,
): StreakState {
  const day = (d: Date) => Math.floor(d.getTime() / 86_400_000);
  if (lastActiveDay == null) {
    return { currentStreak: 1, longestStreak: Math.max(1, state.longestStreak) };
  }
  const gap = day(activityDay) - day(lastActiveDay);
  let current: number;
  if (gap <= 0) current = state.currentStreak || 1; // same day (or clock skew)
  else if (gap === 1) current = state.currentStreak + 1; // consecutive day
  else current = 1; // streak broken
  return {
    currentStreak: current,
    longestStreak: Math.max(current, state.longestStreak),
  };
}

// ── Tiers ────────────────────────────────────────────────────────────────────
export type MemberTierName = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

export interface TierInput {
  tenureDays: number;
  longestStreak: number;
  /** 0..1 overall adherence */
  adherence: number;
}

// Loss-framed retention: tiers are earned through sustained engagement, so a lapse
// visibly threatens a status the member has invested in.
const TIER_THRESHOLDS: Array<{ tier: MemberTierName; minTenure: number; minStreak: number; minAdherence: number }> = [
  { tier: "PLATINUM", minTenure: 180, minStreak: 30, minAdherence: 0.85 },
  { tier: "GOLD", minTenure: 90, minStreak: 14, minAdherence: 0.7 },
  { tier: "SILVER", minTenure: 30, minStreak: 7, minAdherence: 0.5 },
  { tier: "BRONZE", minTenure: 0, minStreak: 0, minAdherence: 0 },
];

export function computeTier(input: TierInput): MemberTierName {
  for (const t of TIER_THRESHOLDS) {
    if (
      input.tenureDays >= t.minTenure &&
      input.longestStreak >= t.minStreak &&
      input.adherence >= t.minAdherence
    ) {
      return t.tier;
    }
  }
  return "BRONZE";
}

// ── Milestone detection ("Send a win") ───────────────────────────────────────
export type MilestoneKind =
  | "WEIGHT_LOSS"
  | "PR"
  | "STREAK"
  | "FIRST_ACHIEVEMENT"
  | "ADHERENCE";

export interface DetectedMilestone {
  type: MilestoneKind;
  title: string;
  /** dedupe key so the same win isn't celebrated twice */
  key: string;
  detail: Record<string, unknown>;
}

export interface MilestoneInput {
  startWeightKg?: number | null;
  currentWeightKg?: number | null;
  goal?: "lose" | "gain" | "maintain";
  currentStreak: number;
  longestStreak: number;
  /** best-ever estimated-1RM per lift, and the newest session's estimated 1RMs */
  priorBestE1rm?: Record<string, number>;
  latestE1rm?: Record<string, number>;
}

// Celebrate every whole-kilogram of loss, and streak milestones at meaningful marks.
const STREAK_MARKS = [7, 14, 30, 60, 100];

/** Detect newly-crossed milestones worth a coach-sent congratulations. */
export function detectMilestones(input: MilestoneInput): DetectedMilestone[] {
  const out: DetectedMilestone[] = [];

  // Weight-loss milestones at each whole kg (only when losing is the goal).
  if (
    input.goal === "lose" &&
    input.startWeightKg != null &&
    input.currentWeightKg != null
  ) {
    const lostKg = Math.floor(input.startWeightKg - input.currentWeightKg);
    if (lostKg >= 1) {
      out.push({
        type: "WEIGHT_LOSS",
        title: `${lostKg}kg down since starting`,
        key: `weight_loss:${lostKg}`,
        detail: { lostKg, startWeightKg: input.startWeightKg, currentWeightKg: input.currentWeightKg },
      });
    }
  }

  // Streak milestones at defined marks.
  const mark = STREAK_MARKS.filter((m) => input.currentStreak >= m).at(-1);
  if (mark != null) {
    out.push({
      type: "STREAK",
      title: `${mark}-day streak`,
      key: `streak:${mark}`,
      detail: { streak: input.currentStreak, mark },
    });
  }

  // Strength PRs: a lift's estimated 1RM beats its prior best by a real margin.
  if (input.priorBestE1rm && input.latestE1rm) {
    for (const [lift, e1rm] of Object.entries(input.latestE1rm)) {
      const prior = input.priorBestE1rm[lift];
      if (prior == null) continue;
      if (e1rm > prior * 1.01) {
        out.push({
          type: "PR",
          title: `New ${lift} PR (~${Math.round(e1rm)}kg est. 1RM)`,
          key: `pr:${lift}:${Math.round(e1rm)}`,
          detail: { lift, e1rm: Math.round(e1rm), prior: Math.round(prior) },
        });
      }
    }
  }

  return out;
}

/** Epley estimated 1RM — used by PR detection and auto-progression displays. */
export function estimatedOneRepMax(loadKg: number, reps: number): number {
  if (reps <= 1) return loadKg;
  return round1(loadKg * (1 + reps / 30));
}

// ── Tier perks & loss-framed renewal nudges ──────────────────────────────────
// Loss aversion is ~2× stronger than gain-seeking. Renewal messaging names what
// the member would LOSE (their streak, their tier, their tracked progress)
// rather than what they'd save.

export const TIER_PERKS: Record<MemberTierName, string[]> = {
  BRONZE: ["Weekly plan updates", "WhatsApp coach access"],
  SILVER: ["Everything in Bronze", "Monthly body-composition review", "Priority class booking"],
  GOLD: ["Everything in Silver", "Quarterly 1:1 with a senior coach", "Monthly guest pass"],
  PLATINUM: ["Everything in Gold", "Free personal-training session monthly", "Locked-in renewal rate"],
};

export interface RenewalContext {
  memberName: string;
  tier: MemberTierName;
  currentStreak: number;
  longestStreak: number;
  /** whole kg lost since joining, when the goal is fat loss */
  kgLost?: number | null;
  daysUntilRenewal: number;
}

export interface RenewalNudge {
  /** what they stand to lose, most valuable first */
  atStake: string[];
  message: string;
}

/**
 * Build a loss-framed renewal message. Everything named is something the member
 * has actually earned — never invented urgency.
 */
export function buildRenewalNudge(ctx: RenewalContext): RenewalNudge {
  const atStake: string[] = [];
  if (ctx.currentStreak >= 7) atStake.push(`your ${ctx.currentStreak}-day streak`);
  if (ctx.tier !== "BRONZE") atStake.push(`${titleCase(ctx.tier)} status and its perks`);
  if (ctx.kgLost && ctx.kgLost >= 1) atStake.push(`the ${ctx.kgLost}kg you've lost`);
  atStake.push("your coach's record of what works for you");

  const lead =
    ctx.daysUntilRenewal <= 0
      ? `${ctx.memberName}, your membership is up for renewal today.`
      : `${ctx.memberName}, your membership renews in ${ctx.daysUntilRenewal} day${ctx.daysUntilRenewal === 1 ? "" : "s"}.`;

  const list =
    atStake.length > 1
      ? `${atStake.slice(0, -1).join(", ")} and ${atStake.at(-1)}`
      : atStake[0]!;

  return {
    atStake,
    message: `${lead} Renewing keeps ${list}. Taking a break resets all of it — and starting again is the hard part.`,
  };
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

// ── Sentiment heuristic (feeds churn) ────────────────────────────────────────
// Transparent lexicon scoring in [-1, 1]. Deliberately simple; graduate to a model
// only if pilot data shows it underperforms (same philosophy as churn scoring).
const POSITIVE = /\b(great|good|awesome|love|happy|excited|thanks|thank you|amazing|strong|progress|smashed|crushed|proud|feeling great)\b/gi;
const NEGATIVE = /\b(tired|exhausted|stressed|sad|angry|frustrated|hate|quit|cancel|can'?t|struggl|hard|pain|sore|demotivated|giving up|no time)\b/gi;

export function estimateSentiment(text: string): number {
  const pos = (text.match(POSITIVE) ?? []).length;
  const neg = (text.match(NEGATIVE) ?? []).length;
  if (pos === 0 && neg === 0) return 0;
  return clampNeg1To1((pos - neg) / (pos + neg));
}

const clampNeg1To1 = (x: number) => Math.min(1, Math.max(-1, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

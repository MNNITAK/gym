// ── Training Engine deterministic rules (Phase 2) ────────────────────────────
// The parts that must be correct regardless of what the model returns: the
// Fatigue Guardian (forced deloads), auto-progression from logs, injury screening,
// and the diet/training coupling (IP candidate #2). All unit-tested.

// ── Fatigue Guardian ─────────────────────────────────────────────────────────
// Track fatigue signals and force a deload past threshold — the model can never
// "push through" an over-reached member.

export interface FatigueInput {
  /** rolling average session RPE (1..10) over the last week */
  avgRpe: number;
  /** average nightly sleep hours over the last week */
  avgSleepHours: number;
  /** subjective soreness 0..10 (0 = fresh, 10 = wrecked) */
  soreness: number;
  /** consecutive weeks trained without a deload */
  weeksSinceDeload: number;
  /** count of missed/failed prescribed sets in the last week */
  failedSets: number;
}

export type FatigueLevel = "fresh" | "normal" | "accumulating" | "overreached";

export interface FatigueDecision {
  level: FatigueLevel;
  deload: boolean;
  reasons: string[];
}

// A deload is forced past a fixed mesocycle length or when acute fatigue markers
// stack up. These thresholds are conservative on purpose — safety over optimality.
export const MAX_WEEKS_BEFORE_DELOAD = 6;
const HIGH_RPE = 8.5;
const LOW_SLEEP = 6;
const HIGH_SORENESS = 7;

export function decideFatigue(input: FatigueInput): FatigueDecision {
  const reasons: string[] = [];
  let score = 0;

  if (input.avgRpe >= HIGH_RPE) {
    score += 2;
    reasons.push(`sustained high effort (avg RPE ${input.avgRpe.toFixed(1)})`);
  }
  if (input.avgSleepHours < LOW_SLEEP) {
    score += 1;
    reasons.push(`under-recovered (avg sleep ${input.avgSleepHours.toFixed(1)}h)`);
  }
  if (input.soreness >= HIGH_SORENESS) {
    score += 1;
    reasons.push(`elevated soreness (${input.soreness}/10)`);
  }
  if (input.failedSets >= 3) {
    score += 2;
    reasons.push(`${input.failedSets} failed sets this week`);
  }

  // Hard mesocycle cap: deload regardless of markers.
  const cycleCap = input.weeksSinceDeload >= MAX_WEEKS_BEFORE_DELOAD;
  if (cycleCap) {
    reasons.push(`${input.weeksSinceDeload} weeks since last deload (cap ${MAX_WEEKS_BEFORE_DELOAD})`);
  }

  const deload = cycleCap || score >= 3;
  const level: FatigueLevel =
    deload
      ? "overreached"
      : score === 2
        ? "accumulating"
        : score === 1
          ? "normal"
          : "fresh";

  if (deload && reasons.length === 0) reasons.push("scheduled deload");
  return { level, deload, reasons };
}

// ── Auto-progression ─────────────────────────────────────────────────────────
// Load decisions come from the log data, not the model: if the member hit the top
// of the prescribed rep range at a comfortable RPE across enough sets, add load.

export interface SetPerformance {
  reps: number;
  /** actual RPE for the set, if reported */
  rpe?: number;
  loadKg: number;
}

export interface ProgressionInput {
  /** the prescribed rep range for the movement, e.g. [8, 12] */
  repRange: [number, number];
  /** sets actually performed last session for this movement */
  sets: SetPerformance[];
  /** smallest load increment available (kg) — e.g. 2.5 barbell, 1 dumbbell */
  incrementKg: number;
}

export type ProgressionAction = "increase" | "hold" | "decrease";

export interface ProgressionDecision {
  action: ProgressionAction;
  nextLoadKg: number;
  deltaKg: number;
  reason: string;
}

const RPE_CEILING_FOR_PROGRESS = 8; // must have ~2 reps in reserve to add load

/**
 * Decide the next working load for a movement from last session's sets.
 * Increase when every working set hit the top of the range at RPE ≤ 8; decrease
 * when the member failed to reach the bottom of the range (too heavy).
 */
export function decideProgression(input: ProgressionInput): ProgressionDecision {
  const { repRange, sets, incrementKg } = input;
  const [low, high] = repRange;
  const working = sets.filter((s) => s.reps > 0);

  if (working.length === 0) {
    return { action: "hold", nextLoadKg: 0, deltaKg: 0, reason: "no completed sets to judge" };
  }

  const topLoad = Math.max(...working.map((s) => s.loadKg));
  const allAtTop = working.every((s) => s.reps >= high);
  const rpeOk = working.every((s) => s.rpe == null || s.rpe <= RPE_CEILING_FOR_PROGRESS);
  const anyBelowFloor = working.some((s) => s.reps < low);

  if (allAtTop && rpeOk) {
    return {
      action: "increase",
      nextLoadKg: round(topLoad + incrementKg),
      deltaKg: incrementKg,
      reason: `hit ${high}+ reps on all sets at RPE ≤ ${RPE_CEILING_FOR_PROGRESS} — add ${incrementKg}kg`,
    };
  }
  if (anyBelowFloor) {
    return {
      action: "decrease",
      nextLoadKg: round(Math.max(0, topLoad - incrementKg)),
      deltaKg: -incrementKg,
      reason: `missed the bottom of the ${low}-${high} range — reduce ${incrementKg}kg`,
    };
  }
  return {
    action: "hold",
    nextLoadKg: round(topLoad),
    deltaKg: 0,
    reason: `progressing within the ${low}-${high} range — repeat the load`,
  };
}

// ── Injury screening ─────────────────────────────────────────────────────────
// Pain language flags a movement for coach review and safe substitution — never
// silently programmed around by the model.

const INJURY_PATTERNS: Array<{ re: RegExp; region: string }> = [
  { re: /lower back|low back|lumbar|slipped disc|herniat/i, region: "lower_back" },
  { re: /knee|patella|acl|mcl|meniscus/i, region: "knee" },
  { re: /shoulder|rotator cuff|impingement/i, region: "shoulder" },
  { re: /wrist|elbow|tennis elbow|golfer'?s elbow/i, region: "elbow_wrist" },
  { re: /hip|groin|hip flexor/i, region: "hip" },
  { re: /neck|cervical/i, region: "neck" },
];

const PAIN_CONTEXT = /pain|hurts?|hurting|sore(?!ness ok)|tweak|strain|sprain|injur|ache|aching/i;

export interface InjuryScreen {
  injuryFlag: boolean;
  regions: string[];
}

/** Screen free text for injury/pain signals that require coach review + substitution. */
export function screenForInjury(text: string): InjuryScreen {
  if (!PAIN_CONTEXT.test(text)) return { injuryFlag: false, regions: [] };
  const regions = INJURY_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.region);
  return { injuryFlag: regions.length > 0, regions };
}

// ── Diet / Training coupling (IP candidate #2) ───────────────────────────────
// A training day's intensity modulates that day's macro targets on the shared
// member state: fuel the hard days, pull carbs on the rest days. Deterministic
// so the two engines stay coherent no matter which generated first.

export type TrainingIntensity = "rest" | "low" | "moderate" | "high";

export interface CoupledMacros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

// Carb-cycling multipliers applied to the maintenance-day macro split.
const INTENSITY_KCAL_DELTA: Record<TrainingIntensity, number> = {
  rest: -0.1, // ~10% below baseline
  low: -0.05,
  moderate: 0,
  high: 0.12, // ~12% above baseline to fuel the session
};

/**
 * Adjust a baseline daily macro target for a given training-day intensity.
 * Protein is held constant (recovery); calories flex mostly through carbs.
 */
export function coupleMacrosToTraining(
  baseline: CoupledMacros,
  intensity: TrainingIntensity,
): CoupledMacros {
  const delta = INTENSITY_KCAL_DELTA[intensity];
  const targetKcal = Math.round(baseline.kcal * (1 + delta));
  const kcalDiff = targetKcal - baseline.kcal;
  // Move the calorie difference through carbs (4 kcal/g), protein & fat fixed.
  const carbsG = Math.max(0, Math.round(baseline.carbsG + kcalDiff / 4));
  return {
    kcal: targetKcal,
    proteinG: baseline.proteinG,
    carbsG,
    fatG: baseline.fatG,
  };
}

const round = (x: number) => Math.round(x * 100) / 100;

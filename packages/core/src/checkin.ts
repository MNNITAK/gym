// ── Daily check-in ───────────────────────────────────────────────────────────
// What a real personal trainer asks before deciding what you're doing today.
// Declared as data so the questionnaire, the coach summary and the log fan-out
// all work from one list.
//
// Most questions are a scale or a choice, because a member answering this every
// morning will abandon anything that needs typing. Only `notes` is free text.

export type CheckinAnswer = string | number;

export interface CheckinQuestion {
  key: string;
  /** what the member reads */
  prompt: string;
  type: "scale" | "number" | "choice" | "text";
  /** for scale: 1..5 labels, low to high */
  labels?: string[];
  options?: string[];
  unit?: string;
  /** asked every day vs. only when something warrants it */
  core: boolean;
  /** which log type this answer feeds, so the engines keep working */
  logAs?: "WEIGHT" | "SLEEP" | "CHECKIN";
}

export const CHECKIN_QUESTIONS: CheckinQuestion[] = [
  {
    key: "weight", prompt: "This morning's weight", type: "number", unit: "kg",
    core: true, logAs: "WEIGHT",
  },
  {
    key: "mood", prompt: "How are you feeling today?", type: "scale",
    labels: ["Rough", "Low", "OK", "Good", "Great"], core: true, logAs: "CHECKIN",
  },
  {
    key: "energy", prompt: "Energy levels", type: "scale",
    labels: ["Empty", "Low", "Fine", "Good", "Buzzing"], core: true, logAs: "CHECKIN",
  },
  {
    key: "sleepQuality", prompt: "How well did you sleep?", type: "scale",
    labels: ["Terrible", "Poor", "OK", "Well", "Great"], core: true,
  },
  {
    key: "sleepHours", prompt: "Hours of sleep", type: "number", unit: "h",
    core: true, logAs: "SLEEP",
  },
  {
    key: "soreness", prompt: "Muscle soreness", type: "scale",
    labels: ["None", "Slight", "Moderate", "Sore", "Very sore"], core: true, logAs: "CHECKIN",
  },
  {
    key: "pain", prompt: "Any pain or niggles?", type: "choice",
    options: ["None", "Slight niggle", "Real pain"], core: true,
  },
  {
    key: "stress", prompt: "Stress levels", type: "scale",
    labels: ["Calm", "Fine", "Busy", "Stressed", "Overwhelmed"], core: true,
  },
  {
    key: "water", prompt: "Water yesterday", type: "choice",
    options: ["Under 1L", "1–2L", "2–3L", "3L+"], core: true,
  },
  {
    key: "mealsYesterday", prompt: "How did yesterday's eating go?", type: "choice",
    options: ["On plan", "Mostly on plan", "Off plan", "Didn't track"], core: true,
  },
  {
    key: "motivation", prompt: "Motivation right now", type: "scale",
    labels: ["None", "Low", "OK", "High", "Fired up"], core: true,
  },
  {
    key: "timeAvailable", prompt: "Time you have to train today", type: "choice",
    options: ["No time", "20–30 min", "45 min", "60 min", "90 min+"], core: true,
  },
  {
    key: "preference", prompt: "What do you feel like today?", type: "choice",
    options: ["Whatever's planned", "Something hard", "Something light", "Just cardio", "Rest"],
    core: true,
  },
  {
    key: "recovery", prompt: "How recovered do you feel?", type: "scale",
    labels: ["Not at all", "A little", "Moderately", "Well", "Fully"], core: true,
  },
  {
    key: "notes", prompt: "Anything your coach should know?", type: "text", core: false,
  },
];

export const CHECKIN_CORE_COUNT = CHECKIN_QUESTIONS.filter((q) => q.core).length;

/**
 * Today's questions. Core set always, plus follow-ups earned by yesterday's
 * answers — a member who reported real pain yesterday gets asked about it
 * specifically, which is what a human coach would do.
 */
export function questionsFor(yesterday?: Record<string, CheckinAnswer> | null): CheckinQuestion[] {
  const qs = [...CHECKIN_QUESTIONS];

  if (yesterday?.pain === "Real pain") {
    qs.splice(7, 0, {
      key: "painFollowUp",
      prompt: "You reported pain yesterday — how is it today?",
      type: "choice",
      options: ["Gone", "Better", "Same", "Worse"],
      core: true,
    });
  }
  if (typeof yesterday?.sleepHours === "number" && yesterday.sleepHours < 6) {
    qs.splice(5, 0, {
      key: "sleepFollowUp",
      prompt: "You were short on sleep yesterday — did you catch up?",
      type: "choice",
      options: ["Yes", "A bit", "No"],
      core: true,
    });
  }
  return qs;
}

// ── Reading the answers ──────────────────────────────────────────────────────

export interface CheckinReadiness {
  /** 0..1 — how ready they are to train hard today */
  score: number;
  band: "green" | "amber" | "red";
  /** what the coach should consider, in plain words */
  flags: string[];
  /** the one-line summary shown on the request */
  summary: string;
}

const scale = (v: CheckinAnswer | undefined): number =>
  typeof v === "number" ? Math.min(5, Math.max(1, v)) : 3;

/**
 * Turn a check-in into a readiness read. Deterministic on purpose: the coach is
 * making a training decision from it, and it must not vary run to run.
 */
export function readCheckin(answers: Record<string, CheckinAnswer>): CheckinReadiness {
  const flags: string[] = [];

  const energy = scale(answers.energy);
  const sleepQ = scale(answers.sleepQuality);
  const soreness = scale(answers.soreness);
  const stress = scale(answers.stress);
  const recovery = scale(answers.recovery);
  const motivation = scale(answers.motivation);
  const sleepHours = typeof answers.sleepHours === "number" ? answers.sleepHours : 7.5;

  // Recovery and energy carry the most weight; soreness and stress subtract.
  let score =
    (energy / 5) * 0.25 +
    (recovery / 5) * 0.25 +
    (sleepQ / 5) * 0.2 +
    (motivation / 5) * 0.15 +
    ((6 - soreness) / 5) * 0.1 +
    ((6 - stress) / 5) * 0.05;

  if (sleepHours < 6) {
    score -= 0.1;
    flags.push(`Only ${sleepHours}h sleep`);
  }
  if (soreness >= 4) flags.push("Significantly sore");
  if (stress >= 4) flags.push("High stress");
  if (energy <= 2) flags.push("Low energy");
  if (motivation <= 2) flags.push("Motivation is low — consider a win they can get today");

  // Pain overrides everything. A coach must see it before deciding anything.
  const pain = String(answers.pain ?? "None");
  if (pain === "Real pain") {
    score = Math.min(score, 0.3);
    flags.unshift("⚠ Reports REAL PAIN — review before programming");
  } else if (pain === "Slight niggle") {
    score -= 0.05;
    flags.unshift("Slight niggle reported");
  }

  const time = String(answers.timeAvailable ?? "");
  if (time === "No time") flags.push("No time to train today");
  else if (time === "20–30 min") flags.push("Only 20–30 min available");

  const pref = String(answers.preference ?? "");
  if (pref === "Rest") flags.push("Asked for a rest day");
  else if (pref === "Something light") flags.push("Wants something light");
  else if (pref === "Something hard") flags.push("Wants to be pushed");

  const meals = String(answers.mealsYesterday ?? "");
  if (meals === "Off plan") flags.push("Ate off plan yesterday");

  score = Math.max(0, Math.min(1, score));
  const band: CheckinReadiness["band"] = score >= 0.66 ? "green" : score >= 0.4 ? "amber" : "red";

  const summary =
    band === "green"
      ? "Recovered and ready — good day to push."
      : band === "amber"
        ? "Partially recovered — moderate session, watch volume."
        : "Poorly recovered — light session or active recovery.";

  return { score: Math.round(score * 100) / 100, band, flags, summary };
}

/** Suggest what the coach should generate, from the check-in alone. */
export function suggestPlanKinds(answers: Record<string, CheckinAnswer>): {
  kinds: Array<"TRAINING" | "DIET">;
  rationale: string;
} {
  const readiness = readCheckin(answers);
  const pref = String(answers.preference ?? "");
  const time = String(answers.timeAvailable ?? "");

  if (pref === "Rest" || time === "No time" || readiness.band === "red") {
    return {
      kinds: ["DIET"],
      rationale: `${readiness.summary} Consider a recovery day and a diet plan only.`,
    };
  }
  return {
    kinds: ["TRAINING", "DIET"],
    rationale: readiness.summary,
  };
}

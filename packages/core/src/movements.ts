// ── Movement library with form intelligence (Training INNOV 05) ──────────────
// A curated catalog — NOT model-invented. Every movement carries cues, the
// mistakes people actually make, injury contraindications, and an "if you can't
// do X, do Y" ladder. Novices don't need "do a pistol squat", they need the
// six steps that get them there.

export type MovementPattern =
  | "squat"
  | "hinge"
  | "push_horizontal"
  | "push_vertical"
  | "pull_horizontal"
  | "pull_vertical"
  | "carry"
  | "core"
  | "conditioning";

export interface Movement {
  slug: string;
  name: string;
  pattern: MovementPattern;
  equipment: string[];
  /** 1 = easiest entry point, 5 = advanced */
  level: number;
  cues: string[];
  commonMistakes: string[];
  /** regions this movement must be avoided for (matches screenForInjury regions) */
  contraindicatedFor: string[];
  /** easier step down the ladder */
  regression?: string;
  /** harder step up the ladder */
  progression?: string;
  demoVideoUrl?: string;
}

export const MOVEMENT_LIBRARY: Movement[] = [
  // ── Squat pattern ──
  {
    slug: "box-squat", name: "Box Squat", pattern: "squat", equipment: ["box"], level: 1,
    cues: ["Sit back to the box, don't drop", "Knees track over toes", "Stand by driving the floor away"],
    commonMistakes: ["Collapsing onto the box", "Knees caving inward"],
    contraindicatedFor: [], progression: "goblet-squat",
  },
  {
    slug: "goblet-squat", name: "Goblet Squat", pattern: "squat", equipment: ["dumbbell", "kettlebell"], level: 2,
    cues: ["Elbows inside the knees at the bottom", "Chest tall", "Full depth without the back rounding"],
    commonMistakes: ["Heels lifting", "Rounding the lower back at depth"],
    contraindicatedFor: [], regression: "box-squat", progression: "back-squat",
  },
  {
    slug: "back-squat", name: "Barbell Back Squat", pattern: "squat", equipment: ["barbell", "rack"], level: 4,
    cues: ["Brace before you unrack", "Break at hips and knees together", "Drive up evenly"],
    commonMistakes: ["Knees caving", "Good-morning-ing out of the hole", "Cutting depth as load rises"],
    contraindicatedFor: ["knee", "lower_back"], regression: "goblet-squat", progression: "front-squat",
  },
  {
    slug: "leg-press", name: "Leg Press", pattern: "squat", equipment: ["machine"], level: 2,
    cues: ["Feet mid-platform", "Don't let the lower back round at the bottom"],
    commonMistakes: ["Locking knees hard at the top", "Bouncing out of the bottom"],
    contraindicatedFor: ["lower_back"], progression: "goblet-squat",
  },
  // ── Hinge ──
  {
    slug: "hip-bridge", name: "Hip Bridge", pattern: "hinge", equipment: [], level: 1,
    cues: ["Squeeze glutes at the top", "Ribs down"],
    commonMistakes: ["Arching the lower back instead of extending hips"],
    contraindicatedFor: [], progression: "hip-thrust",
  },
  {
    slug: "hip-thrust", name: "Barbell Hip Thrust", pattern: "hinge", equipment: ["barbell", "bench"], level: 3,
    cues: ["Chin tucked", "Full lockout, pause at the top"],
    commonMistakes: ["Hyperextending the back at lockout"],
    contraindicatedFor: [], regression: "hip-bridge", progression: "romanian-deadlift",
  },
  {
    slug: "romanian-deadlift", name: "Romanian Deadlift", pattern: "hinge", equipment: ["barbell", "dumbbell"], level: 3,
    cues: ["Push hips back, not down", "Bar stays against the legs", "Stop when the hamstrings run out"],
    commonMistakes: ["Turning it into a squat", "Rounding at the bottom"],
    contraindicatedFor: ["lower_back"], regression: "hip-thrust", progression: "conventional-deadlift",
  },
  {
    slug: "conventional-deadlift", name: "Conventional Deadlift", pattern: "hinge", equipment: ["barbell"], level: 5,
    cues: ["Take the slack out before you pull", "Push the floor away", "Lock hips and knees together"],
    commonMistakes: ["Hips shooting up first", "Rounding the upper back under load"],
    contraindicatedFor: ["lower_back"], regression: "romanian-deadlift",
  },
  // ── Horizontal push ──
  {
    slug: "incline-push-up", name: "Incline Push-Up", pattern: "push_horizontal", equipment: ["bench"], level: 1,
    cues: ["Body in one line", "Elbows ~45°"],
    commonMistakes: ["Hips sagging", "Flaring elbows to 90°"],
    contraindicatedFor: [], progression: "push-up",
  },
  {
    slug: "push-up", name: "Push-Up", pattern: "push_horizontal", equipment: [], level: 2,
    cues: ["Brace the ribs down", "Full range, chest to fist height"],
    commonMistakes: ["Half reps", "Head leading instead of chest"],
    contraindicatedFor: ["wrist"], regression: "incline-push-up", progression: "bench-press",
  },
  {
    slug: "bench-press", name: "Barbell Bench Press", pattern: "push_horizontal", equipment: ["barbell", "bench"], level: 4,
    cues: ["Shoulder blades pinned", "Bar to lower chest", "Drive feet into the floor"],
    commonMistakes: ["Bouncing off the chest", "Elbows flared to 90°"],
    contraindicatedFor: ["shoulder"], regression: "dumbbell-bench-press",
  },
  {
    slug: "dumbbell-bench-press", name: "Dumbbell Bench Press", pattern: "push_horizontal", equipment: ["dumbbell", "bench"], level: 3,
    cues: ["Wrists stacked over elbows", "Control the eccentric"],
    commonMistakes: ["Clashing the dumbbells at the top"],
    contraindicatedFor: [], regression: "push-up", progression: "bench-press",
  },
  // ── Vertical push ──
  {
    slug: "overhead-press", name: "Overhead Press", pattern: "push_vertical", equipment: ["barbell"], level: 4,
    cues: ["Squeeze glutes to stop the lean", "Head through at lockout"],
    commonMistakes: ["Leaning back excessively", "Pressing around the face instead of past it"],
    contraindicatedFor: ["shoulder", "lower_back"], regression: "landmine-press",
  },
  {
    slug: "landmine-press", name: "Landmine Press", pattern: "push_vertical", equipment: ["barbell"], level: 2,
    cues: ["Press up and slightly forward", "Ribs down"],
    commonMistakes: ["Over-arching the lower back"],
    contraindicatedFor: [], progression: "overhead-press",
  },
  // ── Horizontal pull ──
  {
    slug: "inverted-row", name: "Inverted Row", pattern: "pull_horizontal", equipment: ["bar"], level: 1,
    cues: ["Body rigid", "Pull chest to the bar"],
    commonMistakes: ["Hips dropping", "Shrugging"],
    contraindicatedFor: [], progression: "dumbbell-row",
  },
  {
    slug: "dumbbell-row", name: "Single-Arm Dumbbell Row", pattern: "pull_horizontal", equipment: ["dumbbell", "bench"], level: 2,
    cues: ["Row to the hip, not the armpit", "No torso rotation"],
    commonMistakes: ["Yanking with the lower back"],
    contraindicatedFor: [], regression: "inverted-row", progression: "barbell-row",
  },
  {
    slug: "barbell-row", name: "Barbell Row", pattern: "pull_horizontal", equipment: ["barbell"], level: 4,
    cues: ["Torso ~45°", "Bar to the lower ribs"],
    commonMistakes: ["Standing up as the set goes on", "Rounding the back"],
    contraindicatedFor: ["lower_back"], regression: "dumbbell-row",
  },
  // ── Vertical pull ──
  {
    slug: "band-assisted-pull-up", name: "Band-Assisted Pull-Up", pattern: "pull_vertical", equipment: ["bar", "band"], level: 2,
    cues: ["Start from a dead hang", "Chest to the bar"],
    commonMistakes: ["Kipping to make reps", "Partial range"],
    contraindicatedFor: [], regression: "lat-pulldown", progression: "pull-up",
  },
  {
    slug: "lat-pulldown", name: "Lat Pulldown", pattern: "pull_vertical", equipment: ["machine"], level: 1,
    cues: ["Pull elbows down and back", "No leaning far back"],
    commonMistakes: ["Using bodyweight momentum"],
    contraindicatedFor: [], progression: "band-assisted-pull-up",
  },
  {
    slug: "pull-up", name: "Pull-Up", pattern: "pull_vertical", equipment: ["bar"], level: 4,
    cues: ["Dead hang start", "Chin clearly over the bar"],
    commonMistakes: ["Half reps", "Shrugging instead of pulling with the lats"],
    contraindicatedFor: ["shoulder", "elbow_wrist"], regression: "band-assisted-pull-up",
  },
  // ── Core / carry / conditioning ──
  {
    slug: "dead-bug", name: "Dead Bug", pattern: "core", equipment: [], level: 1,
    cues: ["Lower back stays flat", "Move slowly"],
    commonMistakes: ["Letting the back arch off the floor"],
    contraindicatedFor: [], progression: "plank",
  },
  {
    slug: "plank", name: "Plank", pattern: "core", equipment: [], level: 2,
    cues: ["Squeeze glutes", "Ribs down, neutral neck"],
    commonMistakes: ["Hips too high", "Holding breath"],
    contraindicatedFor: [], regression: "dead-bug",
  },
  {
    slug: "farmers-carry", name: "Farmer's Carry", pattern: "carry", equipment: ["dumbbell", "kettlebell"], level: 2,
    cues: ["Tall posture", "Controlled steps"],
    commonMistakes: ["Leaning to one side"],
    contraindicatedFor: [], progression: "suitcase-carry",
  },
  {
    slug: "suitcase-carry", name: "Suitcase Carry", pattern: "carry", equipment: ["dumbbell"], level: 3,
    cues: ["Resist the side-bend", "Even stride"],
    commonMistakes: ["Letting the torso tip"],
    contraindicatedFor: [], regression: "farmers-carry",
  },
  {
    slug: "row-erg", name: "Rowing Machine", pattern: "conditioning", equipment: ["erg"], level: 2,
    cues: ["Legs, then body, then arms", "Reverse on the way back"],
    commonMistakes: ["Pulling with the arms first"],
    contraindicatedFor: [], progression: "assault-bike",
  },
  {
    slug: "assault-bike", name: "Assault Bike", pattern: "conditioning", equipment: ["bike"], level: 2,
    cues: ["Drive with legs and arms together", "Steady cadence"],
    commonMistakes: ["Starting far too hard"],
    contraindicatedFor: [], regression: "row-erg",
  },
];

const BY_SLUG = new Map(MOVEMENT_LIBRARY.map((m) => [m.slug, m]));
export function getMovement(slug: string): Movement | undefined {
  return BY_SLUG.get(slug);
}

/** Fuzzy-match an LLM-written exercise name onto the curated library. */
export function matchMovement(name: string): Movement | undefined {
  const n = name.toLowerCase().trim();
  const direct = BY_SLUG.get(n.replace(/\s+/g, "-"));
  if (direct) return direct;
  return (
    MOVEMENT_LIBRARY.find((m) => m.name.toLowerCase() === n) ??
    MOVEMENT_LIBRARY.find((m) => n.includes(m.name.toLowerCase())) ??
    MOVEMENT_LIBRARY.find((m) => m.name.toLowerCase().includes(n))
  );
}

// ── Injury-aware rehab integration (Training INNOV 04) ───────────────────────
// A parallel rehab progression that runs alongside training, with explicit
// return-to-training milestones so recovery is tracked, not guessed.

export interface RehabStage {
  stage: number;
  focus: string;
  exercises: string[];
  /** what must be true before advancing */
  clearedWhen: string;
}

export interface RehabProtocol {
  region: string;
  name: string;
  /** always true — rehab is coach-supervised, never fully automated */
  requiresCoachSignoff: true;
  stages: RehabStage[];
  redFlags: string[];
}

const REHAB: Record<string, RehabProtocol> = {
  knee: {
    region: "knee", name: "Knee return-to-load progression", requiresCoachSignoff: true,
    stages: [
      { stage: 1, focus: "Pain-free range & isometrics", exercises: ["Quad sets", "Straight-leg raise", "Wall sit (short hold)"], clearedWhen: "Pain-free through full range at rest" },
      { stage: 2, focus: "Controlled bodyweight loading", exercises: ["Box squat to a high box", "Step-up (low)", "Glute bridge"], clearedWhen: "20 bodyweight box squats with no pain during or next day" },
      { stage: 3, focus: "Load reintroduction", exercises: ["Goblet squat", "Leg press (partial range)", "Split squat"], clearedWhen: "Goblet squat at 1/3 bodyweight, pain-free for 2 sessions" },
      { stage: 4, focus: "Return to full training", exercises: ["Back squat (rebuild from 50%)"], clearedWhen: "Cleared by coach; no next-day soreness for 2 weeks" },
    ],
    redFlags: ["Swelling after sessions", "Giving way / instability", "Locking or catching"],
  },
  lower_back: {
    region: "lower_back", name: "Lower-back return-to-load progression", requiresCoachSignoff: true,
    stages: [
      { stage: 1, focus: "Pain-free bracing", exercises: ["Dead bug", "Bird dog", "Cat-camel"], clearedWhen: "Can brace and breathe without pain" },
      { stage: 2, focus: "Hip hinge relearning", exercises: ["Hip bridge", "Hip hinge with dowel", "Farmer's carry (light)"], clearedWhen: "Pain-free hinge pattern, unloaded" },
      { stage: 3, focus: "Loaded hinge", exercises: ["Kettlebell deadlift", "Romanian deadlift (light)", "Suitcase carry"], clearedWhen: "Light RDL for 3 sets, no next-day pain" },
      { stage: 4, focus: "Return to full training", exercises: ["Conventional deadlift (rebuild from 50%)"], clearedWhen: "Cleared by coach; 2 weeks symptom-free" },
    ],
    redFlags: ["Pain radiating down the leg", "Numbness or tingling", "Any bladder/bowel change — urgent medical referral"],
  },
  shoulder: {
    region: "shoulder", name: "Shoulder return-to-press progression", requiresCoachSignoff: true,
    stages: [
      { stage: 1, focus: "Range & cuff activation", exercises: ["Pendulum swings", "Band external rotation", "Scapular retraction"], clearedWhen: "Full pain-free overhead range" },
      { stage: 2, focus: "Stability under light load", exercises: ["Landmine press", "Incline push-up", "Face pull"], clearedWhen: "Landmine press for 3 sets, pain-free" },
      { stage: 3, focus: "Press reintroduction", exercises: ["Dumbbell bench press", "Half-kneeling DB press"], clearedWhen: "DB pressing at moderate load for 2 sessions" },
      { stage: 4, focus: "Return to full training", exercises: ["Overhead press (rebuild from 50%)"], clearedWhen: "Cleared by coach; no impingement signs" },
    ],
    redFlags: ["Night pain", "Weakness lifting the arm", "Clicking with pain"],
  },
  elbow_wrist: {
    region: "elbow_wrist", name: "Elbow/wrist tendon progression", requiresCoachSignoff: true,
    stages: [
      { stage: 1, focus: "Isometrics & load management", exercises: ["Wrist isometric holds", "Grip squeezes"], clearedWhen: "Pain settles within 24h of activity" },
      { stage: 2, focus: "Eccentric loading", exercises: ["Slow wrist curls", "Reverse wrist curls"], clearedWhen: "Eccentrics pain-free at light load" },
      { stage: 3, focus: "Grip reintroduction", exercises: ["Farmer's carry", "Neutral-grip rows"], clearedWhen: "Carries pain-free for 2 sessions" },
      { stage: 4, focus: "Return to full training", exercises: ["Pull-up (banded → full)"], clearedWhen: "Cleared by coach" },
    ],
    redFlags: ["Numbness in the fingers", "Sudden loss of grip strength"],
  },
  hip: {
    region: "hip", name: "Hip return-to-load progression", requiresCoachSignoff: true,
    stages: [
      { stage: 1, focus: "Mobility & activation", exercises: ["Glute bridge", "Clamshell", "90/90 hip switch"], clearedWhen: "Pain-free hip flexion and rotation" },
      { stage: 2, focus: "Unilateral control", exercises: ["Step-up (low)", "Split squat (bodyweight)"], clearedWhen: "Controlled split squat, no pinching" },
      { stage: 3, focus: "Load reintroduction", exercises: ["Goblet squat", "Hip thrust"], clearedWhen: "Loaded hinge and squat pain-free" },
      { stage: 4, focus: "Return to full training", exercises: ["Back squat (rebuild from 50%)"], clearedWhen: "Cleared by coach" },
    ],
    redFlags: ["Deep groin pain", "Clicking with pain", "Night pain"],
  },
  neck: {
    region: "neck", name: "Neck return-to-load progression", requiresCoachSignoff: true,
    stages: [
      { stage: 1, focus: "Range & posture", exercises: ["Chin tucks", "Gentle range drills"], clearedWhen: "Pain-free range in all directions" },
      { stage: 2, focus: "Isometric strength", exercises: ["Isometric neck holds", "Band pull-apart"], clearedWhen: "Isometrics pain-free" },
      { stage: 3, focus: "Load reintroduction", exercises: ["Farmer's carry", "Dumbbell row (supported)"], clearedWhen: "Loaded carries pain-free" },
      { stage: 4, focus: "Return to full training", exercises: ["Overhead press (rebuild)"], clearedWhen: "Cleared by coach" },
    ],
    redFlags: ["Radiating arm pain", "Numbness", "Headache with neck movement"],
  },
};

/** Rehab protocol for an injured region, if one exists. */
export function rehabProtocolFor(region: string): RehabProtocol | undefined {
  return REHAB[region];
}

export function rehabProtocolsFor(regions: string[]): RehabProtocol[] {
  return regions.map((r) => REHAB[r]).filter((p): p is RehabProtocol => !!p);
}

/** Walk the ladder one step in either direction. */
export function regressionOf(slug: string): Movement | undefined {
  const r = getMovement(slug)?.regression;
  return r ? getMovement(r) : undefined;
}
export function progressionOf(slug: string): Movement | undefined {
  const p = getMovement(slug)?.progression;
  return p ? getMovement(p) : undefined;
}

/** Full "if you can't do X, do Y" ladder for a pattern, easiest first. */
export function ladderFor(pattern: MovementPattern): Movement[] {
  return MOVEMENT_LIBRARY.filter((m) => m.pattern === pattern).sort((a, b) => a.level - b.level);
}

/**
 * Movements that must be avoided for the given injured regions, each with the
 * safest substitute in the same pattern.
 */
export function substitutionsFor(
  injuredRegions: string[],
): Array<{ avoid: Movement; use: Movement | undefined; region: string }> {
  const out: Array<{ avoid: Movement; use: Movement | undefined; region: string }> = [];
  for (const m of MOVEMENT_LIBRARY) {
    const hit = m.contraindicatedFor.find((r) => injuredRegions.includes(r));
    if (!hit) continue;
    const safe = ladderFor(m.pattern).find(
      (alt) => alt.slug !== m.slug && !alt.contraindicatedFor.some((r) => injuredRegions.includes(r)),
    );
    out.push({ avoid: m, use: safe, region: hit });
  }
  return out;
}

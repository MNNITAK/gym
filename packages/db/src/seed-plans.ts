// ── Deterministic plan builders for the demo dataset ─────────────────────────
// Seeded plans are built in code, not by the LLM, so seeding never depends on
// Groq quota and always produces the same result. They carry TIMES, so the day
// can be laid out as a schedule. Live AI generation is still demonstrated from
// the coach console — this only guarantees every member starts with something.

export interface SeedDietOptions {
  protocolSlug: string;
  tdee: number;
  /** deficit/surplus applied to tdee */
  delta: number;
  weightKg: number;
  vegetarian?: boolean;
}

export interface SeedTrainingOptions {
  protocolSlug: string;
  deload?: boolean;
  /** injured regions to keep unloaded */
  avoid?: string[];
}

const round = (n: number) => Math.round(n);

/** Meals differ by diet so a vegetarian member is never handed chicken. */
function mealsFor(veg: boolean) {
  return veg
    ? [
        { name: "Breakfast", time: "08:00", items: ["Vegetable poha", "1 cup curd", "10 almonds"] },
        { name: "Mid-Morning Snack", time: "11:00", items: ["Sprouts salad", "Green tea"] },
        { name: "Lunch", time: "13:30", items: ["2 rotis", "Rajma curry", "Mixed vegetable sabzi", "Salad"] },
        { name: "Pre-Workout Snack", time: "17:00", items: ["Banana", "Handful of peanuts"] },
        { name: "Dinner", time: "20:30", items: ["Paneer bhurji", "1 roti", "Sauteed greens"] },
      ]
    : [
        { name: "Breakfast", time: "08:00", items: ["3 egg omelette", "2 slices brown bread", "Black coffee"] },
        { name: "Mid-Morning Snack", time: "11:00", items: ["Greek yoghurt", "Handful of walnuts"] },
        { name: "Lunch", time: "13:30", items: ["Grilled chicken breast", "1 cup rice", "Mixed salad"] },
        { name: "Pre-Workout Snack", time: "17:00", items: ["Banana", "Black coffee"] },
        { name: "Dinner", time: "20:30", items: ["Grilled fish or chicken", "2 rotis", "Sauteed vegetables"] },
      ];
}

export function buildDietPlan(o: SeedDietOptions) {
  const kcal = round(o.tdee + o.delta);
  const proteinG = round(o.weightKg * 2);
  const fatG = round((kcal * 0.25) / 9);
  const carbsG = round((kcal - proteinG * 4 - fatG * 9) / 4);

  return {
    protocolSlug: o.protocolSlug,
    dailyTargets: { kcal, proteinG, carbsG, fatG },
    meals: mealsFor(!!o.vegetarian),
    groceryList: o.vegetarian
      ? ["Curd", "Paneer", "Rajma", "Sprouts", "Almonds", "Seasonal vegetables", "Atta"]
      : ["Eggs", "Chicken breast", "Greek yoghurt", "Brown bread", "Rice", "Seasonal vegetables"],
    adjustment: "hold",
    notesApplied: [],
  };
}

/** Knee-safe substitutions come from the same rules the live engine applies. */
function legMovement(avoid: string[]) {
  if (avoid.includes("knee")) {
    return { name: "Hip Thrust", sets: 4, reps: "10-12", targetRpe: 7, regression: "Hip Bridge", progression: "Romanian Deadlift" };
  }
  return { name: "Barbell Back Squat", sets: 4, reps: "6-8", targetRpe: 8, regression: "Goblet Squat", progression: "Front Squat" };
}

const PUSH = { name: "Bench Press", sets: 4, reps: "6-8", targetRpe: 8, regression: "Dumbbell Bench Press", progression: "Overhead Press" };
const PULL = { name: "Barbell Row", sets: 4, reps: "8-10", targetRpe: 8, regression: "Single-Arm Dumbbell Row", progression: "Pull-Up" };
const VPULL = { name: "Lat Pulldown", sets: 3, reps: "10-12", targetRpe: 7, regression: "Band-Assisted Pull-Up", progression: "Pull-Up" };
const CORE = { name: "Plank", sets: 3, reps: "45s", targetRpe: 6, regression: "Dead Bug", progression: "Farmer's Carry" };
const CARRY = { name: "Farmer's Carry", sets: 3, reps: "40m", targetRpe: 6, regression: "Suitcase Carry", progression: "Suitcase Carry" };

export function buildTrainingPlan(o: SeedTrainingOptions) {
  const avoid = o.avoid ?? [];
  const leg = legMovement(avoid);
  // A deload keeps the pattern but pulls volume and intensity back.
  const scale = <T extends { sets: number; targetRpe: number }>(e: T): T =>
    o.deload ? { ...e, sets: Math.max(2, e.sets - 1), targetRpe: Math.max(5, e.targetRpe - 2) } : e;
  const intensity = o.deload ? ("low" as const) : ("moderate" as const);

  const week =
    o.protocolSlug === "ppl"
      ? [
          { day: "Mon", focus: "Push", time: "18:00", intensity, exercises: [PUSH, CORE].map(scale) },
          { day: "Tue", focus: "Pull", time: "18:00", intensity, exercises: [PULL, VPULL].map(scale) },
          { day: "Thu", focus: "Legs", time: "18:00", intensity, exercises: [leg, CARRY].map(scale) },
          { day: "Sat", focus: "Upper Body", time: "10:00", intensity, exercises: [PUSH, PULL].map(scale) },
        ]
      : o.protocolSlug === "full-body"
        ? [
            { day: "Mon", focus: "Full Body", time: "18:00", intensity, exercises: [leg, PUSH, PULL].map(scale) },
            { day: "Wed", focus: "Full Body", time: "18:00", intensity, exercises: [leg, VPULL, CORE].map(scale) },
            { day: "Fri", focus: "Full Body", time: "18:00", intensity, exercises: [PUSH, PULL, CARRY].map(scale) },
          ]
        : [
            { day: "Mon", focus: "Upper Body", time: "18:00", intensity, exercises: [PUSH, PULL, CORE].map(scale) },
            { day: "Tue", focus: "Lower Body", time: "18:00", intensity, exercises: [leg, CARRY].map(scale) },
            { day: "Thu", focus: "Upper Body", time: "18:00", intensity, exercises: [PUSH, VPULL].map(scale) },
            { day: "Fri", focus: "Lower Body", time: "18:00", intensity, exercises: [leg, CORE].map(scale) },
          ];

  return {
    protocolSlug: o.protocolSlug,
    daysPerWeek: week.length,
    week,
    deload: !!o.deload,
  };
}

/** Per-day macro targets coupled to the training week (IP #2), for the seeded plan. */
export function couple(
  diet: ReturnType<typeof buildDietPlan>,
  training: ReturnType<typeof buildTrainingPlan>,
) {
  const DELTA: Record<string, number> = { rest: -0.1, low: -0.05, moderate: 0, high: 0.12 };
  return training.week.map((d) => {
    const delta = DELTA[d.intensity] ?? 0;
    const kcal = round(diet.dailyTargets.kcal * (1 + delta));
    return {
      day: d.day,
      intensity: d.intensity,
      focus: d.focus,
      kcal,
      proteinG: diet.dailyTargets.proteinG,
      carbsG: Math.max(0, round(diet.dailyTargets.carbsG + (kcal - diet.dailyTargets.kcal) / 4)),
      fatG: diet.dailyTargets.fatG,
    };
  });
}

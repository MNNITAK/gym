// ── Metabolic Twin (IP candidate #3) ─────────────────────────────────────────
// Compute an individual's *actual* TDEE from their own rolling logs, replacing
// the population formula once there is enough signal. Deterministic + unit-tested.

export interface DailyEnergyLog {
  /** day the log pertains to */
  date: Date;
  /** total energy intake that day (kcal) */
  intakeKcal: number;
  /** body weight that day (kg) */
  weightKg: number;
}

export interface MetabolicEstimate {
  computedTdee: number;
  formulaTdee: number;
  usesRegression: boolean;
  confidence: number; // 0..1
  sampleDays: number;
  regression?: {
    // weight change is modeled as a function of energy balance:
    // dWeight/day ≈ (intake - TDEE) / KCAL_PER_KG
    slope: number;
    intercept: number;
    meanIntake: number;
    r2: number;
  };
}

export const KCAL_PER_KG = 7700; // approx energy in 1kg body mass
const MIN_DAYS_FOR_REGRESSION = 14;
const MIN_R2_FOR_CONFIDENCE = 0.25;

/** Mifflin–St Jeor population baseline — used until regression is trustworthy. */
export function mifflinStJeorTdee(input: {
  sex: "M" | "F";
  weightKg: number;
  heightCm: number;
  age: number;
  activityFactor?: number; // default lightly active
}): number {
  const { sex, weightKg, heightCm, age, activityFactor = 1.375 } = input;
  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "M" ? 5 : -161);
  return Math.round(bmr * activityFactor);
}

/**
 * Estimate TDEE from rolling logs. Method: regress daily weight change on intake.
 * At energy balance (dWeight = 0), intake = TDEE, so TDEE = -intercept/slope … but
 * we solve directly: for each day, TDEE_i = intake_i - dWeight_i * KCAL_PER_KG,
 * then take a robust mean. Regression r² gates confidence.
 */
export function estimateMetabolicTwin(
  logs: DailyEnergyLog[],
  formulaTdee: number,
): MetabolicEstimate {
  const sorted = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());
  const n = sorted.length;

  if (n < MIN_DAYS_FOR_REGRESSION) {
    return {
      computedTdee: formulaTdee,
      formulaTdee,
      usesRegression: false,
      confidence: Math.min(0.4, n / MIN_DAYS_FOR_REGRESSION / 2),
      sampleDays: n,
    };
  }

  // Per-day implied TDEE from energy balance across consecutive days.
  const perDayTdee: number[] = [];
  const intakes: number[] = [];
  for (let i = 1; i < n; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const dtDays =
      (cur.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60 * 24);
    if (dtDays <= 0) continue;
    const dWeightPerDay = (cur.weightKg - prev.weightKg) / dtDays;
    const impliedTdee = cur.intakeKcal - dWeightPerDay * KCAL_PER_KG;
    // discard physiologically implausible days
    if (impliedTdee > 800 && impliedTdee < 6000) {
      perDayTdee.push(impliedTdee);
      intakes.push(cur.intakeKcal);
    }
  }

  if (perDayTdee.length < MIN_DAYS_FOR_REGRESSION - 1) {
    return {
      computedTdee: formulaTdee,
      formulaTdee,
      usesRegression: false,
      confidence: 0.4,
      sampleDays: n,
    };
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const computedTdee = Math.round(mean(perDayTdee));
  const meanIntake = mean(intakes);

  // r² of implied-TDEE consistency (1 - normalized variance) as a confidence proxy
  const mu = mean(perDayTdee);
  const ssTot = perDayTdee.reduce((a, v) => a + (v - mu) ** 2, 0);
  const variance = ssTot / perDayTdee.length;
  const cv = Math.sqrt(variance) / mu; // coefficient of variation
  const r2 = Math.max(0, 1 - cv); // lower spread ⇒ higher "fit"

  const usesRegression = r2 >= MIN_R2_FOR_CONFIDENCE;
  const confidence = Math.min(1, Math.max(0.4, r2));

  return {
    computedTdee: usesRegression ? computedTdee : formulaTdee,
    formulaTdee,
    usesRegression,
    confidence,
    sampleDays: n,
    regression: {
      slope: -1 / KCAL_PER_KG,
      intercept: computedTdee,
      meanIntake,
      r2,
    },
  };
}

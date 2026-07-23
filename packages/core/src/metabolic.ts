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
/** How tightly the slope must be pinned down before we trust the member's own number. */
const MIN_PRECISION_FOR_CONFIDENCE = 0.25;

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
 * Estimate TDEE from a member's own rolling logs.
 *
 * Method: least-squares fit of body weight against time to get the underlying
 * trend (kg/day), then TDEE = mean(intake) − trend × KCAL_PER_KG, since at energy
 * balance intake equals TDEE and every kg of drift represents that much imbalance.
 *
 * Confidence comes from the standard error of the fitted slope, converted into
 * kcal/day — so it reflects how precisely we actually know the number.
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

  // Fit the WEIGHT TREND by least squares, rather than differencing consecutive
  // days. Bodyweight swings ~0.3kg overnight on water alone, and at 7700 kcal/kg
  // that is 2300 kcal of phantom energy between two adjacent readings — noise
  // that completely swamps a real 500 kcal deficit. Regressing the trend averages
  // it out, which is also what the method actually claims to do.
  const day0 = sorted[0]!.date.getTime();
  const xs = sorted.map((l) => (l.date.getTime() - day0) / 86_400_000); // days
  const ys = sorted.map((l) => l.weightKg);
  const intakes = sorted.map((l) => l.intakeKcal);

  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const xBar = mean(xs);
  const yBar = mean(ys);

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - xBar) ** 2;
    sxy += (xs[i]! - xBar) * (ys[i]! - yBar);
  }
  if (sxx === 0) {
    return { computedTdee: formulaTdee, formulaTdee, usesRegression: false, confidence: 0.4, sampleDays: n };
  }

  const slope = sxy / sxx; // kg per day
  const meanIntake = mean(intakes);
  // At energy balance intake == TDEE; every kg of drift is KCAL_PER_KG of imbalance.
  const computedTdee = Math.round(meanIntake - slope * KCAL_PER_KG);

  // Residual scatter around the fitted trend → how precisely we know the slope,
  // expressed in kcal. This is honest confidence: it stays high for a member
  // holding steady, where a plain r² would collapse for lack of a trend to fit.
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const fitted = yBar + slope * (xs[i]! - xBar);
    sse += (ys[i]! - fitted) ** 2;
    sst += (ys[i]! - yBar) ** 2;
  }
  const slopeStdErr = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : Infinity;
  const tdeeUncertainty = slopeStdErr * KCAL_PER_KG; // kcal/day
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 0;

  // ±150 kcal or better is a trustworthy estimate; ±500 is not worth showing.
  const precision = Math.max(0, Math.min(1, 1 - (tdeeUncertainty - 150) / 350));

  if (!Number.isFinite(computedTdee) || computedTdee < 800 || computedTdee > 6000) {
    return { computedTdee: formulaTdee, formulaTdee, usesRegression: false, confidence: 0.4, sampleDays: n };
  }

  // Trust the member's own number once the slope is pinned down well enough.
  // Gating on r² was wrong: a member holding steady has no trend to fit, so r²
  // collapses toward zero even when the estimate is excellent.
  const usesRegression = precision >= MIN_PRECISION_FOR_CONFIDENCE;
  const confidence = Math.min(0.98, Math.max(0.4, precision));

  return {
    computedTdee: usesRegression ? computedTdee : formulaTdee,
    formulaTdee,
    usesRegression,
    confidence,
    sampleDays: n,
    regression: {
      slope, // kg per day, from the fitted weight trend
      intercept: computedTdee,
      meanIntake,
      r2,
    },
  };
}

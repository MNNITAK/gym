// ── Safety guardrails (moat layer 6: regulatory & safety compliance) ─────────
// Nutrition & injury handling are medical-adjacent. These deterministic checks run
// on every generated Diet plan and inbound message before anything reaches a member.

export const SAFE_CALORIE_FLOOR = { M: 1500, F: 1200 } as const;

export interface CalorieFloorCheck {
  ok: boolean;
  clampedKcal: number;
  violated: boolean;
}

/** Never let a generated plan drop below a safe caloric floor. */
export function enforceCalorieFloor(
  kcal: number,
  sex: "M" | "F",
): CalorieFloorCheck {
  const floor = SAFE_CALORIE_FLOOR[sex];
  const violated = kcal < floor;
  return { ok: !violated, clampedKcal: Math.max(kcal, floor), violated };
}

// Phrases that must route to a human + resources, never to an AoutoAI plan.
const MEDICAL_FLAG_PATTERNS = [
  /chest pain|can't breathe|cannot breathe|fainted|passed out/i,
  /pregnan|breastfeeding/i,
  /diabet|insulin|thyroid|heart condition|blood pressure/i,
];

const EATING_DISORDER_PATTERNS = [
  /purge|purging|vomit after|starve|starving myself|not eating at all/i,
  /anorexi|bulimi|binge and purge/i,
];

export interface SafetyRouting {
  medicalFlag: boolean;
  eatingDisorderFlag: boolean;
  mustEscalate: boolean;
  matched: string[];
}

/** Screen inbound free text for medical / ED signals that force human escalation. */
export function screenForSafety(text: string): SafetyRouting {
  const matched: string[] = [];
  const medicalFlag = MEDICAL_FLAG_PATTERNS.some((re) => {
    const m = re.test(text);
    if (m) matched.push("medical");
    return m;
  });
  const eatingDisorderFlag = EATING_DISORDER_PATTERNS.some((re) => {
    const m = re.test(text);
    if (m) matched.push("eating_disorder");
    return m;
  });
  return {
    medicalFlag,
    eatingDisorderFlag,
    mustEscalate: medicalFlag || eatingDisorderFlag,
    matched,
  };
}

export const MEDICAL_DISCLAIMER =
  "This guidance is educational and not medical advice. For any medical concern, please consult a qualified healthcare professional.";

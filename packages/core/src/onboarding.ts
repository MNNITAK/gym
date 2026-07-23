// ── Onboarding field set ─────────────────────────────────────────────────────
// The 19 things a coach needs to know before writing anyone a plan. Declared as
// data so the agent, the progress bar and the memory-writing step all work from
// one list rather than three drifting copies.

// Mirrors MemoryKind in @keystone/db. Declared here because core sits *below* db
// in the dependency graph and must not import from it; the memory-extraction
// schema in schemas/ai-io.ts already declares the same set for the same reason.
type MemoryKind = "PREFERENCE" | "CONSTRAINT" | "INJURY" | "LIFE_EVENT" | "MOTIVATION" | "OTHER";

export interface OnboardingField {
  key: string;
  /** what the coach is actually trying to learn */
  label: string;
  /** a natural opening question — the agent may rephrase */
  ask: string;
  /** true when a plan genuinely cannot be written without it */
  required: boolean;
  /** where the answer lands in long-term memory */
  memoryKind: MemoryKind | null;
  /** structured field on the member record, when it maps to one */
  memberField?: "heightCm" | "startWeightKg" | "sex" | "goal" | "dateOfBirth";
}

export const ONBOARDING_FIELDS: OnboardingField[] = [
  { key: "age", label: "Age", ask: "How old are you?", required: true, memoryKind: null, memberField: "dateOfBirth" },
  { key: "gender", label: "Gender", ask: "And what's your gender? It changes how I calculate your energy needs.", required: true, memoryKind: null, memberField: "sex" },
  { key: "height", label: "Height", ask: "How tall are you? Centimetres or feet — whichever you think in.", required: true, memoryKind: null, memberField: "heightCm" },
  { key: "weight", label: "Current weight", ask: "What do you weigh at the moment, roughly?", required: true, memoryKind: null, memberField: "startWeightKg" },
  { key: "goal", label: "Goal", ask: "What are you actually here to do — lose fat, build muscle, get stronger, something else?", required: true, memoryKind: "MOTIVATION", memberField: "goal" },
  { key: "fitnessLevel", label: "Fitness level", ask: "How would you describe where you're starting from — brand new, coming back after a break, or already training regularly?", required: true, memoryKind: "OTHER" },
  { key: "medical", label: "Medical conditions", ask: "Any medical conditions I should know about? Diabetes, blood pressure, thyroid, anything at all.", required: true, memoryKind: "CONSTRAINT" },
  { key: "injuries", label: "Injuries", ask: "Any injuries or joints that give you trouble? Even old ones that flare up.", required: true, memoryKind: "INJURY" },
  { key: "allergies", label: "Allergies", ask: "Any food allergies or intolerances?", required: true, memoryKind: "CONSTRAINT" },
  { key: "diet", label: "Dietary preference", ask: "How do you eat — vegetarian, vegan, eggetarian, no restrictions?", required: true, memoryKind: "CONSTRAINT" },
  { key: "lifestyle", label: "Lifestyle", ask: "How active is your day outside the gym — desk-bound, on your feet, somewhere between?", required: false, memoryKind: "OTHER" },
  { key: "sleep", label: "Sleep schedule", ask: "What does your sleep look like — roughly when do you go to bed and wake up?", required: false, memoryKind: "OTHER" },
  { key: "occupation", label: "Occupation", ask: "What do you do for work? It tells me a lot about how your week actually runs.", required: false, memoryKind: "OTHER" },
  { key: "availability", label: "Workout availability", ask: "How many days a week can you realistically train, and at what time of day?", required: true, memoryKind: "CONSTRAINT" },
  { key: "equipment", label: "Equipment", ask: "What do you have access to — full gym, home setup, just bodyweight?", required: true, memoryKind: "CONSTRAINT" },
  { key: "water", label: "Water intake", ask: "How much water would you say you drink in a day?", required: false, memoryKind: "OTHER" },
  { key: "experience", label: "Previous experience", ask: "Have you followed a training or diet plan before? How did it go?", required: false, memoryKind: "OTHER" },
  { key: "motivation", label: "Motivation", ask: "Last big one — what's actually driving this? What makes it matter to you?", required: true, memoryKind: "MOTIVATION" },
  { key: "notes", label: "Anything else", ask: "Anything else you want your coach to know before we start?", required: false, memoryKind: "OTHER" },
];

export const ONBOARDING_FIELD_COUNT = ONBOARDING_FIELDS.length;

export function fieldByKey(key: string): OnboardingField | undefined {
  return ONBOARDING_FIELDS.find((f) => f.key === key);
}

/** The next thing to ask: required fields first, then the nice-to-haves. */
export function nextField(collected: Record<string, string>): OnboardingField | null {
  const missing = ONBOARDING_FIELDS.filter((f) => !collected[f.key]?.trim());
  return missing.find((f) => f.required) ?? missing[0] ?? null;
}

export function onboardingProgress(collected: Record<string, string>): {
  answered: number;
  total: number;
  percent: number;
  requiredRemaining: number;
} {
  const answered = ONBOARDING_FIELDS.filter((f) => collected[f.key]?.trim()).length;
  const requiredRemaining = ONBOARDING_FIELDS.filter(
    (f) => f.required && !collected[f.key]?.trim(),
  ).length;
  return {
    answered,
    total: ONBOARDING_FIELD_COUNT,
    percent: Math.round((answered / ONBOARDING_FIELD_COUNT) * 100),
    requiredRemaining,
  };
}

export const isOnboardingComplete = (collected: Record<string, string>): boolean =>
  onboardingProgress(collected).requiredRemaining === 0;

// ── Turning answers into structured data ─────────────────────────────────────
// Members answer in their own words ("five foot ten", "about 82 kilos"), so the
// parsers are deliberately forgiving. Anything unparseable stays as prose in
// memory rather than being discarded or guessed at.

export function parseHeightCm(text: string): number | null {
  const cm = text.match(/(\d{2,3})\s*(cm|centimet)/i);
  if (cm) return clamp(Number(cm[1]), 100, 250);
  const ftIn = text.match(/(\d)\s*(?:'|ft|feet|foot)\s*(\d{1,2})?/i);
  if (ftIn) {
    const inches = Number(ftIn[1]) * 12 + Number(ftIn[2] ?? 0);
    return clamp(Math.round(inches * 2.54), 100, 250);
  }
  const bare = text.match(/\b(1[4-9]\d|2[0-2]\d)\b/); // a plausible cm reading
  return bare ? clamp(Number(bare[1]), 100, 250) : null;
}

export function parseWeightKg(text: string): number | null {
  const lb = text.match(/(\d{2,3}(?:\.\d)?)\s*(lb|lbs|pound)/i);
  if (lb) return clamp(Math.round(Number(lb[1]) * 0.4536 * 10) / 10, 25, 300);
  const kg = text.match(/(\d{2,3}(?:\.\d)?)\s*(kg|kilo)/i);
  if (kg) return clamp(Number(kg[1]), 25, 300);
  const bare = text.match(/\b(\d{2,3}(?:\.\d)?)\b/);
  return bare ? clamp(Number(bare[1]), 25, 300) : null;
}

export function parseAge(text: string): number | null {
  const m = text.match(/\b(\d{1,2})\b/);
  return m ? clamp(Number(m[1]), 12, 100) : null;
}

export function parseSex(text: string): "M" | "F" | null {
  if (/\b(f|female|woman|girl)\b/i.test(text)) return "F";
  if (/\b(m|male|man|boy)\b/i.test(text)) return "M";
  return null;
}

const clamp = (n: number, lo: number, hi: number): number | null =>
  Number.isFinite(n) && n >= lo && n <= hi ? n : null;

/**
 * "None", "nope", "n/a" is a real answer — it means *no constraint* — and must be
 * recorded as answered without polluting memory with a meaningless fact.
 */
export function isNegativeAnswer(text: string): boolean {
  return /^\s*(no|none|nope|nothing|n\/?a|not really|no thanks)\b/i.test(text.trim());
}

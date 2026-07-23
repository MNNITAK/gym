import { z } from "zod";
import {
  DietPlanPayloadSchema,
  type DietPlanPayload,
  NoteParseSchema,
  type NoteParse,
  decideAdjustment,
  enforceCalorieFloor,
  type AdherenceInput,
} from "@keystone/core";
import type { LlmProvider } from "../provider.js";

export interface DietDraftInput {
  member: {
    name: string;
    sex: "M" | "F";
    goal: "lose" | "gain" | "maintain";
    weightKg: number;
  };
  /** individualized target from the Metabolic Twin (falls back to formula upstream) */
  tdee: number;
  /** protocol the engine selected from the library */
  protocol: { slug: string; name: string; summary: string; science: unknown };
  /** durable member memory facts to condition on (dislikes, constraints…) */
  memories: string[];
  /** parsed free-form notes to apply this cycle */
  noteAdjustments: string[];
  adherence: AdherenceInput;
}

const SYSTEM = `You are a sports nutritionist generating a one-day diet plan for a gym member.
Rules:
- Respect the selected protocol and the member's individualized TDEE.
- Honor every dietary constraint and dislike in the member memory.
- Apply the note adjustments (e.g. cheaper food, softer targets, a surplus day).
- Concrete Indian-context meals; never invent unsafe caloric restriction.

Return ONLY a JSON object with EXACTLY this shape (keys and types):
{
  "protocolSlug": string,                     // the given protocol slug
  "dailyTargets": { "kcal": number, "proteinG": number, "carbsG": number, "fatG": number },
  "meals": [ { "name": string, "items": [string, ...] } ],   // items are plain strings
  "groceryList": [string, ...],
  "adjustment": "increase" | "decrease" | "hold" | "behavior_intervention"
}
Do not add other top-level keys. Meal items MUST be strings like "2 rotis" or "150g paneer".`;

/**
 * Draft a diet plan. The adherence gate (IP #1) decides the adjustment direction
 * BEFORE generation, and the safe-calorie floor is enforced AFTER — the LLM never
 * gets to override either rule.
 */
export async function draftDietPlan(
  llm: LlmProvider,
  input: DietDraftInput,
): Promise<{ payload: DietPlanPayload; adjustmentReason: string; floorEnforced: boolean }> {
  const decision = decideAdjustment(input.adherence);

  const user = JSON.stringify({
    member: input.member,
    tdee: input.tdee,
    protocol: input.protocol,
    memories: input.memories,
    noteAdjustments: input.noteAdjustments,
    requiredAdjustment: decision.decision,
    adjustmentReason: decision.reason,
  });

  const { data } = await llm.completeStructured(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    DietPlanPayloadSchema,
    { task: "reasoning" },
  );

  // Force the engine's authoritative adjustment decision onto the payload.
  data.adjustment = decision.decision;

  // Hard safety floor — clamp regardless of what the model returned.
  const floor = enforceCalorieFloor(data.dailyTargets.kcal, input.member.sex);
  if (floor.violated) {
    data.dailyTargets.kcal = floor.clampedKcal;
  }

  return {
    payload: data,
    adjustmentReason: decision.reason,
    floorEnforced: floor.violated,
  };
}

// ── Coach-directed revision ──────────────────────────────────────────────────
// The coach reviews a draft and tells the AI what to change in plain language.
// They may reshape the plan freely — but the safety rules re-apply afterwards,
// so no instruction can talk the model past the calorie floor or the adherence gate.

const RevisedDietSchema = z.object({
  summary: z.string(),
  plan: DietPlanPayloadSchema,
});

const REVISE_SYSTEM = `You are revising an existing diet plan for a gym member, following an
instruction from their COACH — a qualified professional reviewing your draft. Apply the
instruction faithfully and precisely.

Rules:
- Change ONLY what the coach asked for. Preserve everything else exactly.
- Never violate a dietary constraint or dislike in the member memory.
- Keep meals concrete and Indian-context.
- If the coach asks for something unsafe, do the closest safe thing and say so in the summary.

Return ONLY a JSON object with EXACTLY this shape:
{
  "summary": string,
  "plan": {
    "protocolSlug": string,
    "dailyTargets": { "kcal": number, "proteinG": number, "carbsG": number, "fatG": number },
    "meals": [ { "name": string, "items": [string, ...] } ],
    "groceryList": [string, ...],
    "adjustment": "increase" | "decrease" | "hold" | "behavior_intervention"
  }
}
"summary" is ONE sentence describing what you changed. Meal items MUST be plain strings.`;

export async function reviseDietPlan(
  llm: LlmProvider,
  input: {
    current: DietPlanPayload;
    instruction: string;
    /** prior coach/AI turns so the model has the thread */
    history?: Array<{ role: "COACH" | "AI"; text: string }>;
    member: { name: string; sex: "M" | "F"; goal: "lose" | "gain" | "maintain"; weightKg: number };
    tdee: number;
    memories: string[];
  },
): Promise<{ payload: DietPlanPayload; summary: string; floorEnforced: boolean }> {
  const { data } = await llm.completeStructured(
    [
      { role: "system", content: REVISE_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          currentPlan: input.current,
          coachInstruction: input.instruction,
          conversationSoFar: input.history ?? [],
          member: input.member,
          tdee: input.tdee,
          memories: input.memories,
        }),
      },
    ],
    RevisedDietSchema,
    { task: "reasoning" },
  );

  // The adherence gate's verdict is derived from logged behaviour, not opinion —
  // a chat instruction cannot flip it.
  data.plan.adjustment = input.current.adjustment;

  // Hard safety floor re-applies after every revision.
  const floor = enforceCalorieFloor(data.plan.dailyTargets.kcal, input.member.sex);
  if (floor.violated) data.plan.dailyTargets.kcal = floor.clampedKcal;

  return { payload: data.plan, summary: data.summary, floorEnforced: floor.violated };
}

// ── Protocol selection ───────────────────────────────────────────────────────
export interface ProtocolCandidate {
  slug: string;
  name: string;
  summary: string;
  science: unknown;
}

const ProtocolChoiceSchema = z.object({
  slug: z.string(),
  rationale: z.string(),
});

const SELECT_SYSTEM = `You are a nutrition coach selecting ONE diet protocol from a provided library
for a member. Choose the single best fit for their goal, adherence, and state.

Return ONLY a JSON object with EXACTLY this shape:
{ "slug": string, "rationale": string }
where "slug" is EXACTLY one of the candidate slugs, and "rationale" is one sentence.`;

/**
 * Pick a diet protocol from the (versioned) library. The AI selects and explains;
 * it never invents a protocol. Falls back to a deterministic rule if the LLM
 * returns an unknown slug or errors.
 */
export async function selectDietProtocol(
  llm: LlmProvider,
  input: {
    member: { goal: "lose" | "gain" | "maintain"; adherent: boolean };
    candidates: ProtocolCandidate[];
  },
): Promise<{ slug: string; rationale: string }> {
  const slugs = new Set(input.candidates.map((c) => c.slug));
  const fallback = () => heuristicProtocol(input.member.goal, slugs);

  if (input.candidates.length === 0) {
    return { slug: "maintenance", rationale: "No library available; defaulting to maintenance." };
  }

  try {
    const { data } = await llm.completeStructured(
      [
        { role: "system", content: SELECT_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            member: input.member,
            candidates: input.candidates.map((c) => ({
              slug: c.slug,
              name: c.name,
              summary: c.summary,
              science: c.science,
            })),
          }),
        },
      ],
      ProtocolChoiceSchema,
      { task: "reasoning" },
    );
    if (slugs.has(data.slug)) return data;
    return { slug: fallback(), rationale: data.rationale };
  } catch {
    return { slug: fallback(), rationale: "Selected by rule (LLM unavailable)." };
  }
}

function heuristicProtocol(
  goal: "lose" | "gain" | "maintain",
  slugs: Set<string>,
): string {
  const prefer = (list: string[]) => list.find((s) => slugs.has(s));
  if (goal === "lose") return prefer(["mini-cut", "maintenance"]) ?? [...slugs][0]!;
  if (goal === "gain") return prefer(["reverse-diet", "maintenance"]) ?? [...slugs][0]!;
  return prefer(["maintenance"]) ?? [...slugs][0]!;
}

// ── Note parsing (free-form → structured adjustments) ────────────────────────
const NOTE_SYSTEM = `You turn a gym member's plain-language note into structured plan adjustments.
Real life doesn't fit forms — this is where it gets translated.

Return ONLY a JSON object with EXACTLY this shape:
{
  "sentiment": "positive" | "neutral" | "stressed" | "negative",
  "adjustments": [ { "kind": "softer_targets" | "cheaper_food" | "surplus_day" | "travel_mode" | "other",
                     "detail": string } ],
  "eventDetected": { "type": "wedding" | "travel" | "holiday" | "competition" | "other",
                     "whenHint": string }   // OMIT this key entirely if no event is mentioned
}

Choosing "kind":
- softer_targets — stressed, sleeping badly, low motivation, busy
- cheaper_food   — money is tight this month
- surplus_day    — a celebration they want to enjoy
- travel_mode    — away from their normal kitchen
- other          — anything else

"whenHint" copies the member's own words for timing ("Saturday", "next week", "on the 14th").

Examples:
Note: "stressed this week, sleeping badly"
{"sentiment":"stressed","adjustments":[{"kind":"softer_targets","detail":"Ease targets while stress and sleep are poor"}]}

Note: "wedding on Saturday, want to enjoy it"
{"sentiment":"positive","adjustments":[{"kind":"surplus_day","detail":"Plan a surplus day around the wedding"}],"eventDetected":{"type":"wedding","whenHint":"Saturday"}}

Note: "travelling to Delhi next week for work"
{"sentiment":"neutral","adjustments":[{"kind":"travel_mode","detail":"Portable, restaurant-friendly options while travelling"}],"eventDetected":{"type":"travel","whenHint":"next week"}}`;

export async function parseNote(llm: LlmProvider, text: string): Promise<NoteParse> {
  const { data } = await llm.completeStructured(
    [
      { role: "system", content: NOTE_SYSTEM },
      { role: "user", content: `Note: "${text}"` },
    ],
    NoteParseSchema,
    { task: "fast" },
  );
  return data;
}

// ── Render a plan into a member-facing WhatsApp message ──────────────────────
export function renderDietPlanText(
  payload: DietPlanPayload,
  memberName: string,
): string {
  const t = payload.dailyTargets;
  const lines: string[] = [];
  lines.push(`🥗 *Your KEYSTONE plan${memberName ? `, ${memberName}` : ""}*`);
  lines.push(`Protocol: ${payload.protocolSlug}`);
  lines.push(`Daily target: *${t.kcal} kcal* · P ${t.proteinG}g · C ${t.carbsG}g · F ${t.fatG}g`);
  lines.push("");
  for (const meal of payload.meals) {
    lines.push(`*${meal.name}*`);
    for (const item of meal.items) lines.push(`  • ${item}`);
  }
  if (payload.groceryList.length) {
    lines.push("");
    lines.push("🛒 *Grocery list*");
    lines.push(payload.groceryList.map((g) => `  • ${g}`).join("\n"));
  }
  if (payload.adjustment === "behavior_intervention") {
    lines.push("");
    lines.push("_Your coach will check in with you this week._");
  }
  return lines.join("\n");
}

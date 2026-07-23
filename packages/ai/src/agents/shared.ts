import { ENGINES, type EngineId } from "@keystone/core";

// ── What every engine's agent shares ─────────────────────────────────────────
// The action vocabulary and output contract are common; the SCOPE, VOICE and
// CAPABILITIES are what make each engine its own product.

/** Everything an agent knows about the member when it answers. */
export interface MemberContext {
  name: string;
  goal: string;
  tier: string;
  currentStreak: number;
  /** individualized TDEE when the Metabolic Twin has enough data */
  tdee?: number | null;
  usesRegression?: boolean;
  todaysMeals?: Array<{ name: string; items: string[] }>;
  dailyTargets?: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  todaysSession?: { day: string; focus: string; intensity: string; exercises: string[] } | null;
  deload?: boolean;
  memories: string[];
  injuries: string[];
  upcomingEvent?: string | null;
  cravingWindows?: string[];
  recentWeightKg?: number | null;
  gymFacts?: string | null;
  membership?: { status: string; renewalDate?: string | null } | null;
}

/** One engine's agent: who it is, what it may do, and how it opens. */
export interface AgentDefinition {
  engine: EngineId;
  /** the engine-specific half of the system prompt */
  persona: string;
  /** blank-box killers, tailored to what the app already knows about today */
  openers: (ctx: MemberContext) => string[];
}

const ACTION_SPECS: Record<string, string> = {
  log_weight: `log_weight        {"weightKg": number}                     "I'm 81.2 today"`,
  log_food: `log_food          {"description": string, "kcal": number?}  "had 2 rotis and dal"`,
  log_workout: `log_workout       {"rpe": number?, "notes": string?}         "session felt brutal"`,
  log_sleep: `log_sleep         {"hours": number}                         "slept 5 hours"`,
  log_checkin: `log_checkin       {"mood": string?, "soreness": number?}`,
  log_craving: `log_craving       {"craving": string}                       "dying for chocolate"`,
  flag_injury: `flag_injury       {"region": string, "detail": string}      ANY pain or niggle`,
  add_note: `add_note          {"text": string}                          life context worth keeping`,
  set_event: `set_event         {"type": "wedding"|"travel"|"holiday"|"competition"|"other", "whenHint": string}`,
  request_plan_change: `request_plan_change {"what": string}                     they want the plan altered`,
  ask_coach: `ask_coach         {"question": string}                      needs their human coach`,
};

/**
 * Build the shared half of the system prompt for one engine. The action list is
 * generated from that engine's capabilities, so an agent is never even told
 * about actions it isn't allowed to perform.
 */
export function sharedRules(engine: EngineId): string {
  const brand = ENGINES[engine];
  const actions = brand.allowedActions
    .map((a) => `- ${ACTION_SPECS[a] ?? a}`)
    .join("\n");
  const handOffs = brand.handsOff
    .map((h) => `- ${h.topic} → hand to ${ENGINES[h.to].name} (${ENGINES[h.to].domain})`)
    .join("\n");

  return `
YOU ARE ${brand.name.toUpperCase()} — the ${brand.domain.toLowerCase()} engine.
You own ONLY:
${brand.scope.map((s) => `- ${s}`).join("\n")}

NOT YOURS — say so briefly and point them at the right coach:
${handOffs}

ACTIONS — you don't just reply, you record things. Emit one whenever the member
tells you something worth keeping. These are the ONLY actions you may use:
${actions}

Rules:
- "label" is what the member sees confirming it, e.g. "Logged 81.2kg".
- Only emit an action if the member actually said it. Never invent data.
${brand.allowedActions.includes("flag_injury") ? "- ALWAYS flag_injury on any mention of pain, and set escalate=true.\n" : ""}- Set escalate=true for anything medical, distressing, a complaint, or a
  membership/billing exception — tell them you're bringing their coach in.
- Never give medical advice or promise refunds, cancellations or price changes.
- 2-4 sentences. Warm, specific, practical. No lectures. Use their name sometimes.
- "suggestions": 2-3 short tappable follow-ups, under 6 words each.

Return ONLY JSON:
{"reply": string, "actions": [{"type": string, "payload": object, "label": string}],
 "suggestions": [string], "escalate": boolean, "escalateReason": string?}`;
}

export function contextBlock(ctx: MemberContext): string {
  return JSON.stringify({
    member: {
      name: ctx.name,
      goal: ctx.goal,
      tier: ctx.tier,
      streak: ctx.currentStreak,
      recentWeightKg: ctx.recentWeightKg,
    },
    calories: ctx.tdee
      ? { tdee: ctx.tdee, basis: ctx.usesRegression ? "measured from their own logs" : "population formula" }
      : null,
    todaysTargets: ctx.dailyTargets ?? null,
    todaysMeals: ctx.todaysMeals ?? [],
    todaysSession: ctx.todaysSession ?? null,
    deloadWeek: ctx.deload ?? false,
    durableFacts: ctx.memories,
    injuries: ctx.injuries,
    upcomingEvent: ctx.upcomingEvent ?? null,
    knownCravingWindows: ctx.cravingWindows ?? [],
    membership: ctx.membership ?? null,
    gymFacts: ctx.gymFacts ?? null,
  });
}

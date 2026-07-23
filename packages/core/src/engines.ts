import type { AgentActionType } from "./schemas/agent.js";

// ── The three engines ────────────────────────────────────────────────────────
// KEYSTONE is the arch; these are the three stones that carry it. Each is a
// named, independently-scoped product — its own domain, its own vocabulary, and
// its own CAPABILITIES. An engine can only perform the actions listed here, so
// separation is enforced at runtime, not just by convention.
//
//   HEARTH  — where you're fed.      Nutrition.
//   FORGE   — where you're built.    Training.
//   ANCHOR  — what keeps you here.   Retention.

export const ENGINE_IDS = ["hearth", "forge", "anchor"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export interface EngineBrand {
  id: EngineId;
  /** the product name */
  name: string;
  /** what it is, in one plain word for members who don't know the brand */
  domain: string;
  tagline: string;
  emoji: string;
  /** tailwind colour token from the brand palette */
  accent: string;
  /** what this engine owns — used in prompts and in the UI */
  scope: string[];
  /** what it explicitly does NOT own; anything here is handed to a sibling */
  handsOff: Array<{ topic: string; to: EngineId }>;
  /** the ONLY actions this engine may perform */
  allowedActions: AgentActionType[];
}

export const ENGINES: Record<EngineId, EngineBrand> = {
  hearth: {
    id: "hearth",
    name: "Hearth",
    domain: "Nutrition",
    tagline: "Meals, macros, cravings, eating out",
    emoji: "🔥",
    accent: "diet",
    scope: [
      "today's meals and macro targets",
      "food swaps and substitutions",
      "cravings and hunger",
      "eating out, alcohol, travel food",
      "going off plan and getting back on",
    ],
    handsOff: [
      { topic: "sessions, exercises, soreness or load", to: "forge" },
      { topic: "membership, billing, motivation", to: "anchor" },
    ],
    allowedActions: [
      "log_weight",
      "log_food",
      "log_craving",
      "log_checkin",
      "add_note",
      "set_event",
      "request_plan_change",
      "ask_coach",
    ],
  },

  forge: {
    id: "forge",
    name: "Forge",
    domain: "Training",
    tagline: "Sessions, form, load, aches and pains",
    emoji: "⚒️",
    accent: "work",
    scope: [
      "today's session and the week",
      "exercise technique and cues",
      "load, progression and scaling",
      "soreness, niggles and injuries",
      "missed sessions and getting back",
    ],
    handsOff: [
      { topic: "food, macros or cravings", to: "hearth" },
      { topic: "membership, billing, motivation", to: "anchor" },
    ],
    allowedActions: [
      "log_workout",
      "log_sleep",
      "log_checkin",
      "flag_injury",
      "add_note",
      "request_plan_change",
      "ask_coach",
    ],
  },

  anchor: {
    id: "anchor",
    name: "Anchor",
    domain: "Your coach",
    tagline: "Motivation, habits, progress, membership",
    emoji: "⚓",
    accent: "crm",
    scope: [
      "motivation and consistency",
      "streaks, tiers and progress questions",
      "habits when life gets busy",
      "classes, fees, pausing and gym admin",
      "anything the other two don't cover",
    ],
    handsOff: [
      { topic: "food, macros or cravings", to: "hearth" },
      { topic: "sessions, exercises or pain", to: "forge" },
    ],
    allowedActions: [
      "log_weight",
      "log_sleep",
      "log_checkin",
      "add_note",
      "set_event",
      "request_plan_change",
      "ask_coach",
    ],
  },
};

export const ENGINE_LIST: EngineBrand[] = ENGINE_IDS.map((id) => ENGINES[id]);

/**
 * Resolve an engine id, tolerating the pre-branding names still stored on
 * existing conversation threads. Without this, renaming would orphan history.
 */
const LEGACY_ALIASES: Record<string, EngineId> = {
  diet: "hearth",
  nutrition: "hearth",
  training: "forge",
  general: "anchor",
  retention: "anchor",
};

export function resolveEngineId(raw: string | null | undefined): EngineId {
  const v = String(raw ?? "").toLowerCase();
  if ((ENGINE_IDS as readonly string[]).includes(v)) return v as EngineId;
  return LEGACY_ALIASES[v] ?? "anchor";
}

/**
 * Every id a stored row might carry for this engine — the canonical one plus any
 * pre-branding aliases. Querying with this keeps conversation history continuous
 * across the rename instead of silently orphaning it.
 */
export function engineIdAliases(engine: EngineId): string[] {
  const legacy = Object.entries(LEGACY_ALIASES)
    .filter(([, v]) => v === engine)
    .map(([k]) => k);
  return [engine, ...legacy];
}

/** Runtime capability check — the teeth behind the separation. */
export function engineAllows(engine: EngineId, action: AgentActionType): boolean {
  return ENGINES[engine].allowedActions.includes(action);
}

/** Which engine should own a topic, for hand-offs. */
export function engineForTopic(text: string): EngineId | null {
  const t = text.toLowerCase();
  if (/\b(eat|food|meal|macro|calorie|protein|craving|hungry|diet|snack|drink)\b/.test(t)) return "hearth";
  if (/\b(train|workout|session|exercise|squat|bench|deadlift|rep|set|sore|pain|injur|form)\b/.test(t)) return "forge";
  if (/\b(motivat|streak|progress|fee|membership|pause|cancel|class|book)\b/.test(t)) return "anchor";
  return null;
}

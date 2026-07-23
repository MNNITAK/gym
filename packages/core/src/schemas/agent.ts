import { z } from "zod";

// ── Agent output contract ────────────────────────────────────────────────────
// The three engines (see engines.ts) share one member brain and one action
// vocabulary. They don't just talk — they return ACTIONS the app executes, which
// is what makes them agentic rather than chatbots. Every action is validated
// here, and then filtered against the engine's capabilities, before anything
// touches the member's record.

/** Everything an agent is allowed to do to the member's record. */
export const AGENT_ACTION_TYPES = [
  "log_weight",
  "log_food",
  "log_workout",
  "log_sleep",
  "log_checkin",
  "log_craving",
  "flag_injury",
  "add_note",
  "set_event",
  "request_plan_change",
  "ask_coach",
] as const;
export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export const AgentActionSchema = z.object({
  type: z.enum(AGENT_ACTION_TYPES).catch("add_note"),
  /** free-form payload, validated per-type when executed */
  payload: z.record(z.unknown()).default({}),
  /** what the member sees confirming it happened, e.g. "Logged 81.2kg" */
  label: z.string(),
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

export const AgentReplySchema = z.object({
  /** what the coach says back — warm, specific, short */
  reply: z.string(),
  /** things to actually do to the member's record */
  actions: z.array(AgentActionSchema).catch([]).default([]),
  /** tappable follow-ups so the member never faces a blank box */
  suggestions: z.array(z.string()).catch([]).default([]),
  /** set when the member needs a human (medical, complaint, policy exception) */
  escalate: z.boolean().catch(false).default(false),
  escalateReason: z.string().nullish(),
});
export type AgentReply = z.infer<typeof AgentReplySchema>;

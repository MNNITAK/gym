import {
  AgentReplySchema,
  ENGINES,
  engineAllows,
  resolveEngineId,
  screenForSafety,
  MEDICAL_DISCLAIMER,
  type AgentReply,
  type EngineId,
} from "@keystone/core";
import type { LlmProvider } from "../provider.js";
import { hearth } from "./hearth.js";
import { forge } from "./forge.js";
import { anchor } from "./anchor.js";
import { sharedRules, contextBlock, type AgentDefinition, type MemberContext } from "./shared.js";

// ── Engine registry ──────────────────────────────────────────────────────────
// One place that knows all three. Adding a fourth engine means adding a file and
// one line here — nothing else in the app changes.

export const AGENTS: Record<EngineId, AgentDefinition> = { hearth, forge, anchor };

export function agentFor(engine: string): AgentDefinition {
  return AGENTS[resolveEngineId(engine)];
}

/**
 * Run one turn against a named engine.
 *
 * Two guarantees enforced here rather than trusted to the model:
 *  1. Safety screening runs BEFORE the model sees the message.
 *  2. Any action outside the engine's declared capabilities is dropped — Hearth
 *     cannot flag an injury, Forge cannot log food. Separation with teeth.
 */
export async function runEngineAgent(
  llm: LlmProvider,
  input: {
    engine: EngineId | string;
    message: string;
    context: MemberContext;
    history?: Array<{ role: "member" | "coach"; text: string }>;
  },
): Promise<AgentReply & { engine: EngineId }> {
  const engine = resolveEngineId(input.engine);
  const def = AGENTS[engine];
  const brand = ENGINES[engine];

  // Hard safety gate — medical / eating-disorder language never reaches a model.
  const safety = screenForSafety(input.message);
  if (safety.mustEscalate) {
    return {
      engine,
      reply: `Thanks for telling me — I'm bringing your coach in on this rather than answering myself. They'll follow up personally, very soon. ${MEDICAL_DISCLAIMER}`,
      actions: [
        {
          type: "ask_coach",
          payload: { question: input.message, safety: safety.matched.join(",") },
          label: "Flagged to your coach",
        },
      ],
      suggestions: [],
      escalate: true,
      escalateReason: `safety:${safety.matched.join(",")}`,
    };
  }

  const messages = [
    { role: "system" as const, content: `${def.persona}\n${sharedRules(engine)}` },
    { role: "system" as const, content: `MEMBER CONTEXT:\n${contextBlock(input.context)}` },
    ...(input.history ?? []).map((h) => ({
      role: (h.role === "member" ? "user" : "assistant") as "user" | "assistant",
      content: h.text,
    })),
    { role: "user" as const, content: input.message },
  ];

  try {
    const { data } = await llm.completeStructured(messages, AgentReplySchema, { task: "fast" });
    // Capability isolation: silently drop anything this engine may not do.
    const actions = data.actions.filter((a) => engineAllows(engine, a.type));
    return { ...data, actions, engine };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A provider rate limit is operational, not a coaching failure — let it bubble
    // so the caller can say "we're busy" instead of faking an empty answer.
    if (/rate limit|429|too many requests|quota/i.test(message)) throw err;

    // eslint-disable-next-line no-console
    console.error(`[${brand.name}] agent failed:`, message);
    return {
      engine,
      reply: `${brand.name} couldn't think that through just now — give me a moment and try again, or ask your coach directly.`,
      actions: [],
      suggestions: ["Try again", "Ask my coach"],
      escalate: false,
    };
  }
}

/** Opening prompts for an engine, so the member never faces a blank box. */
export function engineOpeners(engine: EngineId | string, ctx: MemberContext): string[] {
  return agentFor(engine).openers(ctx);
}

export type { AgentDefinition, MemberContext };

import { InboundIntentSchema, type InboundIntent, screenForSafety } from "@keystone/core";
import type { LlmProvider } from "../provider.js";

const SYSTEM = `You are the WhatsApp message router for a gym coaching platform.
Classify each member message into exactly one intent:
- "log": the member is recording data (weight, food, a workout, sleep).
- "note": free-form life context ("stressed this week", "wedding Saturday", "trying to save money").
- "concierge": a question about their plan, classes, fees, or membership.
- "ritual": a reply to a daily ritual prompt (e.g. a single weigh-in number).
- "escalate": anything needing a human (complaints, medical, distress).
- "smalltalk": greetings/thanks with no action.
Return JSON only.`;

/**
 * Classify an inbound member message. Safety screening runs FIRST and hard-overrides
 * the model — medical / eating-disorder signals always escalate to a human.
 */
export async function classifyInbound(
  llm: LlmProvider,
  text: string,
): Promise<InboundIntent> {
  const safety = screenForSafety(text);
  if (safety.mustEscalate) {
    return {
      intent: "escalate",
      confidence: 1,
      reason: `safety:${safety.matched.join(",")}`,
    };
  }

  try {
    const { data } = await llm.completeStructured(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
      InboundIntentSchema,
      { task: "fast" },
    );
    return data;
  } catch {
    // Resilient fallback (also the offline/no-key path): heuristic keyword routing.
    return heuristicIntent(text);
  }
}

/** Deterministic keyword router — the safety net when the LLM is unavailable. */
export function heuristicIntent(text: string): InboundIntent {
  const t = text.toLowerCase();
  if (/\b\d{2,3}(\.\d+)?\s?(kg|kgs|kilo)\b/.test(t) || /weigh|logged|ate|calor/.test(t)) {
    return { intent: "log", confidence: 0.5, reason: "heuristic" };
  }
  if (/wedding|travel|holiday|stressed|saving money|budget|busy/.test(t)) {
    return { intent: "note", confidence: 0.5, reason: "heuristic" };
  }
  if (/\?|plan|class|fee|due|pause|cancel|book|when|what|how/.test(t)) {
    return { intent: "concierge", confidence: 0.5, reason: "heuristic" };
  }
  if (/^(hi|hello|hey|thanks|thank you|ok|okay)\b/.test(t)) {
    return { intent: "smalltalk", confidence: 0.5, reason: "heuristic" };
  }
  return { intent: "concierge", confidence: 0.3, reason: "heuristic-default" };
}

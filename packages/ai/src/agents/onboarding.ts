import { z } from "zod";
import {
  ONBOARDING_FIELDS,
  nextField,
  fieldByKey,
  onboardingProgress,
  isOnboardingComplete,
  type OnboardingField,
} from "@keystone/core";
import type { LlmProvider } from "../provider.js";

// ── Onboarding agent ─────────────────────────────────────────────────────────
// The first conversation a member ever has. It collects the 19 things a coach
// needs before writing anyone a plan — one question at a time, acknowledging
// each answer, so it reads as a conversation rather than a form.
//
// The MODEL decides what to say. The ORDER is decided in code (`nextField`), so
// the conversation always terminates and the progress bar is always honest — a
// model left to choose could loop or skip.

export const OnboardingTurnSchema = z.object({
  /** what the coach says back: acknowledge, then ask the next thing */
  reply: z.string(),
  /**
   * Field key → the member's answer in their own words. Usually the field just
   * asked, but a member who says "I'm 32, 5'10 and vegetarian" answers three at
   * once and all three should be captured.
   */
  extracted: z.record(z.string()).catch({}).default({}),
  /** tappable suggestions for quick answers, e.g. ["Vegetarian", "No restrictions"] */
  suggestions: z.array(z.string()).catch([]).default([]),
});
export type OnboardingTurn = z.infer<typeof OnboardingTurnSchema>;

function systemPrompt(field: OnboardingField, remaining: number, name: string): string {
  return `You are KEYSTONE's onboarding coach, talking to ${name} for the very first time.
Your job is to learn about them before their coach writes a plan.

RIGHT NOW you are asking about: **${field.label}** (key "${field.key}").
Suggested phrasing: "${field.ask}"
There are ${remaining} things left after this.

How to behave:
- ONE question per message. Never stack two.
- Briefly acknowledge what they just told you, then ask. Warm, human, unhurried.
- Two or three sentences maximum. This is a chat, not a form.
- If they answered something you didn't ask (e.g. gave age AND height), capture
  BOTH in "extracted" and skip ahead — never make someone repeat themselves.
- If an answer is vague ("a bit overweight"), ask once for the specific number,
  then move on. Do not interrogate.
- "None" / "nothing" is a valid, useful answer to injuries, allergies or medical
  conditions. Record it and move on cheerfully.
- Never give medical advice. If they mention a condition, acknowledge it plainly
  and note that their coach will account for it.
- "suggestions" should offer 2-4 short tappable answers when the question has
  common ones (diet, equipment, fitness level). Leave empty for open questions.

Return ONLY JSON:
{"reply": string, "extracted": {"<fieldKey>": "<their answer>"}, "suggestions": [string]}`;
}

/**
 * Run one turn of onboarding. `collected` is the source of truth for what's
 * already known; the caller persists whatever comes back in `extracted`.
 */
export async function runOnboardingTurn(
  llm: LlmProvider,
  input: {
    memberName: string;
    collected: Record<string, string>;
    /** the member's latest message; absent on the opening turn */
    message?: string;
    history?: Array<{ role: "member" | "coach"; text: string }>;
  },
): Promise<OnboardingTurn & { field: string | null; done: boolean }> {
  const field = nextField(input.collected);

  // Everything required is answered — close the conversation warmly.
  if (!field || isOnboardingComplete({ ...input.collected })) {
    return {
      reply: `That's everything I need, ${input.memberName.split(" ")[0]} — thank you. I've written all of this down, and your coach will use it to build your first plan. Welcome to KEYSTONE.`,
      extracted: {},
      suggestions: [],
      field: null,
      done: true,
    };
  }

  const { total, answered } = onboardingProgress(input.collected);
  const messages = [
    { role: "system" as const, content: systemPrompt(field, total - answered - 1, input.memberName) },
    {
      role: "system" as const,
      content: `ALREADY KNOWN (do not ask again):\n${
        Object.entries(input.collected)
          .map(([k, v]) => `- ${fieldByKey(k)?.label ?? k}: ${v}`)
          .join("\n") || "(nothing yet — this is the first question)"
      }`,
    },
    ...(input.history ?? []).slice(-8).map((h) => ({
      role: (h.role === "member" ? "user" : "assistant") as "user" | "assistant",
      content: h.text,
    })),
    ...(input.message ? [{ role: "user" as const, content: input.message }] : []),
  ];

  try {
    const { data } = await llm.completeStructured(messages, OnboardingTurnSchema, { task: "fast" });
    // Only keep keys we actually asked for — a model can invent field names.
    const extracted: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.extracted)) {
      if (fieldByKey(k) && String(v).trim()) extracted[k] = String(v).trim();
    }
    // If the member clearly answered but the model extracted nothing, take their
    // words at face value rather than asking the same question twice.
    if (input.message?.trim() && Object.keys(extracted).length === 0) {
      extracted[field.key] = input.message.trim();
    }
    return { ...data, extracted, field: field.key, done: false };
  } catch {
    // Degrade to the scripted question rather than stalling onboarding.
    const fallback: Record<string, string> = {};
    if (input.message?.trim()) fallback[field.key] = input.message.trim();
    return {
      reply: field.ask,
      extracted: fallback,
      suggestions: [],
      field: field.key,
      done: false,
    };
  }
}

/** The opening message, before the member has said anything. */
export function onboardingGreeting(memberName: string): string {
  const first = memberName.split(" ")[0] ?? memberName;
  return `Hi ${first} — I'm your KEYSTONE coach. Before I hand you to your trainer, I'd like to get to know you a bit. It takes two minutes and it's what makes everything after this genuinely yours rather than generic.\n\n${ONBOARDING_FIELDS[0]!.ask}`;
}

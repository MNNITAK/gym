import {
  MemoryExtractionSchema,
  type MemoryExtraction,
  ConciergeAnswerSchema,
  type ConciergeAnswer,
  WinMessageSchema,
  screenForSafety,
} from "@keystone/core";
import type { LlmProvider } from "../provider.js";

// ── Memory extraction (IP candidate #4 — the compounding switching cost) ──────
const EXTRACT_SYSTEM = `You extract DURABLE facts about a gym member from their recent messages,
to remember across future conversations. Only extract stable facts a coach would
want to recall: food preferences/dislikes, dietary constraints, injuries, recurring
life events, equipment access, and what motivates them. Ignore transient chatter.

Return ONLY JSON:
{ "memories": [ { "kind": "PREFERENCE"|"CONSTRAINT"|"INJURY"|"LIFE_EVENT"|"MOTIVATION"|"OTHER",
                  "key": string, "value": string, "confidence": number } ] }
"key" is a short slug (e.g. "dislikes", "injury.knee", "motivation"). Empty array if nothing durable.`;

/**
 * Extract durable member-memory facts from recent conversation text. Best-effort:
 * returns an empty extraction on any model/parse failure so the pipeline never blocks.
 */
export async function extractMemories(
  llm: LlmProvider,
  recentText: string,
): Promise<MemoryExtraction> {
  try {
    const { data } = await llm.completeStructured(
      [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: recentText },
      ],
      MemoryExtractionSchema,
      { task: "fast" },
    );
    return data;
  } catch {
    return { memories: [] };
  }
}

// ── Concierge bot (24/7 member Q&A, escalates judgment cases) ─────────────────
const CONCIERGE_SYSTEM = `You are the 24/7 concierge for a gym, answering members over WhatsApp in
English or Hindi (match the member's language). You may answer routine questions about
their plan, class times, fees, and membership using the provided context. If the question
needs a human judgment call, a policy exception, a complaint, or anything you are unsure of,
set needsEscalation=true and give a short holding reply — do NOT invent facts.

Return ONLY JSON:
{ "answer": string, "language": "en"|"hi", "needsEscalation": boolean, "escalationReason": string (optional) }`;

/**
 * Answer a member's concierge question with member-brain context. Safety screening
 * runs first and hard-forces escalation for medical/ED signals. On any failure it
 * escalates (fail-safe) rather than guessing.
 */
export async function answerConcierge(
  llm: LlmProvider,
  input: {
    question: string;
    memberName: string;
    memories: string[];
    planSummary?: string;
    gymFacts?: string;
  },
): Promise<ConciergeAnswer> {
  const safety = screenForSafety(input.question);
  if (safety.mustEscalate) {
    return {
      answer: "Thanks for reaching out — a coach will follow up with you personally very soon.",
      language: "en",
      needsEscalation: true,
      escalationReason: `safety:${safety.matched.join(",")}`,
    };
  }

  try {
    const { data } = await llm.completeStructured(
      [
        { role: "system", content: CONCIERGE_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            question: input.question,
            member: input.memberName,
            memories: input.memories,
            planSummary: input.planSummary ?? null,
            gymFacts: input.gymFacts ?? null,
          }),
        },
      ],
      ConciergeAnswerSchema,
      { task: "fast" },
    );
    return data;
  } catch {
    return {
      answer: "Let me check on that and get back to you shortly.",
      language: "en",
      needsEscalation: true,
      escalationReason: "concierge_unavailable",
    };
  }
}

// ── "Send a win" (milestone → coach-sent congratulations draft) ──────────────
const WIN_SYSTEM = `Write a short, warm, specific WhatsApp congratulations a gym COACH will personally
send a member for a milestone. One or two sentences, no emojis overload (at most one),
genuine not salesy. Return ONLY JSON: { "message": string }`;

export async function draftWinMessage(
  llm: LlmProvider,
  input: { memberName: string; milestoneTitle: string },
): Promise<string> {
  try {
    const { data } = await llm.completeStructured(
      [
        { role: "system", content: WIN_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({ member: input.memberName, milestone: input.milestoneTitle }),
        },
      ],
      WinMessageSchema,
      { task: "fast" },
    );
    return data.message;
  } catch {
    // Deterministic fallback keeps "send a win" working with no key.
    return `Huge congrats ${input.memberName} — ${input.milestoneTitle}! Proud of the work you're putting in. 💪`;
  }
}

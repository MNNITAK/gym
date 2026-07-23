import { z } from "zod";
import {
  TrainingPlanPayloadSchema,
  type TrainingPlanPayload,
  ProtocolChoiceSchema,
  decideFatigue,
  type FatigueInput,
  type FatigueDecision,
} from "@keystone/core";
import type { LlmProvider } from "../provider.js";

// ── Protocol selection ───────────────────────────────────────────────────────
export interface TrainingProtocolCandidate {
  slug: string;
  name: string;
  summary: string;
  science: unknown;
}

const SELECT_SYSTEM = `You are a strength & conditioning coach selecting ONE training protocol
from a provided library for a member. Choose the single best fit for their goal,
experience, available days, and any event they are training toward.

Return ONLY a JSON object with EXACTLY this shape:
{ "slug": string, "rationale": string }
where "slug" is EXACTLY one of the candidate slugs, and "rationale" is one sentence.`;

export async function selectTrainingProtocol(
  llm: LlmProvider,
  input: {
    member: { goal: "lose" | "gain" | "maintain"; experience: "novice" | "intermediate" | "advanced"; daysPerWeek: number; eventDate?: string };
    candidates: TrainingProtocolCandidate[];
  },
): Promise<{ slug: string; rationale: string }> {
  const slugs = new Set(input.candidates.map((c) => c.slug));
  const fallback = () => heuristicTrainingProtocol(input.member, slugs);

  if (input.candidates.length === 0) {
    return { slug: "full-body", rationale: "No library available; defaulting to full-body." };
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

export function heuristicTrainingProtocol(
  member: { goal: "lose" | "gain" | "maintain"; experience: "novice" | "intermediate" | "advanced"; daysPerWeek: number; eventDate?: string },
  slugs: Set<string>,
): string {
  const prefer = (list: string[]) => list.find((s) => slugs.has(s));
  if (member.eventDate) return prefer(["hyrox-prep", "ppl"]) ?? [...slugs][0]!;
  if (member.experience === "novice") return prefer(["stronglifts-5x5", "full-body"]) ?? [...slugs][0]!;
  if (member.daysPerWeek >= 5) return prefer(["ppl"]) ?? [...slugs][0]!;
  return prefer(["upper-lower", "ppl", "stronglifts-5x5"]) ?? [...slugs][0]!;
}

// ── Plan drafting ────────────────────────────────────────────────────────────
export interface TrainingDraftInput {
  member: {
    name: string;
    goal: "lose" | "gain" | "maintain";
    experience: "novice" | "intermediate" | "advanced";
    daysPerWeek: number;
  };
  protocol: { slug: string; name: string; summary: string; science: unknown };
  /** durable member memory (dislikes, equipment access…) */
  memories: string[];
  /** injured regions to program around (from injury screening) */
  injuredRegions: string[];
  /** fatigue signals — drives a FORCED deload the model cannot override */
  fatigue: FatigueInput;
  eventTargetDate?: string;
  /** auto-progression verdicts from logged sets — the model must use these loads */
  prescribedLoads?: Array<{ exercise: string; loadKg: number }>;
}

const SYSTEM = `You are a strength & conditioning coach generating ONE week of training for a gym member.
Rules:
- Respect the selected protocol and the member's experience and available days.
- Program AROUND every injured region — substitute safe movements, never load a painful joint.
- Honor equipment/access constraints in the member memory.
- Every exercise MUST include a regression (easier option) and progression (harder option).
- If a deload is indicated, reduce volume/intensity across the week.

Return ONLY a JSON object with EXACTLY this shape (keys and types):
{
  "protocolSlug": string,
  "daysPerWeek": number,
  "week": [
    { "day": string, "focus": string, "intensity": "low"|"moderate"|"high", "time": "HH:MM (24h clock START time, e.g. 18:00 — NOT the duration)",
      "exercises": [
        { "name": string, "sets": number, "reps": string,
          "targetRpe": number, "regression": string, "progression": string }
      ] }
  ],
  "deload": boolean,
  "eventTargetDate": string (optional)
}
Do not add other top-level keys.`;

/**
 * Draft a week of training. The Fatigue Guardian decides deload BEFORE generation
 * and its verdict is FORCED onto the payload — the model never overrides a deload.
 */
export async function draftTrainingPlan(
  llm: LlmProvider,
  input: TrainingDraftInput,
): Promise<{ payload: TrainingPlanPayload; fatigue: FatigueDecision }> {
  const fatigue = decideFatigue(input.fatigue);

  const user = JSON.stringify({
    member: input.member,
    protocol: input.protocol,
    memories: input.memories,
    injuredRegions: input.injuredRegions,
    forcedDeload: fatigue.deload,
    deloadReasons: fatigue.reasons,
    eventTargetDate: input.eventTargetDate,
    // Loads already decided from logged sets — use these exactly, don't re-derive.
    prescribedLoads: input.prescribedLoads ?? [],
  });

  const { data } = await llm.completeStructured(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    TrainingPlanPayloadSchema,
    { task: "reasoning" },
  );

  // Force the Fatigue Guardian's verdict — safety over the model's preference.
  data.deload = fatigue.deload;
  if (fatigue.deload) {
    for (const d of data.week) {
      if (d.intensity === "high") d.intensity = "moderate";
    }
  }
  if (input.eventTargetDate && !data.eventTargetDate) {
    data.eventTargetDate = input.eventTargetDate;
  }

  return { payload: data, fatigue };
}

// ── Coach-directed revision ──────────────────────────────────────────────────
// The coach reshapes the week in plain language. The Fatigue Guardian's deload
// verdict re-applies afterwards — no instruction can train through a forced deload.

const RevisedTrainingSchema = z.object({
  summary: z.string(),
  plan: TrainingPlanPayloadSchema,
});

const REVISE_SYSTEM = `You are revising an existing week of training for a gym member, following an
instruction from their COACH — a qualified professional reviewing your draft. Apply the
instruction faithfully and precisely.

Rules:
- Change ONLY what the coach asked for. Preserve everything else exactly.
- Never load an injured region; substitute a safe movement instead.
- Every exercise keeps a regression (easier) and progression (harder) option.
- If the coach asks for something unsafe, do the closest safe thing and say so in the summary.

Return ONLY a JSON object with EXACTLY this shape:
{
  "summary": string,
  "plan": {
    "protocolSlug": string,
    "daysPerWeek": number,
    "week": [ { "day": string, "focus": string, "intensity": "low"|"moderate"|"high", "time": "HH:MM (24h clock START time, e.g. 18:00 — NOT the duration)",
                "exercises": [ { "name": string, "sets": number, "reps": string,
                                 "targetRpe": number, "regression": string, "progression": string } ] } ],
    "deload": boolean
  }
}
"summary" is ONE sentence describing what you changed.`;

export async function reviseTrainingPlan(
  llm: LlmProvider,
  input: {
    current: TrainingPlanPayload;
    instruction: string;
    history?: Array<{ role: "COACH" | "AI"; text: string }>;
    member: { name: string; goal: "lose" | "gain" | "maintain"; experience: "novice" | "intermediate" | "advanced" };
    memories: string[];
    injuredRegions: string[];
  },
): Promise<{ payload: TrainingPlanPayload; summary: string }> {
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
          memories: input.memories,
          injuredRegions: input.injuredRegions,
        }),
      },
    ],
    RevisedTrainingSchema,
    { task: "reasoning" },
  );

  // The Fatigue Guardian's verdict came from recovery data, not opinion — keep it.
  data.plan.deload = input.current.deload;
  if (data.plan.deload) {
    for (const d of data.plan.week) if (d.intensity === "high") d.intensity = "moderate";
  }

  return { payload: data.plan, summary: data.summary };
}

// ── Render a plan into a member-facing WhatsApp message ──────────────────────
export function renderTrainingPlanText(
  payload: TrainingPlanPayload,
  memberName: string,
): string {
  const lines: string[] = [];
  lines.push(`🏋️ *Your KEYSTONE training week${memberName ? `, ${memberName}` : ""}*`);
  lines.push(`Protocol: ${payload.protocolSlug} · ${payload.daysPerWeek} days/week`);
  if (payload.deload) lines.push("⚠️ *Deload week* — recover, don't chase PRs.");
  if (payload.eventTargetDate) lines.push(`🎯 Peaking for: ${payload.eventTargetDate}`);
  lines.push("");
  for (const day of payload.week) {
    lines.push(`*${day.day} — ${day.focus}* (${day.intensity})`);
    for (const ex of day.exercises) {
      const rpe = ex.targetRpe ? ` @RPE ${ex.targetRpe}` : "";
      lines.push(`  • ${ex.name}: ${ex.sets}×${ex.reps}${rpe}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

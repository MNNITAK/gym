import { z } from "zod";

// ── Inbound message routing (WhatsApp gateway → engine) ──────────────────────
export const InboundIntentSchema = z.object({
  intent: z.enum(["concierge", "log", "note", "escalate", "ritual", "smalltalk"]),
  confidence: z.number().min(0).max(1),
  // Structured extraction when intent is "log" (e.g. a weigh-in or workout)
  extracted: z.record(z.unknown()).nullish(),
  reason: z.string().nullish(),
});
export type InboundIntent = z.infer<typeof InboundIntentSchema>;

// ── Note parsing (free-form Note → structured adjustments) ───────────────────
// Models routinely return sensible-but-off-enum labels ("calorie", "sugar").
// Every enum here is `.catch`-guarded so one unexpected label can't throw away
// the whole parse — a strict enum silently disabled this entire feature before.
export const NoteParseSchema = z.object({
  sentiment: z
    .enum(["positive", "neutral", "stressed", "negative"])
    .catch("neutral"),
  adjustments: z
    .array(
      z.object({
        kind: z
          .enum(["softer_targets", "cheaper_food", "surplus_day", "travel_mode", "other"])
          .catch("other"),
        detail: z.string(),
      }),
    )
    .catch([])
    .default([]),
  eventDetected: z
    .object({
      type: z
        .enum(["wedding", "travel", "holiday", "competition", "other"])
        .catch("other"),
      whenHint: z.string().nullish(),
    })
    .nullish()
    .catch(undefined),
});
export type NoteParse = z.infer<typeof NoteParseSchema>;

// ── Memory extraction (conversation → durable facts). IP candidate #4. ────────
export const MemoryExtractionSchema = z.object({
  memories: z
    .array(
      z.object({
        kind: z.enum([
          "PREFERENCE",
          "CONSTRAINT",
          "INJURY",
          "LIFE_EVENT",
          "MOTIVATION",
          "OTHER",
        ]),
        key: z.string(),
        value: z.string(),
        confidence: z.number().min(0).max(1).default(0.7),
      }),
    )
    .default([]),
});
export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;

// ── Concierge answer (24/7 bot). May escalate to staff. ──────────────────────
export const ConciergeAnswerSchema = z.object({
  answer: z.string(),
  language: z.enum(["en", "hi"]).default("en"),
  needsEscalation: z.boolean().default(false),
  escalationReason: z.string().nullish(),
});
export type ConciergeAnswer = z.infer<typeof ConciergeAnswerSchema>;

// ── Protocol selection (shared by Diet + Training engines) ────────────────────
export const ProtocolChoiceSchema = z.object({
  slug: z.string(),
  rationale: z.string(),
});
export type ProtocolChoice = z.infer<typeof ProtocolChoiceSchema>;

// ── "Send a win" (milestone → coach-sent congratulations draft) ──────────────
export const WinMessageSchema = z.object({
  message: z.string(),
});
export type WinMessage = z.infer<typeof WinMessageSchema>;

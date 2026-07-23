import { z } from "zod";

// Shape of a generated Diet plan payload. LLM output is validated against this
// before it can ever enter the coach-approval pipeline.
export const MacroTargetsSchema = z.object({
  kcal: z.number().positive(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
});

// LLMs return meal items as either plain strings or objects like
// { name, quantity }. Coerce both to a single display string.
export const MealItemSchema = z.union([
  z.string(),
  z
    .object({})
    .passthrough()
    .transform((o) => {
      const r = o as Record<string, unknown>;
      const name = (r.name ?? r.item ?? r.food ?? r.ingredient ?? "") as string;
      const qty = (r.quantity ?? r.qty ?? r.amount ?? r.portion ?? "") as string;
      const s = [String(qty), String(name)].filter(Boolean).join(" ").trim();
      return s || JSON.stringify(o);
    }),
]);

export const MealSchema = z.object({
  name: z.string(),
  items: z.array(MealItemSchema).min(1),
  macros: MacroTargetsSchema.partial().nullish(),
});

// Cross-engine calorie coupling (IP candidate #2): per-day macro targets derived
// from the coupled training day's intensity. Filled in deterministically by the
// engine AFTER generation — never by the model.
export const CoupledDaySchema = z.object({
  day: z.string(),
  intensity: z.enum(["rest", "low", "moderate", "high"]),
  focus: z.string().nullish(),
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});

export const DietPlanPayloadSchema = z.object({
  protocolSlug: z.string(),
  dailyTargets: MacroTargetsSchema,
  meals: z.array(MealSchema).min(1),
  groceryList: z.array(z.string()).default([]),
  /** set by the engine when a coupled training plan exists */
  coupledDays: z.array(CoupledDaySchema).optional(),
  // Adherence-first logic surfaces here: whether this generation adjusted numbers
  // or deferred to a coach behavior conversation instead.
  adjustment: z
    .enum(["increase", "decrease", "hold", "behavior_intervention"])
    .default("hold"),
  notesApplied: z.array(z.string()).default([]),
});

export type MacroTargets = z.infer<typeof MacroTargetsSchema>;
export type DietPlanPayload = z.infer<typeof DietPlanPayloadSchema>;

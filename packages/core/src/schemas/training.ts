import { z } from "zod";

export const ExerciseSchema = z.object({
  name: z.string(),
  sets: z.number().int().positive(),
  reps: z.string(), // "5" or "8-12" or "AMRAP"
  targetRpe: z.number().min(1).max(10).nullish(),
  loadKg: z.number().nonnegative().nullish(),
  // Movement library: what to do if the member can't perform the movement
  regression: z.string().nullish(),
  progression: z.string().nullish(),
});

export const TrainingDaySchema = z.object({
  day: z.string(), // "Mon" | "Day 1"
  focus: z.string(), // "Push", "Lower", "Conditioning"
  intensity: z.enum(["low", "moderate", "high"]).default("moderate"),
  exercises: z.array(ExerciseSchema).min(1),
});

export const TrainingPlanPayloadSchema = z.object({
  protocolSlug: z.string(),
  daysPerWeek: z.number().int().min(1).max(7),
  week: z.array(TrainingDaySchema).min(1),
  // Fatigue Guardian output: whether this week is a forced deload
  deload: z.boolean().default(false),
  eventTargetDate: z.string().nullish(), // hybrid athlete / Hyrox peaking
});

export type TrainingPlanPayload = z.infer<typeof TrainingPlanPayloadSchema>;

import { repos } from "@keystone/db";
import {
  estimateMetabolicTwin,
  mifflinStJeorTdee,
  type DailyEnergyLog,
} from "@keystone/core";

/**
 * Recompute a member's Metabolic Twin (IP #3) from their rolling logs.
 * Pairs INTAKE (kcal) and WEIGHT (kg) logs by day, then regresses.
 */
export async function recomputeMetabolicTwin(memberId: string): Promise<void> {
  const member = await repos.members.get(memberId);
  if (!member) return;

  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 42); // 6-week window
  const logs = await repos.logs.listByMemberTypesSince(
    memberId,
    ["INTAKE", "WEIGHT"],
    since,
  );

  // Bucket by calendar day.
  const byDay = new Map<string, { intake?: number; weight?: number; date: Date }>();
  for (const log of logs) {
    const day = log.loggedFor.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { date: log.loggedFor };
    const payload = log.payload as Record<string, unknown>;
    if (log.type === "INTAKE" && typeof payload.kcal === "number") {
      bucket.intake = payload.kcal;
    }
    if (log.type === "WEIGHT" && typeof payload.weightKg === "number") {
      bucket.weight = payload.weightKg;
    }
    byDay.set(day, bucket);
  }

  const daily: DailyEnergyLog[] = [];
  for (const b of byDay.values()) {
    if (b.intake != null && b.weight != null) {
      daily.push({ date: b.date, intakeKcal: b.intake, weightKg: b.weight });
    }
  }

  const age = member.dateOfBirth
    ? Math.floor(
        (Date.now() - member.dateOfBirth.getTime()) /
          (1000 * 60 * 60 * 24 * 365),
      )
    : 30;
  const formulaTdee = mifflinStJeorTdee({
    sex: member.sex === "F" ? "F" : "M",
    weightKg: member.startWeightKg ?? 75,
    heightCm: member.heightCm ?? 170,
    age,
  });

  const est = estimateMetabolicTwin(daily, formulaTdee);

  await repos.metabolicTwins.create({
    gymId: member.gymId,
    memberId,
    computedTdee: est.computedTdee,
    formulaTdee: est.formulaTdee,
    usesRegression: est.usesRegression,
    confidence: est.confidence,
    sampleDays: est.sampleDays,
    regression: est.regression ?? null,
    computedAt: new Date(),
  });
}

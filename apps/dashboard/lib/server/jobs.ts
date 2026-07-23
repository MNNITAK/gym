// The recurring engine work that IS the moat — metabolic recompute, churn scoring,
// memory extraction, ritual dispatch, win detection, cross-gym aggregation.
//
// These ran on BullMQ/Redis in the worker app. For the serverless deployment they
// run inline here, invoked on demand from the console or on a schedule by Vercel
// Cron. Same deterministic logic, no queue infrastructure.
import {
  estimateMetabolicTwin,
  mifflinStJeorTdee,
  scoreChurn,
  estimateSentiment,
  detectMilestones,
  computeTier,
  buildRenewalNudge,
  TIER_PERKS,
  aggregatePatterns,
  assertNoPii,
  type ChurnFeatures,
  type DailyEnergyLog,
  type PatternObservation,
} from "@keystone/core";
import { extractMemories, draftWinMessage } from "@keystone/ai";
import { repos } from "@keystone/db";
import { llm, whatsapp } from "./clients";
import { mapGoal, generateDietPlan, generateTrainingPlan } from "./engines";

export type JobName =
  | "metabolic"
  | "churn"
  | "memory"
  | "rituals"
  | "wins"
  | "patterns"
  | "tiers"
  | "plans"
  | "renewals";

export const ALL_JOBS: JobName[] = [
  "metabolic",
  "churn",
  "memory",
  "rituals",
  "wins",
  "tiers",
  "plans",
  "renewals",
  "patterns",
];

/** Run the named jobs across every active member. Returns a per-job summary. */
export async function runJobs(names: JobName[] = ALL_JOBS) {
  const members = await repos.members.listActive();
  const summary: Record<string, number> = {};

  for (const name of names) {
    switch (name) {
      case "metabolic":
        for (const m of members) await recomputeMetabolicTwin(m.id);
        summary.metabolic = members.length;
        break;
      case "churn":
        for (const m of members) await scoreMemberChurn(m.id);
        summary.churn = members.length;
        break;
      case "memory":
        for (const m of members) await extractMemberMemory(m.id);
        summary.memory = members.length;
        break;
      case "rituals":
        summary.rituals = await dispatchRituals(members.map((m) => m.gymId));
        break;
      case "wins": {
        let drafted = 0;
        for (const m of members) drafted += await scanMemberWins(m.id);
        summary.wins = drafted;
        break;
      }
      case "tiers": {
        let moved = 0;
        for (const m of members) moved += await recomputeTier(m.id);
        summary.tiers = moved;
        break;
      }
      case "plans": {
        let drafted = 0;
        for (const m of members) drafted += await autoDraftPlans(m.id);
        summary.plans = drafted;
        break;
      }
      case "renewals": {
        let sent = 0;
        for (const m of members) sent += await draftRenewalNudge(m.id);
        summary.renewals = sent;
        break;
      }
      case "patterns":
        summary.patterns = await aggregateCrossGymPatterns();
        break;
    }
  }
  return summary;
}

// ── Tier progression (Retention INNOV 04) ────────────────────────────────────
/** Recompute a member's tier from tenure, streak and adherence. Returns 1 if it moved. */
export async function recomputeTier(memberId: string): Promise<number> {
  const member = await repos.members.get(memberId);
  if (!member) return 0;

  const since = new Date(Date.now() - 14 * 864e5);
  const logs = await repos.logs.listByMemberTypesSince(
    memberId,
    ["INTAKE", "WEIGHT", "CHECKIN", "WORKOUT"],
    since,
  );
  const activeDays = new Set(logs.map((l) => l.loggedFor.toISOString().slice(0, 10))).size;
  const adherence = Math.min(1, activeDays / 14);
  const tenureDays = (Date.now() - member.joinedAt.getTime()) / 864e5;

  const tier = computeTier({ tenureDays, longestStreak: member.longestStreak, adherence });
  if (tier === member.tier) return 0;

  await repos.members.update(memberId, { tier });
  // A promotion is a win worth celebrating; a demotion is a retention signal.
  if (rank(tier) > rank(member.tier)) {
    await repos.outboundMessages.create({
      gymId: member.gymId,
      memberId,
      body: `🏅 ${member.name}, you've reached ${titleCase(tier)} tier — ${TIER_PERKS[tier][0]}. Keep it going.`,
      status: "DRAFT",
      requiresApproval: true,
    });
  }
  return 1;
}

const TIER_ORDER = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
const rank = (t: string) => TIER_ORDER.indexOf(t);
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// ── Autonomous plan generation ───────────────────────────────────────────────
/**
 * Draft plans without a coach clicking. A plan is only drafted when the member
 * has none awaiting review AND their active plan has gone stale — so the coach
 * opens Monday to a full queue, not a daily pile of duplicates.
 */
const PLAN_STALE_DAYS = 7;

export async function autoDraftPlans(memberId: string): Promise<number> {
  const member = await repos.members.get(memberId);
  if (!member || member.status !== "ACTIVE") return 0;
  const ctx = { gymId: member.gymId };
  let drafted = 0;

  for (const type of ["DIET", "TRAINING"] as const) {
    const plans = await repos.plans.listByMemberType(memberId, type);
    const awaiting = plans.some((p) => p.status === "PENDING_REVIEW" || p.status === "APPROVED");
    if (awaiting) continue; // don't stack drafts on the coach

    const active = plans.find((p) => p.status === "ACTIVE");
    const ageDays = active ? (Date.now() - active.createdAt.getTime()) / 864e5 : Infinity;
    if (ageDays < PLAN_STALE_DAYS) continue;

    try {
      if (type === "DIET") await generateDietPlan(ctx, memberId);
      else await generateTrainingPlan(ctx, memberId);
      drafted += 1;
    } catch {
      // Tier-locked or transient LLM failure — skip this member, never fail the run.
    }
  }
  return drafted;
}

// ── Loss-framed renewal nudges (Retention INNOV 04) ──────────────────────────
const RENEWAL_WINDOW_DAYS = 7;

export async function draftRenewalNudge(memberId: string): Promise<number> {
  const member = await repos.members.get(memberId);
  if (!member?.renewalDate) return 0;

  const daysUntilRenewal = Math.ceil((member.renewalDate.getTime() - Date.now()) / 864e5);
  if (daysUntilRenewal < 0 || daysUntilRenewal > RENEWAL_WINDOW_DAYS) return 0;

  // Only once per renewal cycle.
  const key = `renewal:${member.renewalDate.toISOString().slice(0, 10)}`;
  if (await repos.milestones.existsByKey(memberId, key)) return 0;

  const currentWeightKg = await repos.logs.latestWeightKg(memberId);
  const kgLost =
    member.startWeightKg && currentWeightKg
      ? Math.floor(member.startWeightKg - currentWeightKg)
      : null;

  const nudge = buildRenewalNudge({
    memberName: member.name,
    tier: member.tier,
    currentStreak: member.currentStreak,
    longestStreak: member.longestStreak,
    kgLost,
    daysUntilRenewal,
  });

  await repos.milestones.create({
    gymId: member.gymId,
    memberId,
    type: "ADHERENCE",
    title: `Renewal nudge (${daysUntilRenewal}d)`,
    key,
    detail: { atStake: nudge.atStake },
  });
  await repos.outboundMessages.create({
    gymId: member.gymId,
    memberId,
    body: nudge.message,
    status: "DRAFT",
    requiresApproval: true, // renewal conversations always go through a human
  });
  return 1;
}

// ── Metabolic Twin (IP #3) ───────────────────────────────────────────────────
export async function recomputeMetabolicTwin(memberId: string): Promise<void> {
  const member = await repos.members.get(memberId);
  if (!member) return;

  const logs = await repos.logs.listByMemberTypesSince(
    memberId,
    ["INTAKE", "WEIGHT"],
    new Date(Date.now() - 42 * 864e5),
  );

  const byDay = new Map<string, { intake?: number; weight?: number; date: Date }>();
  for (const log of logs) {
    const day = log.loggedFor.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { date: log.loggedFor };
    const payload = log.payload as Record<string, unknown>;
    if (log.type === "INTAKE" && typeof payload.kcal === "number") bucket.intake = payload.kcal;
    if (log.type === "WEIGHT" && typeof payload.weightKg === "number") bucket.weight = payload.weightKg;
    byDay.set(day, bucket);
  }

  const daily: DailyEnergyLog[] = [];
  for (const b of byDay.values()) {
    if (b.intake != null && b.weight != null) {
      daily.push({ date: b.date, intakeKcal: b.intake, weightKg: b.weight });
    }
  }

  const age = member.dateOfBirth
    ? Math.floor((Date.now() - member.dateOfBirth.getTime()) / (1000 * 60 * 60 * 24 * 365))
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

// ── Churn scoring ────────────────────────────────────────────────────────────
export async function scoreMemberChurn(memberId: string): Promise<void> {
  const member = await repos.members.get(memberId);
  if (!member) return;

  const now = Date.now();
  const daysSince = (d: Date) => (now - d.getTime()) / 864e5;

  const turns = await repos.conversationTurns.recentByMember(memberId, 20);
  const inbound = turns.filter((t) => t.direction === "INBOUND");
  const latencyDays = inbound[0] ? daysSince(inbound[0].createdAt) : 14;

  const sentiments = inbound.map((t) => estimateSentiment(t.text)).filter((s) => s !== 0);
  const sentiment = sentiments.length
    ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
    : 0;

  const recent = await repos.logs.countByMemberBetween(memberId, new Date(now - 14 * 864e5));
  const prior = await repos.logs.countByMemberBetween(
    memberId,
    new Date(now - 28 * 864e5),
    new Date(now - 14 * 864e5),
  );
  const attendanceRatio = prior === 0 ? (recent > 0 ? 1 : 0.5) : Math.min(1, recent / prior);

  const features: ChurnFeatures = {
    attendanceRatio,
    adherence: 0.7,
    responseLatencyNorm: Math.min(1, latencyDays / 14),
    sentiment,
    tenureDays: daysSince(member.joinedAt),
  };
  const result = scoreChurn(features);

  await repos.churnScores.create({
    gymId: member.gymId,
    memberId,
    score: result.score,
    risk: result.risk,
    features: result.contributions,
    suggestion: result.suggestion,
  });
}

// ── Memory extraction (IP #4 — the compounding switching cost) ───────────────
export async function extractMemberMemory(memberId: string): Promise<void> {
  const member = await repos.members.get(memberId);
  if (!member) return;

  const turns = await repos.conversationTurns.recentByMember(memberId, 20);
  const inbound = turns.filter((t) => t.direction === "INBOUND");
  if (inbound.length === 0) return;

  const text = inbound.slice().reverse().map((t) => t.text).join("\n");
  const { memories } = await extractMemories(llm(), text);

  for (const m of memories) {
    await repos.memberMemories.upsertByKey({
      gymId: member.gymId,
      memberId,
      kind: m.kind,
      key: m.key,
      value: m.value,
      confidence: m.confidence,
      sourceTurnId: inbound[0]!.id,
      active: true,
    });
  }
}

// ── Ritual dispatch ──────────────────────────────────────────────────────────
/**
 * Send each gym's active daily rituals to its active members (idempotent per day).
 * A ritual only goes out once its scheduled local time has passed in the gym's
 * timezone — a 9pm wind-down must not arrive with the 6am weigh-in.
 */
export async function dispatchRituals(gymIds: string[], now: Date = new Date()): Promise<number> {
  const today = now.toISOString().slice(0, 10);
  let sent = 0;

  for (const gymId of [...new Set(gymIds)]) {
    const gym = await repos.gyms.getBySlug(gymId);
    const rituals = await repos.rituals.listActiveByGym(gymId);
    if (rituals.length === 0) continue;
    const members = (await repos.members.listByGym(gymId)).filter((m) => m.status === "ACTIVE");
    const localMinutes = minutesNowIn(gym?.timezone ?? "Asia/Kolkata", now);

    for (const ritual of rituals) {
      if (minutesOf(ritual.sendAt) > localMinutes) continue; // not due yet today
      for (const member of members) {
        if (await repos.ritualCompletions.existsForDay(member.id, ritual.id, today)) continue;
        // Record the dispatch first (idempotency guard), then send.
        await repos.ritualCompletions.create({
          gymId,
          memberId: member.id,
          ritualId: ritual.id,
          forDay: today,
        });
        const msg = await repos.outboundMessages.create({
          gymId,
          memberId: member.id,
          body: ritual.prompt,
          status: "QUEUED",
          requiresApproval: false,
        });
        const res = await whatsapp().sendText(member.whatsappPhone, ritual.prompt);
        await repos.outboundMessages.update(
          msg.id,
          res.ok
            ? { status: "SENT", sentAt: new Date(), providerMessageId: res.providerMessageId ?? null }
            : { status: "FAILED", error: res.error ?? "unknown" },
        );
        sent += 1;
      }
    }
  }
  return sent;
}

/** "HH:MM" → minutes since midnight. */
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Minutes since midnight right now, in the gym's own timezone. */
function minutesNowIn(timeZone: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h * 60 + m;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

// ── "Send a win" ─────────────────────────────────────────────────────────────
/** Detect new milestones and draft coach-gated congratulations. Returns count drafted. */
export async function scanMemberWins(memberId: string): Promise<number> {
  const member = await repos.members.get(memberId);
  if (!member) return 0;

  const currentWeightKg = await repos.logs.latestWeightKg(memberId);
  const detected = detectMilestones({
    goal: mapGoal(member.goal),
    startWeightKg: member.startWeightKg,
    currentWeightKg,
    currentStreak: member.currentStreak,
    longestStreak: member.longestStreak,
  });

  let drafted = 0;
  for (const ms of detected) {
    if (await repos.milestones.existsByKey(memberId, ms.key)) continue;
    await repos.milestones.create({
      gymId: member.gymId,
      memberId,
      type: ms.type,
      title: ms.title,
      key: ms.key,
      detail: ms.detail,
    });
    const body = await draftWinMessage(llm(), {
      memberName: member.name,
      milestoneTitle: ms.title,
    });
    await repos.outboundMessages.create({
      gymId: member.gymId,
      memberId,
      body,
      status: "DRAFT",
      requiresApproval: true,
    });
    drafted += 1;
  }
  return drafted;
}

// ── Cross-gym flywheel ───────────────────────────────────────────────────────
/**
 * Build anonymized, k-anonymized cohort patterns across every gym WITHOUT any
 * member PII leaving its tenant. Each pattern passes the PII gate before persisting.
 */
export async function aggregateCrossGymPatterns(): Promise<number> {
  const members = await repos.members.listActive();
  const observations: PatternObservation[] = [];

  for (const member of members) {
    const churn = await repos.churnScores.latestByMember(member.id);
    const success = churn ? churn.risk === "LOW" || churn.risk === "MEDIUM" : true;
    const value = churn ? 1 - churn.score : 0.5;
    const goal = mapGoal(member.goal);

    const diet = (await repos.plans.listByMemberType(member.id, "DIET")).find(
      (p) => p.status === "ACTIVE",
    );
    if (diet) {
      const slug = (diet.payload as { protocolSlug?: string }).protocolSlug ?? "unknown";
      observations.push({ cohort: `diet:${slug}:goal=${goal}`, memberId: member.id, success, value });
    }

    const training = (await repos.plans.listByMemberType(member.id, "TRAINING")).find(
      (p) => p.status === "ACTIVE",
    );
    if (training) {
      const slug = (training.payload as { protocolSlug?: string }).protocolSlug ?? "unknown";
      observations.push({ cohort: `training:${slug}`, memberId: member.id, success, value });
    }
  }

  const patterns = aggregatePatterns(observations);
  const now = new Date();
  for (const p of patterns) {
    assertNoPii(p); // hard privacy gate before crossing the tenant boundary
    await repos.anonymizedPatterns.upsertByCohort({
      cohort: p.cohort,
      cohortSize: p.cohortSize,
      successRate: p.successRate,
      avgValue: p.avgValue,
      observations: p.observations,
      computedAt: now,
    });
  }
  return patterns.length;
}

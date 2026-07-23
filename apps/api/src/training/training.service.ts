import { Injectable, NotFoundException } from "@nestjs/common";
import {
  assertSameTenant,
  screenForInjury,
  type FatigueInput,
  type TenantContext,
} from "@keystone/core";
import {
  draftTrainingPlan,
  selectTrainingProtocol,
  type TrainingProtocolCandidate,
} from "@keystone/ai";
import type { Log, Member, Plan } from "@keystone/db";
import { DbService } from "../db/db.service.js";
import { LlmService } from "../shared/llm.service.js";

@Injectable()
export class TrainingService {
  constructor(
    private readonly db: DbService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Coach-triggered Training plan generation. Assembles the member brain, screens
   * memory + notes for injuries, computes the Fatigue Guardian input from recent
   * logs, selects a protocol, drafts a week, and parks it at PENDING_REVIEW.
   */
  async generateForMember(ctx: TenantContext, memberId: string) {
    const member = await this.db.repos.members.get(memberId);
    if (!member) throw new NotFoundException("Member not found");
    assertSameTenant(ctx, member);

    const goal = mapGoal(member.goal);
    const experience = mapExperience(member.goal);
    const daysPerWeek = 4;

    // Injury-aware programming: pull injured regions from memory + recent notes.
    const memoryRecords = await this.db.repos.memberMemories.listActiveByMember(memberId);
    const memories = memoryRecords.map((m) => `${m.key}: ${m.value}`);
    const injuredRegions = new Set<string>();
    for (const m of memoryRecords) {
      if (m.kind === "INJURY") for (const r of screenForInjury(m.value).regions) injuredRegions.add(r);
    }
    const notes = await this.db.repos.notes.listByMemberRecent(memberId, 5);
    for (const n of notes) for (const r of screenForInjury(n.text).regions) injuredRegions.add(r);

    // Fatigue Guardian input from recent WORKOUT / SLEEP / CHECKIN logs.
    const logs = await this.db.repos.logs.listByMemberTypesSince(
      memberId,
      ["WORKOUT", "SLEEP", "CHECKIN"],
      new Date(Date.now() - 14 * 864e5),
    );
    const priorPlans = await this.db.repos.plans.listByMemberType(memberId, "TRAINING");
    const fatigue = buildFatigue(logs, priorPlans);

    // Select a protocol from the library (AI picks + explains; never invents).
    const candidates: TrainingProtocolCandidate[] = (
      await this.db.repos.protocols.listByKind("TRAINING")
    ).map((p) => ({ slug: p.slug, name: p.name, summary: p.summary, science: p.science }));
    const choice = await selectTrainingProtocol(this.llm.provider, {
      member: { goal, experience, daysPerWeek },
      candidates,
    });
    const protocol =
      candidates.find((c) => c.slug === choice.slug) ??
      candidates[0] ?? { slug: choice.slug, name: choice.slug, summary: "", science: {} };
    const protocolDoc = (await this.db.repos.protocols.listByKind("TRAINING")).find(
      (p) => p.slug === protocol.slug,
    );

    const { payload, fatigue: fatigueDecision } = await draftTrainingPlan(this.llm.provider, {
      member: { name: member.name, goal, experience, daysPerWeek },
      protocol,
      memories,
      injuredRegions: [...injuredRegions],
      fatigue,
    });

    const plan = await this.db.repos.plans.create({
      gymId: member.gymId,
      memberId,
      type: "TRAINING",
      status: "PENDING_REVIEW",
      protocolId: protocolDoc?.id ?? null,
      payload: payload as unknown as Record<string, unknown>,
      rationale: choice.rationale,
      stateSnapshot: {
        deload: fatigueDecision.deload,
        fatigueLevel: fatigueDecision.level,
        fatigueReasons: fatigueDecision.reasons,
        injuredRegions: [...injuredRegions],
      },
    });

    return { plan, fatigue: fatigueDecision, injuredRegions: [...injuredRegions] };
  }
}

function mapGoal(goal?: string | null): "lose" | "gain" | "maintain" {
  const g = (goal ?? "").toLowerCase();
  if (/lose|fat|cut|lean/.test(g)) return "lose";
  if (/gain|bulk|muscle|mass|strength/.test(g)) return "gain";
  return "maintain";
}

function mapExperience(goal?: string | null): "novice" | "intermediate" | "advanced" {
  const g = (goal ?? "").toLowerCase();
  if (/advanced|elite|competit/.test(g)) return "advanced";
  if (/intermediate|experienced/.test(g)) return "intermediate";
  return "novice";
}

/**
 * Build the Fatigue Guardian input. Sparse history → a fresh, well-recovered
 * default so a first plan isn't spuriously deloaded. weeksSinceDeload is derived
 * from the member's own training-plan history (a prior deload resets the count).
 */
function buildFatigue(logs: Log[], priorPlans: Plan[]): FatigueInput {
  const workouts = logs.filter((l) => l.type === "WORKOUT");
  const rpes = workouts
    .map((l) => (l.payload as { rpe?: number }).rpe)
    .filter((r): r is number => typeof r === "number");
  const sleeps = logs
    .filter((l) => l.type === "SLEEP")
    .map((l) => (l.payload as { hours?: number }).hours)
    .filter((h): h is number => typeof h === "number");
  const soreness = logs
    .filter((l) => l.type === "CHECKIN")
    .map((l) => (l.payload as { soreness?: number }).soreness)
    .filter((s): s is number => typeof s === "number");
  const failedSets = workouts.reduce(
    (n, l) => n + (Number((l.payload as { failedSets?: number }).failedSets) || 0),
    0,
  );

  const avg = (xs: number[], fallback: number) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;

  return {
    avgRpe: avg(rpes, 7),
    avgSleepHours: avg(sleeps, 7.5),
    soreness: Math.round(avg(soreness, 2)),
    weeksSinceDeload: weeksSinceLastDeload(priorPlans),
    failedSets,
  };
}

function weeksSinceLastDeload(priorPlans: Plan[]): number {
  // Plans are newest-first. Count consecutive non-deload weeks back to the last deload.
  let weeks = 0;
  for (const p of priorPlans) {
    const wasDeload = (p.payload as { deload?: boolean }).deload === true;
    if (wasDeload) break;
    weeks += 1;
  }
  return weeks;
}

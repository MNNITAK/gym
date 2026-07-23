import { assertSameTenant, detectMilestones, type TenantContext } from "@keystone/core";
import { draftWinMessage } from "@keystone/ai";
import { repos } from "@keystone/db";
import { llm, draftMessage } from "./clients";
import { mapGoal } from "./engines";
import { HttpError } from "./auth";

/**
 * Members the coach should reach out to now, ranked by churn risk — each with the
 * specific suggested intervention (~day 20, not day 90).
 */
export async function atRisk(ctx: TenantContext) {
  // Two queries total, regardless of roster size.
  const [members, churnByMember] = await Promise.all([
    repos.members.listByGym(ctx.gymId),
    repos.churnScores.latestByGym(ctx.gymId),
  ]);

  return members
    .map((m) => {
      const churn = churnByMember.get(m.id);
      if (!churn) return null;
      return {
        memberId: m.id,
        name: m.name,
        whatsappPhone: m.whatsappPhone,
        tier: m.tier,
        score: churn.score,
        risk: churn.risk,
        suggestion: churn.suggestion,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null && (x.risk === "HIGH" || x.risk === "CRITICAL"))
    .sort((a, b) => b.score - a.score);
}

export async function memberMilestones(ctx: TenantContext, memberId: string) {
  const member = await repos.members.get(memberId);
  if (!member) throw new HttpError(404, "Member not found");
  assertSameTenant(ctx, member);
  return repos.milestones.listByMember(memberId);
}

/**
 * "Send a win": scan for newly-crossed milestones, persist new ones idempotently,
 * and draft a personal coach congratulations behind the coach gate.
 */
export async function scanWins(ctx: TenantContext, memberId: string) {
  const member = await repos.members.get(memberId);
  if (!member) throw new HttpError(404, "Member not found");
  assertSameTenant(ctx, member);

  const currentWeightKg = await repos.logs.latestWeightKg(memberId);
  const detected = detectMilestones({
    goal: mapGoal(member.goal),
    startWeightKg: member.startWeightKg,
    currentWeightKg,
    currentStreak: member.currentStreak,
    longestStreak: member.longestStreak,
  });

  const created: string[] = [];
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
    await draftMessage({ gymId: member.gymId, memberId, body, requiresApproval: true });
    created.push(ms.title);
  }

  return { detected: detected.map((m) => m.title), newlyCelebrated: created };
}

// ── Owner analytics ──────────────────────────────────────────────────────────
export async function analyticsOverview(ctx: TenantContext) {
  const [members, churnByMember] = await Promise.all([
    repos.members.listByGym(ctx.gymId),
    repos.churnScores.latestByGym(ctx.gymId),
  ]);
  const active = members.filter((m) => m.status === "ACTIVE");

  const atRiskMembers = active.filter((m) => {
    const risk = churnByMember.get(m.id)?.risk;
    return risk === "HIGH" || risk === "CRITICAL";
  }).length;

  const tiers: Record<string, number> = {};
  for (const m of active) tiers[m.tier] = (tiers[m.tier] ?? 0) + 1;

  const avgCurrentStreak = active.length
    ? Math.round((active.reduce((s, m) => s + m.currentStreak, 0) / active.length) * 10) / 10
    : 0;

  return {
    members: members.length,
    activeMembers: active.length,
    atRiskMembers,
    tiers,
    avgCurrentStreak,
  };
}

export function crossGymPatterns() {
  return repos.anonymizedPatterns.list();
}

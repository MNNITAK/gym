import { repos } from "@keystone/db";
import {
  aggregatePatterns,
  assertNoPii,
  type PatternObservation,
} from "@keystone/core";

/**
 * Cross-gym learning layer (Phase 4 flywheel). Builds anonymized, k-anonymized
 * cohort patterns from every gym's outcomes — which protocol, for which goal,
 * correlates with retained (low-churn) members — WITHOUT any member PII leaving
 * its tenant. Each pattern passes the PII gate before it is persisted, and only
 * cohorts above the k-anonymity floor survive aggregation.
 */
export async function aggregateCrossGymPatterns(): Promise<number> {
  const members = await repos.members.listActive();
  const observations: PatternObservation[] = [];

  for (const member of members) {
    const churn = await repos.churnScores.latestByMember(member.id);
    // Retention proxy: a member on LOW/MEDIUM risk is "sticking".
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
  let persisted = 0;
  for (const p of patterns) {
    assertNoPii(p); // hard privacy gate before anything crosses the tenant boundary
    await repos.anonymizedPatterns.upsertByCohort({
      cohort: p.cohort,
      cohortSize: p.cohortSize,
      successRate: p.successRate,
      avgValue: p.avgValue,
      observations: p.observations,
      computedAt: now,
    });
    persisted += 1;
  }
  return persisted;
}

function mapGoal(goal?: string | null): "lose" | "gain" | "maintain" {
  const g = (goal ?? "").toLowerCase();
  if (/lose|fat|cut|lean/.test(g)) return "lose";
  if (/gain|bulk|muscle|mass|strength/.test(g)) return "gain";
  return "maintain";
}

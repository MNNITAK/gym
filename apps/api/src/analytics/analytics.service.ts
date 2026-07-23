import { Injectable } from "@nestjs/common";
import type { TenantContext } from "@keystone/core";
import { DbService } from "../db/db.service.js";

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DbService) {}

  /**
   * Owner dashboard: this gym's headline retention numbers, benchmarked against the
   * anonymized cross-gym patterns (Phase 4 flywheel). No other gym's PII is ever read.
   */
  async overview(ctx: TenantContext) {
    const members = await this.db.repos.members.listByGym(ctx.gymId);
    const active = members.filter((m) => m.status === "ACTIVE");

    let atRisk = 0;
    for (const m of active) {
      const churn = await this.db.repos.churnScores.latestByMember(m.id);
      if (churn && (churn.risk === "HIGH" || churn.risk === "CRITICAL")) atRisk += 1;
    }

    const tiers = countBy(active.map((m) => m.tier));
    const avgStreak = active.length
      ? Math.round((active.reduce((s, m) => s + m.currentStreak, 0) / active.length) * 10) / 10
      : 0;

    return {
      members: members.length,
      activeMembers: active.length,
      atRiskMembers: atRisk,
      tiers,
      avgCurrentStreak: avgStreak,
    };
  }

  /** The anonymized cross-gym learning patterns available as priors to this gym. */
  patterns() {
    return this.db.repos.anonymizedPatterns.list();
  }
}

function countBy(xs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}

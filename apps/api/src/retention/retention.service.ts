import { Injectable, NotFoundException } from "@nestjs/common";
import {
  assertSameTenant,
  detectMilestones,
  type TenantContext,
} from "@keystone/core";
import { draftWinMessage } from "@keystone/ai";
import { DbService } from "../db/db.service.js";
import { LlmService } from "../shared/llm.service.js";
import { MessagesService } from "../messages/messages.service.js";

@Injectable()
export class RetentionService {
  constructor(
    private readonly db: DbService,
    private readonly llm: LlmService,
    private readonly messages: MessagesService,
  ) {}

  /**
   * Members the coach should reach out to now, ranked by churn risk. Surfaces the
   * latest score + the specific suggested intervention (~day 20, not day 90).
   */
  async atRisk(ctx: TenantContext) {
    const members = await this.db.repos.members.listByGym(ctx.gymId);
    const scored = await Promise.all(
      members.map(async (m) => {
        const churn = await this.db.repos.churnScores.latestByMember(m.id);
        return churn
          ? {
              memberId: m.id,
              name: m.name,
              whatsappPhone: m.whatsappPhone,
              tier: m.tier,
              score: churn.score,
              risk: churn.risk,
              suggestion: churn.suggestion,
            }
          : null;
      }),
    );
    return scored
      .filter((x): x is NonNullable<typeof x> => x != null && (x.risk === "HIGH" || x.risk === "CRITICAL"))
      .sort((a, b) => b.score - a.score);
  }

  async milestones(ctx: TenantContext, memberId: string) {
    const member = await this.db.repos.members.get(memberId);
    if (!member) throw new NotFoundException("Member not found");
    assertSameTenant(ctx, member);
    return this.db.repos.milestones.listByMember(memberId);
  }

  /**
   * "Send a win": scan a member for newly-crossed milestones, persist any new ones
   * (idempotently), and draft a personal coach congratulations behind the coach gate.
   */
  async scanWins(ctx: TenantContext, memberId: string) {
    const member = await this.db.repos.members.get(memberId);
    if (!member) throw new NotFoundException("Member not found");
    assertSameTenant(ctx, member);

    const currentWeightKg = await this.db.repos.logs.latestWeightKg(memberId);
    const goal = mapGoal(member.goal);

    const detected = detectMilestones({
      goal,
      startWeightKg: member.startWeightKg,
      currentWeightKg,
      currentStreak: member.currentStreak,
      longestStreak: member.longestStreak,
    });

    const created: string[] = [];
    for (const ms of detected) {
      if (await this.db.repos.milestones.existsByKey(memberId, ms.key)) continue;
      await this.db.repos.milestones.create({
        gymId: member.gymId,
        memberId,
        type: ms.type,
        title: ms.title,
        key: ms.key,
        detail: ms.detail,
      });
      // Draft a coach-sent congratulations — parked behind the coach gate.
      const body = await draftWinMessage(this.llm.provider, {
        memberName: member.name,
        milestoneTitle: ms.title,
      });
      await this.messages.draft({
        gymId: member.gymId,
        memberId,
        body,
        requiresApproval: true,
      });
      created.push(ms.title);
    }

    return { detected: detected.map((m) => m.title), newlyCelebrated: created };
  }
}

function mapGoal(goal?: string | null): "lose" | "gain" | "maintain" {
  const g = (goal ?? "").toLowerCase();
  if (/lose|fat|cut|lean/.test(g)) return "lose";
  if (/gain|bulk|muscle|mass|strength/.test(g)) return "gain";
  return "maintain";
}

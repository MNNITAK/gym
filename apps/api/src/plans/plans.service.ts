import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import {
  assertPlanTransition,
  assertSameTenant,
  DietPlanPayloadSchema,
  TrainingPlanPayloadSchema,
  type PlanStatus,
  type TenantContext,
} from "@keystone/core";
import { renderDietPlanText, renderTrainingPlanText } from "@keystone/ai";
import { DbService } from "../db/db.service.js";
import { MessagesService } from "../messages/messages.service.js";

@Injectable()
export class PlansService {
  constructor(
    private readonly db: DbService,
    private readonly messages: MessagesService,
  ) {}

  /** Drafts + plans awaiting a coach, scoped to tenant. */
  async pending(ctx: TenantContext) {
    const plans = await this.db.repos.plans.listPending(ctx.gymId);
    return Promise.all(
      plans.map(async (p) => {
        const member = await this.db.repos.members.get(p.memberId);
        return {
          ...p,
          member: member
            ? { name: member.name, whatsappPhone: member.whatsappPhone }
            : null,
        };
      }),
    );
  }

  /** Full plan detail (payload included) for coach review, tenant-scoped. */
  async detail(ctx: TenantContext, id: string) {
    const plan = await this.db.repos.plans.get(id);
    if (!plan) throw new NotFoundException("Plan not found");
    assertSameTenant(ctx, plan);
    const member = await this.db.repos.members.get(plan.memberId);
    return { ...plan, member };
  }

  /**
   * Move a plan through the coach-in-the-loop state machine. The state machine in
   * @keystone/core is the single source of truth for legal transitions.
   * On ACTIVE, the approved plan is delivered to the member over WhatsApp.
   */
  async transition(
    ctx: TenantContext,
    id: string,
    to: PlanStatus,
    reviewNote?: string,
  ) {
    const plan = await this.db.repos.plans.get(id);
    if (!plan) throw new NotFoundException("Plan not found");
    assertSameTenant(ctx, plan);

    try {
      assertPlanTransition(plan.status as PlanStatus, to);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    if (to === "ACTIVE") {
      await this.db.repos.plans.archivePreviousActive(
        ctx.gymId,
        plan.memberId,
        plan.type,
        id,
      );
    }

    const updated = await this.db.repos.plans.update(id, {
      status: to,
      reviewerId: ctx.staffUserId ?? null,
      reviewedAt: new Date(),
      reviewNote: reviewNote ?? null,
    });

    // Coach-approved → deliver the plan to the member (already gated by approval).
    if (to === "ACTIVE") {
      await this.deliverPlan(plan.gymId, plan.memberId, plan.type, plan.payload);
    }

    return updated;
  }

  private async deliverPlan(
    gymId: string,
    memberId: string,
    type: "DIET" | "TRAINING",
    payload: Record<string, unknown>,
  ): Promise<void> {
    const member = await this.db.repos.members.get(memberId);
    const name = member?.name ?? "";
    const body = this.renderPlan(type, payload, name);
    // requiresApproval:false — the plan approval WAS the coach gate.
    const msg = await this.messages.draft({
      gymId,
      memberId,
      body,
      requiresApproval: false,
    });
    await this.messages.deliver(msg.id);
  }

  private renderPlan(
    type: "DIET" | "TRAINING",
    payload: Record<string, unknown>,
    name: string,
  ): string {
    const fallback = "Your updated plan is ready — your coach will share the details.";
    if (type === "DIET") {
      const parsed = DietPlanPayloadSchema.safeParse(payload);
      return parsed.success ? renderDietPlanText(parsed.data, name) : fallback;
    }
    const parsed = TrainingPlanPayloadSchema.safeParse(payload);
    return parsed.success ? renderTrainingPlanText(parsed.data, name) : fallback;
  }
}

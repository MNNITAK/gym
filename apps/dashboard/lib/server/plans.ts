import {
  assertPlanTransition,
  assertSameTenant,
  DietPlanPayloadSchema,
  TrainingPlanPayloadSchema,
  type PlanStatus,
  type TenantContext,
} from "@keystone/core";
import { renderDietPlanText, renderTrainingPlanText } from "@keystone/ai";
import { repos } from "@keystone/db";
import { draftMessage, deliverMessage } from "./clients";
import { HttpError } from "./auth";

/** Drafts + plans awaiting a coach, scoped to tenant. */
export async function pendingPlans(ctx: TenantContext) {
  const plans = await repos.plans.listPending(ctx.gymId);
  return Promise.all(
    plans.map(async (p) => {
      const member = await repos.members.get(p.memberId);
      return {
        ...p,
        member: member ? { name: member.name, whatsappPhone: member.whatsappPhone } : null,
      };
    }),
  );
}

/** Full plan detail (payload included) for coach review, tenant-scoped. */
export async function planDetail(ctx: TenantContext, id: string) {
  const plan = await repos.plans.get(id);
  if (!plan) throw new HttpError(404, "Plan not found");
  assertSameTenant(ctx, plan);
  const member = await repos.members.get(plan.memberId);
  return { ...plan, member };
}

/**
 * Move a plan through the coach-in-the-loop state machine (@keystone/core is the
 * single source of truth for legal transitions). On ACTIVE the approved plan is
 * delivered to the member over WhatsApp.
 */
export async function transitionPlan(
  ctx: TenantContext,
  id: string,
  to: PlanStatus,
  reviewNote?: string,
) {
  const plan = await repos.plans.get(id);
  if (!plan) throw new HttpError(404, "Plan not found");
  assertSameTenant(ctx, plan);

  try {
    assertPlanTransition(plan.status as PlanStatus, to);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }

  if (to === "ACTIVE") {
    await repos.plans.archivePreviousActive(ctx.gymId, plan.memberId, plan.type, id);
  }

  const updated = await repos.plans.update(id, {
    status: to,
    reviewerId: ctx.staffUserId ?? null,
    reviewedAt: new Date(),
    reviewNote: reviewNote ?? null,
  });

  if (to === "ACTIVE") {
    const member = await repos.members.get(plan.memberId);
    const body = renderPlan(plan.type, plan.payload, member?.name ?? "");
    // requiresApproval:false — the plan approval WAS the coach gate.
    const msg = await draftMessage({
      gymId: plan.gymId,
      memberId: plan.memberId,
      body,
      requiresApproval: false,
    });
    await deliverMessage(msg.id);
  }

  return updated;
}

export function renderPlan(
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

// ── Messages (coach approval queue) ──────────────────────────────────────────
export async function pendingMessages(ctx: TenantContext) {
  const msgs = await repos.outboundMessages.listPending(ctx.gymId);
  return Promise.all(
    msgs.map(async (m) => {
      const member = await repos.members.get(m.memberId);
      return {
        ...m,
        member: member ? { name: member.name, whatsappPhone: member.whatsappPhone } : null,
      };
    }),
  );
}

/** Coach approves a drafted message → queue → send. */
export async function approveMessage(ctx: TenantContext, id: string) {
  const msg = await repos.outboundMessages.get(id);
  if (!msg) throw new HttpError(404, "Message not found");
  assertSameTenant(ctx, msg);
  if (msg.status !== "DRAFT") throw new HttpError(400, `Cannot approve from ${msg.status}`);

  await repos.outboundMessages.update(id, {
    status: "QUEUED",
    approverId: ctx.staffUserId ?? null,
    approvedAt: new Date(),
  });
  return deliverMessage(id);
}

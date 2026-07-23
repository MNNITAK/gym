import "./env";
import {
  assertSameTenant,
  readCheckin,
  suggestPlanKinds,
  type TenantContext,
} from "@keystone/core";
import { repos, type Member, type PlanType } from "@keystone/db";
import { HttpError } from "./auth";
import { dayKey, describeAnswers } from "./checkin";
import { generateDietPlan, generateTrainingPlan } from "./engines";

// ── Plan requests ────────────────────────────────────────────────────────────
// The member asks; the coach decides. Nothing generates on the member's tap —
// that is the whole point of the coach-in-the-loop model, and it is what makes
// the AI output defensible rather than something a member could have got from a
// chatbot.

/** What the member sees: today's request, if any. */
export async function myRequest(member: Member) {
  const today = dayKey();
  const request = await repos.planRequests.forDay(member.id, today);
  if (!request) return { request: null };

  // Once approved, hand back the plans themselves so the waiting screen can
  // swap straight to them.
  const plans =
    request.status === "APPROVED"
      ? (await Promise.all(request.planIds.map((id) => repos.plans.get(id)))).filter(Boolean)
      : [];

  return {
    request: {
      id: request.id,
      status: request.status,
      kinds: request.kinds,
      requestedAt: request.requestedAt,
      respondedAt: request.respondedAt ?? null,
      note: request.note ?? null,
    },
    plans: plans.map((p) => ({ id: p!.id, type: p!.type, payload: p!.payload })),
  };
}

/**
 * Create today's request. Requires a completed check-in — the coach is being
 * asked to make a decision, and without today's data they'd be guessing.
 */
export async function createRequest(member: Member, note?: string) {
  const today = dayKey();

  const checkin = await repos.dailyCheckins.forDay(member.id, today);
  if (!checkin || checkin.status !== "COMPLETE") {
    throw new HttpError(400, "Complete today's check-in first — your coach needs it to decide.");
  }

  const existing = await repos.planRequests.forDay(member.id, today);
  if (existing && existing.status !== "DECLINED") {
    return { request: existing, alreadyRequested: true };
  }

  const suggestion = suggestPlanKinds(checkin.answers);
  const readiness = readCheckin(checkin.answers);

  const request = await repos.planRequests.create({
    gymId: member.gymId,
    memberId: member.id,
    memberName: member.name,
    forDay: today,
    kinds: suggestion.kinds as PlanType[],
    status: "REQUESTED",
    checkinId: checkin.id,
    planIds: [],
    aiSuggestion: `${readiness.summary}${
      readiness.flags.length ? ` Flags: ${readiness.flags.join("; ")}.` : ""
    } Suggested: ${suggestion.kinds.join(" + ")}.`,
    note: note?.trim() || null,
    requestedAt: new Date(),
  });

  return { request, alreadyRequested: false };
}

// ── Coach side ───────────────────────────────────────────────────────────────

export async function openRequests(ctx: TenantContext) {
  const requests = await repos.planRequests.openByGym(ctx.gymId);
  return requests.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    memberName: r.memberName,
    forDay: r.forDay,
    kinds: r.kinds,
    status: r.status,
    aiSuggestion: r.aiSuggestion,
    note: r.note,
    requestedAt: r.requestedAt,
  }));
}

/** Everything a coach needs on one screen to make the call. */
export async function requestDetail(ctx: TenantContext, id: string) {
  const request = await repos.planRequests.get(id);
  if (!request) throw new HttpError(404, "Request not found");
  assertSameTenant(ctx, request);

  const member = await repos.members.get(request.memberId);
  if (!member) throw new HttpError(404, "Member not found");

  const [checkin, twin, churn, memories, weights, dietPlans, trainingPlans, recentCheckins] =
    await Promise.all([
      request.checkinId
        ? repos.dailyCheckins.forDay(request.memberId, request.forDay)
        : Promise.resolve(null),
      repos.metabolicTwins.latestByMember(request.memberId),
      repos.churnScores.latestByMember(request.memberId),
      repos.memberMemories.listActiveByMember(request.memberId),
      repos.logs.listByMemberTypesSince(
        request.memberId,
        ["WEIGHT"],
        new Date(Date.now() - 90 * 864e5),
      ),
      repos.plans.listByMemberType(request.memberId, "DIET"),
      repos.plans.listByMemberType(request.memberId, "TRAINING"),
      repos.dailyCheckins.recentByMember(request.memberId, 7),
    ]);

  const draftedPlans = (
    await Promise.all(request.planIds.map((pid) => repos.plans.get(pid)))
  ).filter(Boolean);

  return {
    request: {
      id: request.id,
      status: request.status,
      kinds: request.kinds,
      aiSuggestion: request.aiSuggestion,
      note: request.note,
      forDay: request.forDay,
      requestedAt: request.requestedAt,
      planIds: request.planIds,
    },
    member: {
      id: member.id,
      name: member.name,
      goal: member.goal,
      tier: member.tier,
      currentStreak: member.currentStreak,
      longestStreak: member.longestStreak,
      startWeightKg: member.startWeightKg,
      joinedAt: member.joinedAt,
    },
    checkin: checkin
      ? {
          summary: checkin.summary,
          readiness: readCheckin(checkin.answers),
          answers: describeAnswers(checkin.answers),
        }
      : null,
    twin: twin
      ? { tdee: twin.computedTdee, usesRegression: twin.usesRegression, confidence: twin.confidence }
      : null,
    churn: churn ? { risk: churn.risk, score: churn.score, suggestion: churn.suggestion } : null,
    memories: memories
      .filter((m) => m.value?.trim())
      .map((m) => ({ kind: m.kind, key: m.key, value: m.value })),
    weightSeries: weights
      .map((l) => ({
        date: l.loggedFor.toISOString().slice(0, 10),
        weightKg: Number((l.payload as { weightKg?: number }).weightKg),
      }))
      .filter((p) => Number.isFinite(p.weightKg)),
    recentCheckins: recentCheckins.map((c) => ({
      forDay: c.forDay,
      summary: c.summary,
      readiness: c.status === "COMPLETE" ? readCheckin(c.answers).band : null,
    })),
    previousPlans: [...dietPlans, ...trainingPlans]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        type: p.type,
        status: p.status,
        rationale: p.rationale,
        createdAt: p.createdAt,
      })),
    draftedPlans: draftedPlans.map((p) => ({
      id: p!.id,
      type: p!.type,
      status: p!.status,
      payload: p!.payload,
      rationale: p!.rationale,
      revisions: p!.revisions ?? [],
      stateSnapshot: p!.stateSnapshot,
    })),
  };
}

/**
 * Coach triggers generation. Reuses the existing engines untouched — the request
 * flow changes *when* generation happens and *who* asks for it, not how it works.
 */
export async function generateForRequest(
  ctx: TenantContext,
  id: string,
  kinds: PlanType[],
) {
  const request = await repos.planRequests.get(id);
  if (!request) throw new HttpError(404, "Request not found");
  assertSameTenant(ctx, request);

  await repos.planRequests.update(id, { status: "IN_REVIEW" });

  const planIds: string[] = [...request.planIds];
  for (const kind of kinds) {
    const res =
      kind === "DIET"
        ? await generateDietPlan(ctx, request.memberId)
        : await generateTrainingPlan(ctx, request.memberId);
    planIds.push(res.plan.id);
  }

  const updated = await repos.planRequests.update(id, {
    status: "DRAFTED",
    planIds: [...new Set(planIds)],
  });
  return updated;
}

/**
 * Approve everything drafted. Runs the existing plan state machine, so approval
 * still archives the previous plan and delivers to the member's inbox exactly as
 * it did before.
 */
export async function approveRequest(ctx: TenantContext, id: string) {
  const request = await repos.planRequests.get(id);
  if (!request) throw new HttpError(404, "Request not found");
  assertSameTenant(ctx, request);
  if (request.planIds.length === 0) {
    throw new HttpError(400, "Generate a plan before approving.");
  }

  // Imported lazily: plans.ts imports from clients.ts, and a top-level import
  // here would create a cycle through engines.ts.
  const { transitionPlan } = await import("./plans");

  for (const planId of request.planIds) {
    const plan = await repos.plans.get(planId);
    if (!plan) continue;
    if (plan.status === "PENDING_REVIEW") await transitionPlan(ctx, planId, "APPROVED");
    const after = await repos.plans.get(planId);
    if (after?.status === "APPROVED") await transitionPlan(ctx, planId, "ACTIVE");
  }

  return repos.planRequests.update(id, {
    status: "APPROVED",
    respondedAt: new Date(),
  });
}

export async function declineRequest(ctx: TenantContext, id: string, note: string) {
  const request = await repos.planRequests.get(id);
  if (!request) throw new HttpError(404, "Request not found");
  assertSameTenant(ctx, request);

  await repos.outboundMessages.create({
    gymId: request.gymId,
    memberId: request.memberId,
    body: note?.trim() || "Your coach has reviewed today and suggests a rest day.",
    status: "QUEUED",
    requiresApproval: false,
  });

  return repos.planRequests.update(id, {
    status: "DECLINED",
    note: note?.trim() || null,
    respondedAt: new Date(),
  });
}

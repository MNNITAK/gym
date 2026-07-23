import "./env";
import {
  ONBOARDING_FIELDS,
  fieldByKey,
  onboardingProgress,
  isOnboardingComplete,
  parseHeightCm,
  parseWeightKg,
  parseAge,
  parseSex,
  isNegativeAnswer,
} from "@keystone/core";
import { runOnboardingTurn, onboardingGreeting } from "@keystone/ai";
import { repos, type Member } from "@keystone/db";
import { llm } from "./clients";

// ── Onboarding orchestration ─────────────────────────────────────────────────
// The conversation is transcript-backed (conversationTurns, agent "onboarding")
// so it survives a refresh, and the collected answers live on the session doc.
// On completion the answers become long-term memory — which is the entire point:
// every plan generated afterwards conditions on them.

const AGENT = "onboarding";

export async function onboardingState(member: Member) {
  const session =
    (await repos.onboardingSessions.get(member.id)) ??
    (await repos.onboardingSessions.start({
      gymId: member.gymId,
      memberId: member.id,
      status: "IN_PROGRESS",
      collected: {},
      askedKeys: [],
    }));

  const turns = await repos.conversationTurns.threadByAgent(member.id, [AGENT], 60);

  // Nothing said yet — open the conversation and persist the greeting so a
  // refresh doesn't produce a different first message.
  if (turns.length === 0) {
    const greeting = onboardingGreeting(member.name);
    await repos.conversationTurns.create({
      gymId: member.gymId,
      memberId: member.id,
      direction: "OUTBOUND",
      agent: AGENT,
      text: greeting,
      providerMessageId: `onb_${member.id}_greeting`,
    });
    return {
      status: session.status,
      progress: onboardingProgress(session.collected),
      turns: [{ role: "coach" as const, text: greeting, at: new Date() }],
      suggestions: [] as string[],
    };
  }

  return {
    status: session.status,
    progress: onboardingProgress(session.collected),
    turns: turns.map((t) => ({
      role: t.direction === "INBOUND" ? ("member" as const) : ("coach" as const),
      text: t.text,
      at: t.createdAt,
    })),
    suggestions: [] as string[],
  };
}

/** One exchange: record what they said, work out what to ask next. */
export async function onboardingReply(member: Member, message: string) {
  const text = message.trim();
  if (!text) throw new Error("Say something first.");

  const session =
    (await repos.onboardingSessions.get(member.id)) ??
    (await repos.onboardingSessions.start({
      gymId: member.gymId,
      memberId: member.id,
      status: "IN_PROGRESS",
      collected: {},
      askedKeys: [],
    }));

  await repos.conversationTurns.create({
    gymId: member.gymId,
    memberId: member.id,
    direction: "INBOUND",
    agent: AGENT,
    text,
    providerMessageId: `onb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  });

  const history = await repos.conversationTurns.threadByAgent(member.id, [AGENT], 12);
  const turn = await runOnboardingTurn(llm(), {
    memberName: member.name,
    collected: session.collected,
    message: text,
    history: history.map((t) => ({
      role: t.direction === "INBOUND" ? ("member" as const) : ("coach" as const),
      text: t.text,
    })),
  });

  const collected = { ...session.collected, ...turn.extracted };
  const complete = isOnboardingComplete(collected);

  await repos.onboardingSessions.update(member.id, {
    collected,
    askedKeys: [...new Set([...session.askedKeys, ...(turn.field ? [turn.field] : [])])],
    status: complete ? "COMPLETE" : "IN_PROGRESS",
    ...(complete ? { completedAt: new Date() } : {}),
  });

  await repos.conversationTurns.create({
    gymId: member.gymId,
    memberId: member.id,
    direction: "OUTBOUND",
    agent: AGENT,
    text: turn.reply,
    providerMessageId: `onb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  });

  // Persist to long-term memory as we go, not only at the end — a member who
  // drops out halfway still leaves their coach something useful.
  await writeMemories(member, turn.extracted);

  if (complete) await finishOnboarding(member, collected);

  return {
    reply: turn.reply,
    suggestions: turn.suggestions.slice(0, 4),
    progress: onboardingProgress(collected),
    complete,
  };
}

/**
 * Turn answers into durable member memory + structured profile fields.
 * `upsertByKey` dedupes on (member, kind, key), so re-answering updates rather
 * than duplicating — the same mechanism the memory-extraction job uses.
 */
async function writeMemories(member: Member, answers: Record<string, string>) {
  for (const [key, value] of Object.entries(answers)) {
    const field = fieldByKey(key);
    if (!field || !value.trim()) continue;

    // "No injuries" is genuinely useful to a coach, but storing it as an INJURY
    // would make the training engine program around a phantom problem.
    const negative = isNegativeAnswer(value);
    if (field.memoryKind && !(negative && field.memoryKind === "INJURY")) {
      await repos.memberMemories.upsertByKey({
        gymId: member.gymId,
        memberId: member.id,
        kind: negative ? "OTHER" : field.memoryKind,
        key: `onboarding.${field.key}`,
        value: value.trim(),
        confidence: 0.95, // stated directly by the member — the strongest source
        active: true,
      });
    }
  }
}

/** Map the free-text answers onto the structured fields the engines rely on. */
async function finishOnboarding(member: Member, collected: Record<string, string>) {
  const patch: Partial<Member> = { onboardedAt: new Date(), status: "ACTIVE" };

  const height = collected.height ? parseHeightCm(collected.height) : null;
  if (height) patch.heightCm = height;

  const weight = collected.weight ? parseWeightKg(collected.weight) : null;
  if (weight) patch.startWeightKg = weight;

  const sex = collected.gender ? parseSex(collected.gender) : null;
  if (sex) patch.sex = sex;

  const age = collected.age ? parseAge(collected.age) : null;
  if (age) {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - age);
    patch.dateOfBirth = dob;
  }

  if (collected.goal?.trim()) patch.goal = collected.goal.trim();

  // "mornings before work" → 07:00, so the day can be laid out sensibly.
  const availability = collected.availability ?? "";
  if (/morning|before work|am\b/i.test(availability)) patch.preferredTrainingTime = "07:00";
  else if (/lunch|midday|noon/i.test(availability)) patch.preferredTrainingTime = "13:00";
  else if (/evening|after work|night|pm\b/i.test(availability)) patch.preferredTrainingTime = "18:30";

  await repos.members.update(member.id, patch);

  // A first weigh-in, so the Metabolic Twin and progress chart start immediately.
  if (weight) {
    await repos.logs.create({
      gymId: member.gymId,
      memberId: member.id,
      type: "WEIGHT",
      loggedFor: new Date(),
      payload: { weightKg: weight, source: "onboarding" },
    });
  }

  // Tell the coach a new member has landed and is ready for a first plan.
  await repos.outboundMessages.create({
    gymId: member.gymId,
    memberId: member.id,
    body: `👋 ${member.name} finished onboarding — ${
      ONBOARDING_FIELDS.filter((f) => collected[f.key]?.trim()).length
    }/${ONBOARDING_FIELDS.length} questions answered. Ready for a first plan.`,
    status: "DRAFT",
    requiresApproval: true,
  });
}

/** Has this member finished? Used to gate the panel. */
export async function needsOnboarding(member: Member): Promise<boolean> {
  if (member.onboardedAt) return false;
  const session = await repos.onboardingSessions.get(member.id);
  return !session || session.status !== "COMPLETE";
}

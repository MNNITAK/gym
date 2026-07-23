import { classifyInbound, answerConcierge, parseNote } from "@keystone/ai";
import { MEDICAL_DISCLAIMER, screenForSafety, updateStreak } from "@keystone/core";
import { repos } from "@keystone/db";
import { llm, draftMessage, deliverMessage } from "./clients";

export interface InboundMessage {
  providerMessageId: string;
  fromPhone: string;
  phoneNumberId: string;
  profileName?: string;
  text: string;
}

/**
 * Process one inbound member message end-to-end: resolve gym+member → persist the
 * turn → classify intent → route. Idempotent on providerMessageId so a retried
 * webhook never double-handles.
 */
export async function handleInbound(msg: InboundMessage) {
  if (await repos.conversationTurns.existsByProviderMessageId(msg.providerMessageId)) {
    return { handled: false as const };
  }

  const gym = await resolveGym(msg.phoneNumberId);
  if (!gym) return { handled: false as const, reason: "no gym for phoneNumberId" };

  const member = await resolveMember(gym.id, msg);
  const priorActive = member.lastActiveAt;

  await repos.conversationTurns.create({
    gymId: gym.id,
    memberId: member.id,
    direction: "INBOUND",
    text: msg.text,
    providerMessageId: msg.providerMessageId,
  });

  // Safety first — hard override before any engine logic.
  const safety = screenForSafety(msg.text);
  const intent = safety.mustEscalate
    ? "escalate"
    : (await classifyInbound(llm(), msg.text)).intent;

  // Engagement intents extend the member's streak.
  const streakPatch =
    intent === "log" || intent === "ritual"
      ? updateStreak(
          { currentStreak: member.currentStreak, longestStreak: member.longestStreak },
          priorActive,
          new Date(),
        )
      : null;
  await repos.members.update(member.id, {
    lastActiveAt: new Date(),
    ...(streakPatch ?? {}),
  });

  await route(gym.id, member.id, intent, msg.text, safety.mustEscalate);
  return { handled: true as const, intent };
}

async function route(
  gymId: string,
  memberId: string,
  intent: string,
  text: string,
  safetyEscalation: boolean,
): Promise<void> {
  switch (intent) {
    case "escalate": {
      const body = safetyEscalation
        ? `Thanks for reaching out. A coach will personally follow up shortly. ${MEDICAL_DISCLAIMER}`
        : "Thanks — a coach will get back to you shortly.";
      await draftMessage({ gymId, memberId, body, requiresApproval: true });
      break;
    }
    case "note": {
      await repos.notes.create({ gymId, memberId, source: "MEMBER", text });
      // A note may also announce a life event ("wedding on Saturday") — capture it
      // so the Diet Engine can plan around it.
      await captureEvent(gymId, memberId, text);
      break;
    }
    case "log":
    case "ritual": {
      await persistLog(gymId, memberId, text);
      break;
    }
    case "smalltalk":
      break;
    case "concierge":
    default: {
      await handleConcierge(gymId, memberId, text);
      break;
    }
  }
}

/**
 * Concierge bot: answer with member-brain context. Confident, non-escalating
 * answers are auto-sent; anything needing judgment is drafted behind the coach gate.
 */
async function handleConcierge(gymId: string, memberId: string, text: string): Promise<void> {
  const member = await repos.members.get(memberId);
  const gym = await repos.gyms.getBySlug(gymId);
  const memories = (await repos.memberMemories.listActiveByMember(memberId)).map(
    (m) => `${m.key}: ${m.value}`,
  );
  const activePlan = (await repos.plans.listByMemberType(memberId, "DIET")).find(
    (p) => p.status === "ACTIVE",
  );
  const planSummary = activePlan
    ? `On a ${(activePlan.payload as { protocolSlug?: string }).protocolSlug ?? "custom"} diet plan.`
    : undefined;

  // Transactional context: class times, fees and policies so the bot can answer
  // "when's my class", "when's my fee due", "can I pause" from real gym data.
  const gymFacts = JSON.stringify({
    gym: gym?.name,
    classSchedule: gym?.classSchedule ?? [],
    policies: gym?.policies ?? {},
    membership: {
      tier: member?.tier,
      status: member?.status,
      renewalDate: member?.renewalDate?.toISOString().slice(0, 10) ?? null,
      currentStreak: member?.currentStreak,
    },
  });

  const answer = await answerConcierge(llm(), {
    question: text,
    memberName: member?.name ?? "there",
    memories,
    planSummary,
    gymFacts,
  });

  // Requests that change the membership are never actioned by a bot — they're
  // captured for staff with the full context attached.
  if (/pause|freeze|cancel|refund|transfer/i.test(text)) {
    await repos.notes.create({
      gymId,
      memberId,
      source: "SYSTEM",
      text: `Membership request from member: "${text}"`,
    });
  }

  const msg = await draftMessage({
    gymId,
    memberId,
    body: answer.answer,
    requiresApproval: answer.needsEscalation,
  });
  if (!answer.needsEscalation) await deliverMessage(msg.id);
}

/**
 * Persist an inbound log, parsing structured signal from free text so the Metabolic
 * Twin and milestone detection get real data — a weigh-in becomes a WEIGHT log,
 * an intake becomes an INTAKE log, else a CHECKIN.
 */
async function persistLog(gymId: string, memberId: string, text: string): Promise<void> {
  const now = new Date();
  const weight = text.match(/\b(\d{2,3}(?:\.\d+)?)\s?(?:kg|kgs|kilo)/i);
  const kcal = text.match(/\b(\d{3,5})\s?(?:kcal|cal|calories)/i);
  // Fatigue Guardian inputs — without these it runs on defaults forever.
  const sleep = text.match(/\b(\d{1,2}(?:\.\d)?)\s?(?:h|hr|hrs|hours?)\s*(?:of\s*)?sleep|slept\s*(\d{1,2}(?:\.\d)?)/i);
  const rpe = text.match(/\brpe\s*(\d{1,2})/i);
  const soreness = text.match(/\bsore(?:ness)?\s*(\d{1,2})\b/i);

  if (weight) {
    await repos.logs.create({
      gymId, memberId, type: "WEIGHT", loggedFor: now,
      payload: { weightKg: Number(weight[1]), raw: text },
    });
    return;
  }
  if (kcal) {
    await repos.logs.create({
      gymId, memberId, type: "INTAKE", loggedFor: now,
      payload: { kcal: Number(kcal[1]), raw: text },
    });
    return;
  }
  if (sleep) {
    await repos.logs.create({
      gymId, memberId, type: "SLEEP", loggedFor: now,
      payload: { hours: Number(sleep[1] ?? sleep[2]), raw: text },
    });
    return;
  }
  if (rpe) {
    // A session report: RPE, plus any "<exercise> <load>kg x <reps>" sets it mentions.
    await repos.logs.create({
      gymId, memberId, type: "WORKOUT", loggedFor: now,
      payload: { rpe: Number(rpe[1]), sets: parseSets(text), raw: text },
    });
    return;
  }
  await repos.logs.create({
    gymId, memberId, type: "CHECKIN", loggedFor: now,
    payload: { ...(soreness ? { soreness: Number(soreness[1]) } : {}), raw: text },
  });
}

/**
 * Life-aware event capture: parse a note for an upcoming wedding / trip / holiday
 * and store it so the Diet Engine can build a damage-control plan around it.
 * Best-effort — a missed event must never break message handling.
 */
async function captureEvent(gymId: string, memberId: string, text: string): Promise<void> {
  try {
    const parsed = await parseNote(llm(), text);
    const ev = parsed.eventDetected;
    if (!ev) return;
    const date = resolveEventDate(ev.whenHint ?? undefined);
    if (!date) return;
    await repos.events.create({
      gymId,
      memberId,
      type: ev.type.toUpperCase() as "WEDDING" | "TRAVEL" | "HOLIDAY" | "COMPETITION" | "OTHER",
      date,
      label: ev.whenHint ?? null,
      source: "MEMBER",
    });
  } catch {
    /* best-effort */
  }
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Turn a loose hint ("Saturday", "next week", "on the 14th") into a date. */
function resolveEventDate(hint?: string): Date | null {
  if (!hint) return null;
  const h = hint.toLowerCase();
  const now = new Date();

  if (/today|tonight/.test(h)) return now;
  if (/tomorrow/.test(h)) return new Date(now.getTime() + 864e5);

  const weekday = WEEKDAYS.findIndex((d) => h.includes(d));
  if (weekday >= 0) {
    const delta = (weekday - now.getDay() + 7) % 7 || 7; // next occurrence
    return new Date(now.getTime() + delta * 864e5);
  }

  const inDays = h.match(/in\s+(\d{1,2})\s+days?/);
  if (inDays) return new Date(now.getTime() + Number(inDays[1]) * 864e5);
  if (/next week/.test(h)) return new Date(now.getTime() + 7 * 864e5);

  const parsed = Date.parse(hint);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/**
 * Pull structured sets out of a free-text session report so auto-progression has
 * real data, e.g. "bench press 60kg x 12, squat 80kg x 8".
 */
function parseSets(text: string): Array<{ exercise: string; loadKg: number; reps: number }> {
  const out: Array<{ exercise: string; loadKg: number; reps: number }> = [];
  const re = /([a-z][a-z\s-]{2,30}?)\s*(\d{1,3}(?:\.\d)?)\s?kg\s*(?:x|\*|for)\s*(\d{1,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      exercise: m[1]!.trim().replace(/^(and|then|did|i)\s+/i, ""),
      loadKg: Number(m[2]),
      reps: Number(m[3]),
    });
  }
  return out;
}

async function resolveGym(phoneNumberId: string) {
  const byPhone = await repos.gyms.findByPhoneNumberId(phoneNumberId);
  if (byPhone) return byPhone;
  // The simulator (and demo) may not carry a real phone number id.
  return repos.gyms.first();
}

async function resolveMember(gymId: string, msg: InboundMessage) {
  const existing = await repos.members.findByPhone(gymId, msg.fromPhone);
  if (existing) return existing;
  return repos.members.create({
    gymId,
    whatsappPhone: msg.fromPhone,
    name: msg.profileName ?? "New Member",
    status: "PROSPECT",
  });
}

import "./env";
import {
  DietPlanPayloadSchema,
  TrainingPlanPayloadSchema,
  predictCravings,
  describeCraving,
  activeEvent,
  screenForInjury,
  matchMovement,
  rehabProtocolsFor,
  computeTier,
  TIER_PERKS,
  type MemberTierName,
} from "@keystone/core";
import type { MemberContext } from "@keystone/ai";
import { repos, type Member } from "@keystone/db";

// ── The member's own view of their brain ─────────────────────────────────────
// Same data the coach console reads, shaped for the person it's about.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function activePlans(memberId: string) {
  const [diet, training] = await Promise.all([
    repos.plans.listByMemberType(memberId, "DIET"),
    repos.plans.listByMemberType(memberId, "TRAINING"),
  ]);
  return {
    diet: diet.find((p) => p.status === "ACTIVE") ?? null,
    training: training.find((p) => p.status === "ACTIVE") ?? null,
  };
}

/** Today's training day, matched from the active plan by weekday name. */
export function sessionForToday(trainingPayload: unknown, now = new Date()) {
  const parsed = TrainingPlanPayloadSchema.safeParse(trainingPayload);
  if (!parsed.success) return null;
  const today = DAY_NAMES[now.getDay()]!;
  const week = parsed.data.week;
  const match =
    week.find((d) => d.day.toLowerCase().startsWith(today.toLowerCase())) ??
    week[(now.getDay() + 6) % 7] ??
    null;
  return match ? { ...match, deload: parsed.data.deload, protocolSlug: parsed.data.protocolSlug } : null;
}

/** Today's macro targets — coupled to the training day when coupling exists. */
export function targetsForToday(dietPayload: unknown, sessionDay?: string | null) {
  const parsed = DietPlanPayloadSchema.safeParse(dietPayload);
  if (!parsed.success) return null;
  const base = parsed.data.dailyTargets;
  const coupled = parsed.data.coupledDays?.find(
    (d) => sessionDay && d.day.toLowerCase().startsWith(sessionDay.slice(0, 3).toLowerCase()),
  );
  return {
    ...(coupled
      ? { kcal: coupled.kcal, proteinG: coupled.proteinG, carbsG: coupled.carbsG, fatG: coupled.fatG }
      : base),
    coupled: !!coupled,
    intensity: coupled?.intensity ?? null,
    protocolSlug: parsed.data.protocolSlug,
    meals: parsed.data.meals,
    groceryList: parsed.data.groceryList,
  };
}

/** Injured regions from durable memory + recent notes. */
export async function injuriesFor(memberId: string): Promise<string[]> {
  const memories = await repos.memberMemories.listActiveByMember(memberId);
  const notes = await repos.notes.listByMemberRecent(memberId, 5);
  const regions = new Set<string>();
  for (const m of memories) {
    if (m.kind === "INJURY") for (const r of screenForInjury(m.value).regions) regions.add(r);
  }
  for (const n of notes) for (const r of screenForInjury(n.text).regions) regions.add(r);
  return [...regions];
}

/** Assemble everything an agent needs to answer as this member's coach. */
export async function buildAgentContext(member: Member): Promise<MemberContext> {
  const [plans, twin, gym, memoryRecords, injuries, events] = await Promise.all([
    activePlans(member.id),
    repos.metabolicTwins.latestByMember(member.id),
    repos.gyms.getBySlug(member.gymId),
    repos.memberMemories.listActiveByMember(member.id),
    injuriesFor(member.id),
    repos.events.listUpcomingByMember(member.id),
  ]);

  const session = plans.training ? sessionForToday(plans.training.payload) : null;
  const targets = plans.diet ? targetsForToday(plans.diet.payload, session?.day) : null;
  const recentWeightKg = await repos.logs.latestWeightKg(member.id);

  const checkins = await repos.logs.listByMemberTypesSince(
    member.id,
    ["CHECKIN"],
    new Date(Date.now() - 60 * 864e5),
  );
  const notes = await repos.notes.listByMemberRecent(member.id, 40);
  const cravings = predictCravings([
    ...checkins.map((l) => ({ at: l.loggedFor, text: String((l.payload as { raw?: string }).raw ?? "") })),
    ...notes.map((n) => ({ at: n.createdAt, text: n.text })),
  ]);

  const ev = activeEvent(events.map((e) => ({ type: e.type, date: e.date, label: e.label ?? undefined })));

  return {
    name: member.name,
    goal: member.goal ?? "general fitness",
    tier: member.tier,
    currentStreak: member.currentStreak,
    tdee: twin?.computedTdee ?? null,
    usesRegression: twin?.usesRegression ?? false,
    todaysMeals: targets?.meals?.map((m) => ({ name: m.name, items: m.items.map(String) })) ?? [],
    dailyTargets: targets
      ? { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG }
      : null,
    todaysSession: session
      ? {
          day: session.day,
          focus: session.focus,
          intensity: session.intensity,
          exercises: session.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`),
        }
      : null,
    deload: session?.deload ?? false,
    memories: memoryRecords.filter((m) => m.value?.trim()).map((m) => `${m.key}: ${m.value}`),
    injuries,
    upcomingEvent: ev ? ev.headline : null,
    cravingWindows: cravings.slice(0, 2).map(describeCraving),
    recentWeightKg,
    gymFacts: JSON.stringify({
      gym: gym?.name,
      classSchedule: gym?.classSchedule ?? [],
      policies: gym?.policies ?? {},
    }),
    membership: {
      status: member.status,
      renewalDate: member.renewalDate?.toISOString().slice(0, 10) ?? null,
    },
  };
}

/** The member's home screen payload. */
export async function todayFor(member: Member) {
  const [plans, twin, gym, unread, rituals] = await Promise.all([
    activePlans(member.id),
    repos.metabolicTwins.latestByMember(member.id),
    repos.gyms.getBySlug(member.gymId),
    repos.outboundMessages.inboxForMember(member.id, 20),
    repos.rituals.listActiveByGym(member.gymId),
  ]);

  const session = plans.training ? sessionForToday(plans.training.payload) : null;
  const targets = plans.diet ? targetsForToday(plans.diet.payload, session?.day) : null;
  const today = new Date().toISOString().slice(0, 10);

  // Promise.all so four ritual lookups cost one round trip, not four.
  const ritualState = await Promise.all(
    rituals.map(async (r) => ({
      id: r.id,
      kind: r.kind,
      prompt: r.prompt,
      sendAt: r.sendAt,
      done: await repos.ritualCompletions.existsForDay(member.id, r.id, today),
    })),
  );

  const todaysLogs = await repos.logs.listByMemberTypesSince(
    member.id,
    ["WEIGHT", "INTAKE", "WORKOUT", "SLEEP", "CHECKIN"],
    new Date(new Date().setHours(0, 0, 0, 0)),
  );

  return {
    member: {
      id: member.id,
      name: member.name,
      goal: member.goal,
      tier: member.tier,
      perks: TIER_PERKS[member.tier as MemberTierName] ?? [],
      currentStreak: member.currentStreak,
      longestStreak: member.longestStreak,
      status: member.status,
      renewalDate: member.renewalDate ?? null,
    },
    gym: { name: gym?.name ?? "Your gym", classSchedule: gym?.classSchedule ?? [] },
    targets,
    session,
    twin: twin
      ? { tdee: twin.computedTdee, usesRegression: twin.usesRegression, confidence: twin.confidence }
      : null,
    rituals: ritualState,
    loggedToday: {
      weight: todaysLogs.some((l) => l.type === "WEIGHT"),
      food: todaysLogs.filter((l) => l.type === "INTAKE").length,
      workout: todaysLogs.some((l) => l.type === "WORKOUT"),
      sleep: todaysLogs.some((l) => l.type === "SLEEP"),
    },
    unreadMessages: unread.filter((m) => !m.readAt).length,
    hasPlans: { diet: !!plans.diet, training: !!plans.training },
  };
}

/** Progress screen: weight trend, milestones, tier ladder. */
export async function progressFor(member: Member) {
  const [weights, milestones, twin, churn] = await Promise.all([
    repos.logs.listByMemberTypesSince(member.id, ["WEIGHT"], new Date(Date.now() - 180 * 864e5)),
    repos.milestones.listByMember(member.id),
    repos.metabolicTwins.latestByMember(member.id),
    repos.churnScores.latestByMember(member.id),
  ]);

  const series = weights
    .map((l) => ({
      date: l.loggedFor.toISOString().slice(0, 10),
      weightKg: Number((l.payload as { weightKg?: number }).weightKg),
    }))
    .filter((p) => Number.isFinite(p.weightKg));

  const first = series[0]?.weightKg ?? member.startWeightKg ?? null;
  const latest = series.at(-1)?.weightKg ?? null;

  const tenureDays = (Date.now() - member.joinedAt.getTime()) / 864e5;
  // Reuses the memoised log fetch above rather than querying again.
  const recent = await repos.logs.listByMemberTypesSince(
    member.id,
    ["INTAKE", "WEIGHT", "CHECKIN", "WORKOUT"],
    new Date(Date.now() - 14 * 864e5),
  );
  const activeDays = new Set(recent.map((l) => l.loggedFor.toISOString().slice(0, 10))).size;
  const adherence = Math.min(1, activeDays / 14);

  const nextTier = nextTierFrom(member.tier as MemberTierName);
  return {
    weightSeries: series,
    startWeightKg: member.startWeightKg ?? first,
    currentWeightKg: latest,
    changeKg: first != null && latest != null ? Math.round((latest - first) * 10) / 10 : null,
    milestones: milestones.map((m) => ({ id: m.id, title: m.title, type: m.type, at: m.createdAt })),
    twin: twin
      ? {
          tdee: twin.computedTdee,
          formulaTdee: twin.formulaTdee,
          usesRegression: twin.usesRegression,
          confidence: twin.confidence,
          sampleDays: twin.sampleDays,
        }
      : null,
    streak: { current: member.currentStreak, longest: member.longestStreak },
    tier: {
      current: member.tier,
      perks: TIER_PERKS[member.tier as MemberTierName] ?? [],
      next: nextTier,
      nextPerks: nextTier ? TIER_PERKS[nextTier] : [],
      wouldBe: computeTier({ tenureDays, longestStreak: member.longestStreak, adherence }),
    },
    adherence14d: Math.round(adherence * 100),
    // Deliberately NOT exposing the raw churn score to the member — only the
    // coach sees that. We surface the encouraging half.
    engagement: churn ? (churn.risk === "LOW" ? "strong" : churn.risk === "MEDIUM" ? "slipping" : "at risk") : null,
  };
}

function nextTierFrom(t: MemberTierName): MemberTierName | null {
  const order: MemberTierName[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
  const i = order.indexOf(t);
  return i >= 0 && i < order.length - 1 ? order[i + 1]! : null;
}

/** Exercise detail from the curated library — cues, mistakes, the ladder. */
export function exerciseDetail(name: string) {
  const m = matchMovement(name);
  if (!m) return null;
  return {
    slug: m.slug,
    name: m.name,
    pattern: m.pattern,
    equipment: m.equipment,
    level: m.level,
    cues: m.cues,
    commonMistakes: m.commonMistakes,
    contraindicatedFor: m.contraindicatedFor,
    regression: m.regression ? matchMovement(m.regression)?.name ?? m.regression : null,
    progression: m.progression ? matchMovement(m.progression)?.name ?? m.progression : null,
  };
}

export async function rehabFor(memberId: string) {
  return rehabProtocolsFor(await injuriesFor(memberId));
}

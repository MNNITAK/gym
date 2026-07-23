import {
  assertSameTenant,
  mifflinStJeorTdee,
  screenForInjury,
  DietPlanPayloadSchema,
  TrainingPlanPayloadSchema,
  DecisionTrace,
  decideProgression,
  coupleMacrosToTraining,
  predictCravings,
  describeCraving,
  activeEvent,
  substitutionsFor,
  rehabProtocolsFor,
  matchMovement,
  getMovement,
  assertTierAllows,
  FeatureLockedError,
  type Feature,
  type SubscriptionTier,
  type TrainingIntensity,
  type ProgressionDecision,
  type SetPerformance,
  type TrainingPlanPayload,
  type AdherenceInput,
  type FatigueInput,
  type TenantContext,
} from "@keystone/core";
import {
  draftDietPlan,
  parseNote,
  selectDietProtocol,
  reviseDietPlan,
  draftTrainingPlan,
  selectTrainingProtocol,
  reviseTrainingPlan,
  type ProtocolCandidate,
  type TrainingProtocolCandidate,
} from "@keystone/ai";
import { repos, type Log, type Member, type Plan } from "@keystone/db";
import { llm } from "./clients";
import { HttpError } from "./auth";

/**
 * Enforce the subscription tier. Without this the Core/Pro/Elite pricing is
 * decoration — every gym would get the whole product for the Core price.
 */
export async function assertGymTier(gymId: string, feature: Feature): Promise<void> {
  const gym = await repos.gyms.getBySlug(gymId);
  const tier = (gym?.tier ?? "CORE") as SubscriptionTier;
  try {
    assertTierAllows(tier, feature);
  } catch (e) {
    if (e instanceof FeatureLockedError) throw new HttpError(402, e.message);
    throw e;
  }
}

// ── Diet Engine ──────────────────────────────────────────────────────────────

/**
 * Coach-triggered Diet plan generation. Assembles the member brain (Metabolic
 * Twin, memories, notes, adherence), selects a protocol from the library, drafts
 * the plan, and parks it at PENDING_REVIEW — nothing reaches the member unapproved.
 */
export async function generateDietPlan(ctx: TenantContext, memberId: string) {
  const member = await repos.members.get(memberId);
  if (!member) throw new HttpError(404, "Member not found");
  assertSameTenant(ctx, member);
  await assertGymTier(member.gymId, "diet");

  const trace = new DecisionTrace();
  const goal = mapGoal(member.goal);
  const sex: "M" | "F" = member.sex === "F" ? "F" : "M";
  const weightKg = member.startWeightKg ?? 75;

  // ── Metabolic basis (IP #3) ──
  const twin = await repos.metabolicTwins.latestByMember(memberId);
  const formulaTdee = mifflinStJeorTdee({
    sex,
    weightKg,
    heightCm: member.heightCm ?? 170,
    age: ageFrom(member.dateOfBirth) ?? 30,
  });
  const tdee = twin?.computedTdee ?? formulaTdee;
  if (twin?.usesRegression) {
    trace.applied(
      "metabolic",
      "Metabolic Twin",
      `Calories built on this member's own measured metabolism (${tdee} kcal), not a population formula — ${twin.sampleDays} days of data, ${Math.round(twin.confidence * 100)}% confidence.`,
      "logged intake + weight",
    );
  } else {
    trace.info(
      "metabolic",
      "Population formula",
      `Using the Mifflin-St Jeor estimate (${tdee} kcal). Needs ~14 days of paired intake + weight logs before it switches to this member's real metabolism.`,
      "not enough logs yet",
    );
  }

  // ── Durable member memory ──
  const memoryRecords = await repos.memberMemories.listActiveByMember(memberId);
  const memories = memoryRecords.map((m) => `${m.key}: ${m.value}`);
  for (const m of memoryRecords.filter((r) => r.kind === "CONSTRAINT" || r.kind === "PREFERENCE")) {
    if (!m.value?.trim()) continue;
    trace.applied(
      "memory",
      "Member memory",
      `Honoured "${m.key}: ${m.value}" — carried forward from an earlier conversation.`,
      "compounding member memory",
    );
  }

  // ── Free-form Note field (INNOV 02) ──
  const notes = await repos.notes.listByMemberRecent(memberId, 3);
  const noteAdjustments: string[] = [];
  for (const note of notes.slice(0, 2)) {
    try {
      const parsed = await parseNote(llm(), note.text);
      for (const a of parsed.adjustments) {
        noteAdjustments.push(`${a.kind}: ${a.detail}`);
        trace.applied("note", "Note applied", `${a.detail} (${a.kind.replace(/_/g, " ")}).`, "free-form note");
      }
    } catch {
      /* note parsing is best-effort */
    }
  }

  // ── Life-aware events (INNOV 04) ──
  const events = await repos.events.listUpcomingByMember(memberId);
  const eventPlan = activeEvent(
    events.map((e) => ({ type: e.type, date: e.date, label: e.label ?? undefined })),
  );
  if (eventPlan) {
    trace.applied("event", "Life event", eventPlan.headline, `${eventPlan.phase.replace("_", " ")} phase`);
    noteAdjustments.push(`event ${eventPlan.phase}: ${eventPlan.guidance.join(" ")}`);
  }

  // ── Craving prediction (INNOV 06) ──
  // Craving language arrives as BOTH check-ins and free-form notes ("craving
  // sugar again this afternoon" classifies as a note) — read both sources.
  const checkins = await repos.logs.listByMemberTypesSince(
    memberId,
    ["CHECKIN"],
    new Date(Date.now() - 60 * 864e5),
  );
  const recentNotes = await repos.notes.listByMemberRecent(memberId, 40);
  const cravings = predictCravings([
    ...checkins.map((l) => ({
      at: l.loggedFor,
      text: String((l.payload as { raw?: string }).raw ?? ""),
    })),
    ...recentNotes.map((n) => ({ at: n.createdAt, text: n.text })),
  ]);
  for (const c of cravings.slice(0, 2)) {
    trace.applied("craving", "Craving window", describeCraving(c), "learned from check-ins");
    noteAdjustments.push(`craving ${c.window}: ${c.strategy}`);
  }

  // ── Adherence gate (IP #1) ──
  const logs = await repos.logs.listByMemberTypesSince(
    memberId,
    ["INTAKE", "WEIGHT", "CHECKIN"],
    new Date(Date.now() - 14 * 864e5),
  );
  const adherence = buildAdherence(member, logs, goal);

  // ── Protocol library (INNOV 03) ──
  const dietProtocols = await repos.protocols.listByKind("DIET");
  const candidates: ProtocolCandidate[] = dietProtocols.map((p) => ({
    slug: p.slug,
    name: p.name,
    summary: p.summary,
    science: p.science,
  }));
  const choice = await selectDietProtocol(llm(), {
    member: { goal, adherent: adherence.adherence >= 0.6 },
    candidates,
  });
  const protocol =
    candidates.find((c) => c.slug === choice.slug) ??
    candidates[0] ?? { slug: choice.slug, name: choice.slug, summary: "", science: {} };
  const protocolDoc = dietProtocols.find((p) => p.slug === protocol.slug);
  trace.info(
    "protocol",
    "Protocol selected",
    `${protocol.name} — ${choice.rationale}`,
    `chosen from ${candidates.length} in the library`,
  );

  const { payload, adjustmentReason, floorEnforced } = await draftDietPlan(llm(), {
    member: { name: member.name, sex, goal, weightKg },
    tdee,
    protocol,
    memories,
    noteAdjustments,
    adherence,
  });

  // The adherence gate is the headline decision — always surface it.
  if (payload.adjustment === "behavior_intervention") {
    trace.enforced(
      "adherence",
      "Adherence gate",
      `Adherence is ${Math.round(adherence.adherence * 100)}% — calories were NOT cut. A behaviour conversation was flagged for the coach instead.`,
      "adherence-gated adjustment",
    );
  } else {
    trace.info(
      "adherence",
      "Adherence gate",
      `${adjustmentReason} (adherence ${Math.round(adherence.adherence * 100)}%).`,
      "adherence-gated adjustment",
    );
  }
  if (floorEnforced) {
    trace.enforced(
      "safety",
      "Safe calorie floor",
      `The model proposed an unsafe target; calories were clamped to ${payload.dailyTargets.kcal} kcal.`,
      "safety guardrail",
    );
  }

  // ── Cross-engine calorie coupling (IP #2) ──
  const coupling = await coupleToTrainingPlan(memberId, payload.dailyTargets);
  if (coupling) {
    payload.coupledDays = coupling.days;
    trace.applied(
      "coupling",
      "Coupled to training",
      `Macros flex across the week with the training plan — ${coupling.summary}.`,
      "diet ⇄ training coupling",
    );
  }

  const plan = await repos.plans.create({
    gymId: member.gymId,
    memberId,
    type: "DIET",
    status: "PENDING_REVIEW",
    protocolId: protocolDoc?.id ?? null,
    payload: payload as unknown as Record<string, unknown>,
    rationale: choice.rationale,
    stateSnapshot: {
      tdee,
      formulaTdee,
      usesRegression: twin?.usesRegression ?? false,
      adherence: adherence.adherence,
      adjustmentReason,
      floorEnforced,
      memories: memories.length,
      decisions: trace.toArray(),
    },
  });

  return { plan, adjustmentReason, floorEnforced, decisions: trace.toArray() };
}

/**
 * Cross-engine calorie coupling (IP candidate #2): read the member's ACTIVE
 * training plan and modulate each day's macros by that day's intensity —
 * fuel the hard days, pull carbs on the rest days. Computed deterministically
 * from the shared member state, never by the model.
 */
async function coupleToTrainingPlan(
  memberId: string,
  baseline: { kcal: number; proteinG: number; carbsG: number; fatG: number },
): Promise<{ days: CoupledDay[]; summary: string } | null> {
  const training = (await repos.plans.listByMemberType(memberId, "TRAINING")).find(
    (p) => p.status === "ACTIVE",
  );
  if (!training) return null;

  const parsed = TrainingPlanPayloadSchema.safeParse(training.payload);
  if (!parsed.success || parsed.data.week.length === 0) return null;

  const days: CoupledDay[] = parsed.data.week.map((d) => {
    const coupled = coupleMacrosToTraining(baseline, d.intensity as TrainingIntensity);
    return { day: d.day, intensity: d.intensity as TrainingIntensity, focus: d.focus, ...coupled };
  });

  const high = days.filter((d) => d.intensity === "high").length;
  const low = days.filter((d) => d.intensity === "low" || d.intensity === "rest").length;
  const range = `${Math.min(...days.map((d) => d.kcal))}–${Math.max(...days.map((d) => d.kcal))} kcal`;
  return {
    days,
    summary: `${range} across ${days.length} days (${high} hard, ${low} easy), protein held constant`,
  };
}

interface CoupledDay {
  day: string;
  intensity: TrainingIntensity;
  focus?: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

// ── Training Engine ──────────────────────────────────────────────────────────

/**
 * Coach-triggered Training plan generation. Screens memory + notes for injuries,
 * computes the Fatigue Guardian input from recent logs, selects a protocol from
 * the Trend Library, and parks a drafted week at PENDING_REVIEW.
 */
export async function generateTrainingPlan(ctx: TenantContext, memberId: string) {
  const member = await repos.members.get(memberId);
  if (!member) throw new HttpError(404, "Member not found");
  assertSameTenant(ctx, member);
  await assertGymTier(member.gymId, "training");

  const trace = new DecisionTrace();
  const goal = mapGoal(member.goal);
  const experience = mapExperience(member.goal);
  const daysPerWeek = 4;

  // ── Injury-aware programming (INNOV 04) ──
  const memoryRecords = await repos.memberMemories.listActiveByMember(memberId);
  const memories = memoryRecords.map((m) => `${m.key}: ${m.value}`);
  const injuredRegions = new Set<string>();
  for (const m of memoryRecords) {
    if (m.kind === "INJURY") for (const r of screenForInjury(m.value).regions) injuredRegions.add(r);
  }
  const notes = await repos.notes.listByMemberRecent(memberId, 5);
  for (const n of notes) for (const r of screenForInjury(n.text).regions) injuredRegions.add(r);

  // Movement library (INNOV 05) supplies the safe substitutions, not the model.
  const subs = substitutionsFor([...injuredRegions]);
  for (const s of subs) {
    trace.enforced(
      "injury",
      "Injury substitution",
      `${s.avoid.name} is contraindicated for the ${s.region.replace(/_/g, " ")} — programmed ${s.use?.name ?? "a safe alternative"} instead.`,
      "movement library",
    );
  }

  // Parallel rehab progression (INNOV 04) — coach-supervised, tracked to milestones.
  const rehab = rehabProtocolsFor([...injuredRegions]);
  for (const r of rehab) {
    trace.applied(
      "injury",
      "Rehab protocol",
      `${r.name} runs alongside training — stage 1: ${r.stages[0]!.focus}. Advances only on coach sign-off.`,
      "rehab library",
    );
  }

  // ── Fatigue Guardian (INNOV 02) ──
  const logs = await repos.logs.listByMemberTypesSince(
    memberId,
    ["WORKOUT", "SLEEP", "CHECKIN"],
    new Date(Date.now() - 14 * 864e5),
  );
  const priorPlans = await repos.plans.listByMemberType(memberId, "TRAINING");
  const fatigueInput = buildFatigue(logs, priorPlans);

  // ── Auto-progression from logged sets (INNOV 06) ──
  const progressions = progressionsFromLogs(logs);
  for (const p of progressions.slice(0, 4)) {
    trace.applied(
      "progression",
      "Auto-progression",
      `${p.exercise}: ${p.decision.reason} → ${p.decision.nextLoadKg}kg.`,
      "logged sets",
    );
  }

  // ── Trend Library (INNOV 01) ──
  const trainingProtocols = await repos.protocols.listByKind("TRAINING");
  const candidates: TrainingProtocolCandidate[] = trainingProtocols.map((p) => ({
    slug: p.slug,
    name: p.name,
    summary: p.summary,
    science: p.science,
  }));
  const eventDate = member.eventDate ? member.eventDate.toISOString().slice(0, 10) : undefined;
  const choice = await selectTrainingProtocol(llm(), {
    member: { goal, experience, daysPerWeek, eventDate },
    candidates,
  });
  const protocol =
    candidates.find((c) => c.slug === choice.slug) ??
    candidates[0] ?? { slug: choice.slug, name: choice.slug, summary: "", science: {} };
  const protocolDoc = trainingProtocols.find((p) => p.slug === protocol.slug);
  trace.info(
    "protocol",
    "Protocol selected",
    `${protocol.name} — ${choice.rationale}`,
    `chosen from ${candidates.length} in the Trend Library`,
  );

  // ── Hybrid Athlete mode (INNOV 03) ──
  if (member.eventDate) {
    const weeksOut = Math.max(
      0,
      Math.round((member.eventDate.getTime() - Date.now()) / (7 * 864e5)),
    );
    trace.applied(
      "protocol",
      "Hybrid athlete mode",
      `Peaking for ${member.eventName ?? "their event"} — ${weeksOut} week${weeksOut === 1 ? "" : "s"} out, so the week is built around that date.`,
      "event target",
    );
  }

  const { payload, fatigue } = await draftTrainingPlan(llm(), {
    member: { name: member.name, goal, experience, daysPerWeek },
    protocol,
    memories,
    injuredRegions: [...injuredRegions],
    fatigue: fatigueInput,
    eventTargetDate: eventDate,
    prescribedLoads: progressions.map((p) => ({ exercise: p.exercise, loadKg: p.decision.nextLoadKg })),
  });

  if (fatigue.deload) {
    trace.enforced(
      "fatigue",
      "Fatigue Guardian",
      `Deload week forced — ${fatigue.reasons.join("; ")}. The member cannot train through this.`,
      "RPE / sleep / soreness",
    );
  } else {
    trace.info("fatigue", "Fatigue Guardian", `Recovery looks ${fatigue.level}; normal training week.`, "RPE / sleep / soreness");
  }

  // Enrich the model's exercises with curated library data + enforce progression loads.
  const enriched = enrichWithMovementLibrary(payload, progressions, trace);

  const plan = await repos.plans.create({
    gymId: member.gymId,
    memberId,
    type: "TRAINING",
    status: "PENDING_REVIEW",
    protocolId: protocolDoc?.id ?? null,
    payload: enriched as unknown as Record<string, unknown>,
    rationale: choice.rationale,
    stateSnapshot: {
      deload: fatigue.deload,
      fatigueLevel: fatigue.level,
      fatigueReasons: fatigue.reasons,
      injuredRegions: [...injuredRegions],
      rehab: rehab.map((r) => ({ region: r.region, name: r.name, stages: r.stages, redFlags: r.redFlags })),
      progressions: progressions.map((p) => ({ exercise: p.exercise, ...p.decision })),
      decisions: trace.toArray(),
    },
  });

  return { plan, fatigue, injuredRegions: [...injuredRegions], decisions: trace.toArray() };
}

/**
 * Auto-progression (Training INNOV 06): group the member's logged sets by
 * exercise and let the deterministic rule decide next week's load. Every
 * decision comes from real logs, never from a calendar or the model.
 */
function progressionsFromLogs(logs: Log[]) {
  const byExercise = new Map<string, SetPerformance[]>();
  for (const l of logs) {
    if (l.type !== "WORKOUT") continue;
    const sets = (l.payload as { sets?: unknown[] }).sets;
    if (!Array.isArray(sets)) continue;
    for (const raw of sets) {
      const s = raw as { exercise?: string; reps?: number; rpe?: number; loadKg?: number };
      if (!s.exercise || typeof s.reps !== "number" || typeof s.loadKg !== "number") continue;
      const key = s.exercise.trim();
      const list = byExercise.get(key) ?? [];
      list.push({ reps: s.reps, rpe: s.rpe, loadKg: s.loadKg });
      byExercise.set(key, list);
    }
  }

  const out: Array<{ exercise: string; decision: ProgressionDecision }> = [];
  for (const [exercise, sets] of byExercise) {
    const movement = matchMovement(exercise);
    // Barbell lifts jump 2.5kg; everything else 1kg.
    const incrementKg = movement?.equipment.includes("barbell") ? 2.5 : 1;
    out.push({ exercise, decision: decideProgression({ repRange: [8, 12], sets, incrementKg }) });
  }
  return out;
}

/**
 * Fold the curated movement library into the generated week: real cues, real
 * mistake lists, and a real regression/progression ladder replace whatever the
 * model invented. Also stamps auto-progression loads onto matching exercises.
 */
function enrichWithMovementLibrary(
  payload: TrainingPlanPayload,
  progressions: Array<{ exercise: string; decision: ProgressionDecision }>,
  trace: DecisionTrace,
): TrainingPlanPayload {
  let matched = 0;
  for (const day of payload.week) {
    for (const ex of day.exercises) {
      const m = matchMovement(ex.name);
      if (m) {
        matched += 1;
        ex.name = m.name; // canonical name
        if (m.regression) ex.regression = getMovement(m.regression)?.name ?? ex.regression;
        if (m.progression) ex.progression = getMovement(m.progression)?.name ?? ex.progression;
      }
      const p = progressions.find(
        (x) => x.exercise.toLowerCase() === ex.name.toLowerCase() && x.decision.nextLoadKg > 0,
      );
      if (p) ex.loadKg = p.decision.nextLoadKg;
    }
  }
  if (matched > 0) {
    trace.applied(
      "progression",
      "Movement library",
      `${matched} exercise${matched === 1 ? "" : "s"} matched the curated library — cues, common mistakes and the regression/progression ladder come from it, not from the model.`,
      "curated movement library",
    );
  }
  return payload;
}

// ── Coach-directed revision (chat with the AI about a drafted plan) ──────────

/**
 * Apply a coach's plain-language instruction to a plan that is awaiting review.
 * The plan is rewritten in place and STAYS at PENDING_REVIEW — revising is not
 * approving. The deterministic guardrails re-run inside the engine afterwards, so
 * no instruction can move a plan past the calorie floor, the adherence gate, or a
 * forced deload.
 */
export async function revisePlan(
  ctx: TenantContext,
  planId: string,
  instruction: string,
) {
  const text = instruction.trim();
  if (!text) throw new HttpError(400, "Say what you'd like changed.");

  const plan = await repos.plans.get(planId);
  if (!plan) throw new HttpError(404, "Plan not found");
  assertSameTenant(ctx, plan);
  if (plan.status !== "PENDING_REVIEW") {
    throw new HttpError(400, `Only plans awaiting review can be revised (this one is ${plan.status}).`);
  }

  const member = await repos.members.get(plan.memberId);
  if (!member) throw new HttpError(404, "Member not found");

  const memoryRecords = await repos.memberMemories.listActiveByMember(plan.memberId);
  const memories = memoryRecords.map((m) => `${m.key}: ${m.value}`);
  const history = (plan.revisions ?? []).map((r) => ({ role: r.role, text: r.text }));

  let payload: Record<string, unknown>;
  let summary: string;

  if (plan.type === "DIET") {
    const current = DietPlanPayloadSchema.parse(plan.payload);
    const snapshot = (plan.stateSnapshot ?? {}) as { tdee?: number };
    const res = await reviseDietPlan(llm(), {
      current,
      instruction: text,
      history,
      member: {
        name: member.name,
        sex: member.sex === "F" ? "F" : "M",
        goal: mapGoal(member.goal),
        weightKg: member.startWeightKg ?? 75,
      },
      tdee: snapshot.tdee ?? 2200,
      memories,
    });
    payload = res.payload as unknown as Record<string, unknown>;
    // The model narrates unreliably; the clamp is what actually happened, so state
    // the enforced number rather than trusting the summary's version of it.
    summary = res.floorEnforced
      ? `${res.summary} — Safety floor enforced: daily calories held at ${res.payload.dailyTargets.kcal} kcal.`
      : res.summary;
  } else {
    const current = TrainingPlanPayloadSchema.parse(plan.payload);
    const snapshot = (plan.stateSnapshot ?? {}) as { injuredRegions?: string[] };
    const res = await reviseTrainingPlan(llm(), {
      current,
      instruction: text,
      history,
      member: {
        name: member.name,
        goal: mapGoal(member.goal),
        experience: mapExperience(member.goal),
      },
      memories,
      injuredRegions: snapshot.injuredRegions ?? [],
    });
    payload = res.payload as unknown as Record<string, unknown>;
    summary = res.payload.deload
      ? `${res.summary} (Deload week is still enforced by the Fatigue Guardian.)`
      : res.summary;
  }

  const now = new Date();
  const revisions = [
    ...(plan.revisions ?? []),
    { role: "COACH" as const, text, at: now },
    { role: "AI" as const, text: summary, at: now },
  ];

  return repos.plans.update(planId, {
    payload,
    revisions,
    version: (plan.version ?? 1) + 1,
    status: "PENDING_REVIEW",
  });
}

// ── Shared helpers ───────────────────────────────────────────────────────────

export function mapGoal(goal?: string | null): "lose" | "gain" | "maintain" {
  const g = (goal ?? "").toLowerCase();
  if (/lose|fat|cut|lean/.test(g)) return "lose";
  if (/gain|bulk|muscle|mass|strength/.test(g)) return "gain";
  return "maintain";
}

function mapExperience(goal?: string | null): "novice" | "intermediate" | "advanced" {
  const g = (goal ?? "").toLowerCase();
  if (/advanced|elite|competit/.test(g)) return "advanced";
  if (/intermediate|experienced/.test(g)) return "intermediate";
  return "novice";
}

function ageFrom(dob?: Date | null): number | undefined {
  if (!dob) return undefined;
  return Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365));
}

/**
 * Too little history (a fresh member) → a neutral, on-track signal so the first
 * plan is a clean baseline rather than a spurious "plateau" cut.
 */
function buildAdherence(
  member: Member,
  logs: Log[],
  goal: "lose" | "gain" | "maintain",
): AdherenceInput {
  const expectedWeeklyChangeKg = 0.35;
  if (logs.length < 5) {
    return {
      adherence: 0.9,
      weightChangeKg: goal === "lose" ? -0.4 : goal === "gain" ? 0.4 : 0,
      goal,
      expectedWeeklyChangeKg,
    };
  }
  const days = new Set(logs.map((l) => l.loggedFor.toISOString().slice(0, 10)));
  const adherence = Math.min(1, days.size / 14);
  const weights = logs
    .filter((l) => l.type === "WEIGHT")
    .map((l) => (l.payload as { weightKg?: number }).weightKg)
    .filter((w): w is number => typeof w === "number");
  const weightChangeKg = weights.length >= 2 ? weights[weights.length - 1]! - weights[0]! : 0;
  return { adherence, weightChangeKg, goal, expectedWeeklyChangeKg };
}

/** Sparse history → a fresh, well-recovered default so a first plan isn't deloaded. */
function buildFatigue(logs: Log[], priorPlans: Plan[]): FatigueInput {
  const workouts = logs.filter((l) => l.type === "WORKOUT");
  const rpes = workouts
    .map((l) => (l.payload as { rpe?: number }).rpe)
    .filter((r): r is number => typeof r === "number");
  const sleeps = logs
    .filter((l) => l.type === "SLEEP")
    .map((l) => (l.payload as { hours?: number }).hours)
    .filter((h): h is number => typeof h === "number");
  const soreness = logs
    .filter((l) => l.type === "CHECKIN")
    .map((l) => (l.payload as { soreness?: number }).soreness)
    .filter((s): s is number => typeof s === "number");
  const failedSets = workouts.reduce(
    (n, l) => n + (Number((l.payload as { failedSets?: number }).failedSets) || 0),
    0,
  );
  const avg = (xs: number[], fallback: number) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;

  let weeksSinceDeload = 0;
  for (const p of priorPlans) {
    if ((p.payload as { deload?: boolean }).deload === true) break;
    weeksSinceDeload += 1;
  }

  return {
    avgRpe: avg(rpes, 7),
    avgSleepHours: avg(sleeps, 7.5),
    soreness: Math.round(avg(soreness, 2)),
    weeksSinceDeload,
    failedSets,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATASET — five members with a full month of believable history.
//
// Run with: pnpm db:seed:demo
//
// Every member is built to make a different AI feature land live:
//   Aarav   — 30 days of clean logs → Metabolic Twin flips to REGRESSION
//   Priya   — vegetarian + knee injury → Hearth honours it, Forge programs around it
//   Rohan   — high RPE, poor sleep, 7 weeks no deload → Fatigue Guardian FORCES a deload
//   Neha    — logging stopped 12 days ago → churn HIGH, lands in the retention queue
//   Kabir   — plateaued at low adherence → the adherence gate refuses to cut calories
//
// It layers on top of the base seed (gym, coach, protocols, rituals).
// ─────────────────────────────────────────────────────────────────────────────
import bcrypt from "bcryptjs";
import { repos } from "./index.js";
import { buildDietPlan, buildTrainingPlan, couple } from "./seed-plans.js";

const MEMBER_PASSWORD = process.env.DEMO_MEMBER_PASSWORD ?? "member-demo";
const GYM_SLUG = "demo-gym";

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);
const daysAhead = (n: number) => new Date(Date.now() + n * 864e5);
const round1 = (n: number) => Math.round(n * 10) / 10;

interface DemoMember {
  phone: string;
  name: string;
  goal: string;
  sex: "M" | "F";
  heightCm: number;
  startWeightKg: number;
  joinedDaysAgo: number;
  currentStreak: number;
  longestStreak: number;
  renewalInDays: number;
  /** the member's real maintenance calories — the twin must rediscover this */
  trueTdee: number;
  /** how they actually eat relative to that */
  intakeDelta: number;
  /** 0..1 — how many days they actually log */
  logRate: number;
  /** they stopped logging this many days ago (0 = still engaged) */
  wentQuietDaysAgo: number;
  avgRpe: number;
  avgSleep: number;
  weeksSinceDeload: number;
  memories: Array<{ kind: "PREFERENCE" | "CONSTRAINT" | "INJURY" | "MOTIVATION"; key: string; value: string }>;
  notes: string[];
  eventInDays?: number;
  eventType?: "WEDDING" | "TRAVEL" | "HOLIDAY";
  /** diet protocol for their ACTIVE plan */
  dietProtocol: string;
  /** training protocol + whether this week is a forced deload */
  trainingProtocol: string;
  deload?: boolean;
  /** vegetarian members must never be handed meat, even in seeded data */
  vegetarian?: boolean;
  /** regions to keep unloaded in the seeded week */
  avoid?: string[];
}

const MEMBERS: DemoMember[] = [
  {
    phone: "+919000000001", name: "Aarav Sharma", goal: "lose fat",
    sex: "M", heightCm: 178, startWeightKg: 84, joinedDaysAgo: 130,
    currentStreak: 26, longestStreak: 31, renewalInDays: 18,
    trueTdee: 2620, intakeDelta: -480, logRate: 0.95, wentQuietDaysAgo: 0,
    avgRpe: 7.2, avgSleep: 7.4, weeksSinceDeload: 2,
    dietProtocol: "mini-cut", trainingProtocol: "upper-lower",
    memories: [
      { kind: "PREFERENCE", key: "dislikes", value: "does not enjoy paneer, prefers chicken and eggs" },
      { kind: "MOTIVATION", key: "motivation", value: "motivated by numbers and PRs, not compliments" },
      { kind: "PREFERENCE", key: "schedule", value: "trains early morning before work" },
    ],
    notes: ["Work has been steady, sleeping well. Feeling strong in the gym."],
  },
  {
    phone: "+919000000003", name: "Priya Menon", goal: "lose fat",
    sex: "F", heightCm: 163, startWeightKg: 71, joinedDaysAgo: 220,
    currentStreak: 19, longestStreak: 44, renewalInDays: 6,
    trueTdee: 2050, intakeDelta: -380, logRate: 0.85, wentQuietDaysAgo: 0,
    avgRpe: 7.0, avgSleep: 7.0, weeksSinceDeload: 3,
    dietProtocol: "mini-cut", trainingProtocol: "full-body",
    vegetarian: true, avoid: ["knee"],
    memories: [
      { kind: "CONSTRAINT", key: "diet", value: "strict vegetarian — no meat, fish or eggs" },
      { kind: "INJURY", key: "injury.knee", value: "left knee pain on deep squats since March" },
      { kind: "PREFERENCE", key: "cuisine", value: "prefers South Indian food, eats rice daily" },
    ],
    notes: [
      "Left knee has been aching after leg day, especially on squats.",
      "Trying to keep grocery costs down this month.",
    ],
    eventInDays: 5, eventType: "WEDDING",
  },
  {
    phone: "+919000000004", name: "Rohan Das", goal: "gain muscle",
    sex: "M", heightCm: 181, startWeightKg: 68, joinedDaysAgo: 100,
    currentStreak: 22, longestStreak: 22, renewalInDays: 31,
    trueTdee: 2750, intakeDelta: +320, logRate: 0.9, wentQuietDaysAgo: 0,
    // Hammering himself: high RPE, bad sleep, no deload in 7 weeks.
    avgRpe: 9.1, avgSleep: 5.4, weeksSinceDeload: 7,
    dietProtocol: "reverse-diet", trainingProtocol: "ppl", deload: true,
    memories: [
      { kind: "MOTIVATION", key: "motivation", value: "wants visible arms by his brother's wedding" },
      { kind: "PREFERENCE", key: "training", value: "loves heavy pressing, skips legs when tired" },
    ],
    notes: ["Been pushing really hard, only getting 5 hours sleep with work deadlines."],
  },
  {
    phone: "+919000000005", name: "Neha Kulkarni", goal: "lose fat",
    sex: "F", heightCm: 158, startWeightKg: 66, joinedDaysAgo: 55,
    currentStreak: 0, longestStreak: 11, renewalInDays: 4,
    trueTdee: 1900, intakeDelta: -150, logRate: 0.8, wentQuietDaysAgo: 12,
    avgRpe: 6.5, avgSleep: 6.2, weeksSinceDeload: 2,
    dietProtocol: "maintenance", trainingProtocol: "full-body",
    memories: [
      { kind: "CONSTRAINT", key: "schedule", value: "two young children — can only train 3 days a week" },
      { kind: "MOTIVATION", key: "motivation", value: "responds to encouragement, discouraged by strict targets" },
    ],
    notes: ["Kids have been unwell, haven't been able to get to the gym."],
  },
  {
    phone: "+919000000006", name: "Kabir Anand", goal: "lose fat",
    sex: "M", heightCm: 175, startWeightKg: 95, joinedDaysAgo: 85,
    currentStreak: 4, longestStreak: 9, renewalInDays: 12,
    // Eating near maintenance and logging half the time — a real plateau.
    trueTdee: 2500, intakeDelta: -60, logRate: 0.45, wentQuietDaysAgo: 0,
    avgRpe: 7.5, avgSleep: 6.4, weeksSinceDeload: 3,
    dietProtocol: "maintenance", trainingProtocol: "upper-lower",
    memories: [
      { kind: "PREFERENCE", key: "eating", value: "eats out with clients 3-4 nights a week" },
      { kind: "CONSTRAINT", key: "travel", value: "travels for work most weeks" },
    ],
    notes: ["Client dinners most nights, hard to stay on plan.", "Weight hasn't moved in three weeks."],
    eventInDays: 9, eventType: "TRAVEL",
  },
];

async function main() {
  const gym = await repos.gyms.getBySlug(GYM_SLUG);
  if (!gym) throw new Error(`Run "pnpm db:seed" first — gym "${GYM_SLUG}" not found.`);

  // ── Reset first ──
  // Re-seeding onto an existing member leaves the previous history in place, so
  // someone scripted to have gone quiet still looks active and every derived
  // number (churn, adherence, the twin) is computed from the wrong data. Clear
  // the demo gym down to a known state. Scoped to this gym only.
  const existing = await repos.members.listByGym(gym.id);
  if (existing.length > 0) {
    process.stdout.write(`Resetting ${existing.length} existing member(s) in "${GYM_SLUG}"… `);
    let purged = 0;
    for (const m of existing) purged += await repos.purgeMemberData(m.id);
    await repos.deleteWhere("members", "gymId", gym.id);
    console.log(`removed ${purged} records.\n`);
  }

  const coach = await repos.staff.findByEmail("coach@demo.gym");
  const passwordHash = await bcrypt.hash(MEMBER_PASSWORD, 10);
  let totalLogs = 0;

  for (const d of MEMBERS) {
    const member = await repos.members.upsert({
      gymId: gym.id,
      whatsappPhone: d.phone,
      name: d.name,
      status: "ACTIVE",
      goal: d.goal,
      sex: d.sex,
      heightCm: d.heightCm,
      startWeightKg: d.startWeightKg,
      joinedAt: daysAgo(d.joinedDaysAgo),
      lastActiveAt: daysAgo(d.wentQuietDaysAgo),
      currentStreak: d.currentStreak,
      longestStreak: d.longestStreak,
      renewalDate: daysAhead(d.renewalInDays),
      coachId: coach?.id ?? null,
      passwordHash,
      // Seeded members arrive with a full profile and a month of history, so
      // they must not be routed into onboarding — that flow is for new signups.
      onboardedAt: daysAgo(d.joinedDaysAgo),
      preferredTrainingTime: "18:00",
    });

    // ── 30 days of history ──
    // Weight follows energy balance so the Metabolic Twin can recover trueTdee.
    const kgPerDay = d.intakeDelta / 7700;
    let weight = d.startWeightKg;
    // Accumulate, then write in one batched commit — see logs.createMany.
    const pending: Array<Parameters<typeof repos.logs.create>[0]> = [];

    for (let i = 30; i >= 0; i--) {
      const day = daysAgo(i);
      const quiet = d.wentQuietDaysAgo > 0 && i < d.wentQuietDaysAgo;
      const logsToday = !quiet && pseudoRandom(d.phone, i) < d.logRate;

      if (logsToday) {
        // A little day-to-day noise, or the regression looks synthetic.
        const noise = (pseudoRandom(d.phone, i + 500) - 0.5) * 260;
        pending.push({
          gymId: gym.id, memberId: member.id, type: "INTAKE", loggedFor: day,
          payload: { kcal: Math.round(d.trueTdee + d.intakeDelta + noise), raw: "logged in app" },
        });
        pending.push({
          gymId: gym.id, memberId: member.id, type: "WEIGHT", loggedFor: day,
          payload: { weightKg: round1(weight + (pseudoRandom(d.phone, i + 900) - 0.5) * 0.6) },
        });

        // Training days: RPE + sets, so Fatigue Guardian and auto-progression have input.
        if (i % 2 === 0) {
          const week = Math.floor((30 - i) / 7);
          pending.push({
            gymId: gym.id, memberId: member.id, type: "WORKOUT", loggedFor: day,
            payload: {
              rpe: round1(d.avgRpe + (pseudoRandom(d.phone, i + 77) - 0.5)),
              sets: [
                { exercise: "Barbell Back Squat", loadKg: 60 + week * 2.5, reps: 8 + (i % 4) },
                { exercise: "Bench Press", loadKg: 45 + week * 2.5, reps: 8 + (i % 3) },
                { exercise: "Barbell Row", loadKg: 40 + week * 2.5, reps: 10 },
              ],
              raw: "session logged",
            },
          });
          pending.push({
            gymId: gym.id, memberId: member.id, type: "SLEEP", loggedFor: day,
            payload: { hours: round1(d.avgSleep + (pseudoRandom(d.phone, i + 33) - 0.5)) },
          });
        }
      }
      weight += kgPerDay;
    }
    totalLogs += await repos.logs.createMany(pending);

    // ── Durable memory (the switching cost, visible on day one of the demo) ──
    for (const m of d.memories) {
      await repos.memberMemories.upsertByKey({
        gymId: gym.id, memberId: member.id,
        kind: m.kind, key: m.key, value: m.value,
        confidence: 0.9, active: true,
      });
    }

    // ── Free-form notes ──
    for (const text of d.notes) {
      await repos.notes.create({ gymId: gym.id, memberId: member.id, source: "MEMBER", text });
    }

    // ── An upcoming life event for the ones that have one ──
    if (d.eventInDays && d.eventType) {
      await repos.events.create({
        gymId: gym.id, memberId: member.id,
        type: d.eventType, date: daysAhead(d.eventInDays),
        label: `in ${d.eventInDays} days`, source: "MEMBER",
      });
    }

    // ── An ACTIVE diet + training plan, so Diet and Training are never empty ──
    const diet = buildDietPlan({
      protocolSlug: d.dietProtocol,
      tdee: d.trueTdee,
      delta: d.intakeDelta,
      weightKg: d.startWeightKg,
      vegetarian: d.vegetarian,
    });
    const training = buildTrainingPlan({
      protocolSlug: d.trainingProtocol,
      deload: d.deload,
      avoid: d.avoid,
    });

    await repos.plans.create({
      gymId: gym.id, memberId: member.id, type: "TRAINING", status: "ACTIVE",
      payload: training as unknown as Record<string, unknown>,
      rationale: d.deload
        ? "Deload week — recovery markers called for it."
        : `${d.trainingProtocol} suits their experience and available days.`,
      stateSnapshot: { deload: !!d.deload, injuredRegions: d.avoid ?? [] },
    });
    await repos.plans.create({
      gymId: gym.id, memberId: member.id, type: "DIET", status: "ACTIVE",
      payload: { ...diet, coupledDays: couple(diet, training) } as unknown as Record<string, unknown>,
      rationale: `${d.dietProtocol} fits their goal and current adherence.`,
      stateSnapshot: { tdee: d.trueTdee },
    });

    console.log(
      `  ${d.name.padEnd(16)} ${String(d.trueTdee).padStart(4)} kcal true TDEE · ` +
        `${d.wentQuietDaysAgo ? `quiet ${d.wentQuietDaysAgo}d` : `streak ${d.currentStreak}`} · ` +
        `${d.memories.length} memories · plans: ${d.dietProtocol}/${d.trainingProtocol}${d.deload ? " (deload)" : ""}`,
    );
  }

  console.log(`\nSeeded ${MEMBERS.length} demo members · ${totalLogs} logs over 30 days`);
  console.log(`Member login: any of the numbers above / ${MEMBER_PASSWORD}`);
  console.log(`\nNext: run the engine jobs so the AI has computed state:`);
  console.log(`  open the coach console → Overview → "Run engine jobs"`);
}

/** Deterministic pseudo-random so re-seeding produces the same history. */
function pseudoRandom(seed: string, n: number): number {
  let h = 2166136261;
  const s = `${seed}:${n}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

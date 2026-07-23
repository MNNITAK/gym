// Seed one demo gym into Firestore so the full member→coach→member loop is runnable.
// Runs against the emulator when FIRESTORE_EMULATOR_HOST is set.
import bcrypt from "bcryptjs";
import { repos } from "./index.js";

// The demo coach gets a REAL password hash so the console works on a deployed
// (production) environment without loosening auth. Override via env.
const DEMO_PASSWORD = process.env.DEMO_COACH_PASSWORD ?? "keystone-demo";
// Members sign into their own panel with their phone number.
const MEMBER_PASSWORD = process.env.DEMO_MEMBER_PASSWORD ?? "member-demo";

// Protocol Library (Diet INNOV 03) — the six the proposal promises at launch.
const DIET_PROTOCOLS = [
  {
    slug: "maintenance",
    name: "TDEE Maintenance",
    summary: "Eat at maintenance while dialing in adherence and habits.",
    science: { selectWhen: "New member, or a diet break is needed.", calorieDelta: 0, proteinPerKg: 1.8, contraindications: ["none"] },
  },
  {
    slug: "mini-cut",
    name: "Mini-Cut",
    summary: "Aggressive 4–6 week fat-loss phase for lean-ish members.",
    science: { selectWhen: "Adherent and motivated, wants visible progress fast.", calorieDelta: -500, proteinPerKg: 2.2, maxWeeks: 6, contraindications: ["low adherence", "high stress"] },
  },
  {
    slug: "reverse-diet",
    name: "Reverse Diet",
    summary: "Slowly raise calories post-cut to restore metabolism.",
    science: { selectWhen: "Coming off a prolonged deficit.", calorieDeltaPerWeek: 75, proteinPerKg: 2.0 },
  },
  {
    slug: "carb-cycling",
    name: "Carb Cycling",
    summary: "High-carb on hard training days, low-carb on rest days — fuel where it counts.",
    science: { selectWhen: "Trains 4+ days/week with clearly varied intensity.", highDayCarbG: 4.5, lowDayCarbG: 2, proteinPerKg: 2.2, pairsWith: "training coupling" },
  },
  {
    slug: "refeed",
    name: "Structured Refeed",
    summary: "Planned 1–2 day carbohydrate refeed inside a longer deficit.",
    science: { selectWhen: "4+ weeks in a deficit, energy and performance dropping.", refeedDays: 2, carbMultiplier: 1.8, keepFatLow: true },
  },
  {
    slug: "psmf",
    name: "Protein-Sparing Modified Fast",
    summary: "Short, tightly-supervised very-low-calorie phase with very high protein.",
    science: { selectWhen: "Experienced, medically cleared, short sharp phase only.", maxDays: 14, proteinPerKg: 2.6, requiresCoachSignoff: true, contraindications: ["novice", "any ED history", "pregnancy"] },
  },
];

// Trend Library — the versioned training protocol catalog (Phase 4 expansion).
const TRAINING_PROTOCOLS = [
  {
    slug: "stronglifts-5x5",
    name: "StrongLifts 5×5",
    summary: "Linear-progression barbell strength for beginners.",
    science: { selectWhen: "Novice, 3 days/week, strength goal.", daysPerWeek: 3, deloadTrigger: "3 failed sessions" },
  },
  {
    slug: "full-body",
    name: "3-Day Full Body",
    summary: "Whole-body sessions 3×/week — high frequency for novices.",
    science: { selectWhen: "Novice or time-limited, general fitness.", daysPerWeek: 3 },
  },
  {
    slug: "upper-lower",
    name: "Upper / Lower",
    summary: "4-day upper/lower split balancing strength and size.",
    science: { selectWhen: "Early-intermediate, 4 days/week.", daysPerWeek: 4 },
  },
  {
    slug: "ppl",
    name: "Push / Pull / Legs",
    summary: "Hypertrophy split for intermediates, 6 days/week.",
    science: { selectWhen: "Intermediate, physique goal.", daysPerWeek: 6 },
  },
  {
    slug: "phul",
    name: "PHUL (Power / Hypertrophy Upper-Lower)",
    summary: "4-day blend of heavy power and higher-rep hypertrophy days.",
    science: { selectWhen: "Intermediate wanting strength + size.", daysPerWeek: 4 },
  },
  {
    slug: "531",
    name: "5/3/1",
    summary: "Percentage-based main-lift progression over 4-week waves.",
    science: { selectWhen: "Intermediate/advanced, sustainable strength.", daysPerWeek: 4, wave: "3 work weeks + deload", deloadTrigger: "end of each wave" },
  },
  {
    slug: "nsuns",
    name: "nSuns LP",
    summary: "High-volume linear progression built on 5/3/1 with heavy top sets.",
    science: { selectWhen: "Late novice with time and good recovery.", daysPerWeek: 5, volume: "high", deloadTrigger: "2 missed AMRAP targets" },
  },
  {
    slug: "phat",
    name: "PHAT (Power Hypertrophy Adaptive Training)",
    summary: "Two power days plus three hypertrophy days.",
    science: { selectWhen: "Intermediate wanting strength and size together.", daysPerWeek: 5 },
  },
  {
    slug: "gvt",
    name: "German Volume Training",
    summary: "10×10 on a main lift — brutal hypertrophy block.",
    science: { selectWhen: "Short hypertrophy block, good recovery.", daysPerWeek: 4, maxWeeks: 6, contraindications: ["novice", "poor sleep"] },
  },
  {
    slug: "texas-method",
    name: "Texas Method",
    summary: "Volume / recovery / intensity across three weekly sessions.",
    science: { selectWhen: "Novice stalling on pure linear progression.", daysPerWeek: 3 },
  },
  {
    slug: "powerbuilding",
    name: "Powerbuilding",
    summary: "Heavy compounds first, hypertrophy accessories after.",
    science: { selectWhen: "Wants to look and lift strong.", daysPerWeek: 4 },
  },
  {
    slug: "functional-strength",
    name: "Functional Strength",
    summary: "Carries, unilateral work and core stability for everyday capability.",
    science: { selectWhen: "General fitness, desk-bound members.", daysPerWeek: 3 },
  },
  {
    slug: "metcon",
    name: "CrossFit-Style MetCon",
    summary: "Mixed-modal conditioning circuits against the clock.",
    science: { selectWhen: "Enjoys intensity and variety.", daysPerWeek: 4, contraindications: ["acute injury"] },
  },
  {
    slug: "calisthenics",
    name: "Calisthenics Progression",
    summary: "Bodyweight ladders toward pull-ups, dips and pistols.",
    science: { selectWhen: "Minimal equipment, or wants bodyweight skills.", daysPerWeek: 4 },
  },
  {
    slug: "hybrid-athlete",
    name: "Hybrid Athlete",
    summary: "Concurrent strength and endurance for the run-and-lift member.",
    science: { selectWhen: "Wants to lift heavy and run far.", daysPerWeek: 5, watchFor: "interference effect" },
  },
  {
    slug: "hyrox-prep",
    name: "Hyrox Prep",
    summary: "Hybrid strength + conditioning peaking toward a Hyrox event.",
    science: { selectWhen: "Hybrid athlete with a target event.", daysPerWeek: 5, phases: ["base", "build", "peak", "taper"] },
  },
  {
    slug: "postpartum-return",
    name: "Postpartum Return",
    summary: "Graded return to training with core and pelvic-floor priority.",
    science: { selectWhen: "Cleared postpartum member returning to the gym.", daysPerWeek: 3, requiresMedicalClearance: true, contraindications: ["no clearance", "diastasis symptoms"] },
  },
  {
    slug: "masters-50-plus",
    name: "50+ Age-Adapted",
    summary: "Strength and balance with joint-friendly loading and longer recovery.",
    science: { selectWhen: "Members over 50 or with joint sensitivity.", daysPerWeek: 3, emphasis: ["balance", "bone density"], deloadTrigger: "every 4th week" },
  },
];

// Daily micro-rituals (Retention Engine) — single-tap WhatsApp engagement prompts.
const RITUALS: Array<{ kind: "WEIGH_IN" | "INTENTION" | "REFLECTION" | "WIND_DOWN"; prompt: string; sendAt: string }> = [
  { kind: "WEIGH_IN", prompt: "🌅 Morning! Reply with today's weight (kg) for your Metabolic Twin.", sendAt: "06:00" },
  { kind: "INTENTION", prompt: "🎯 One thing you'll nail today — training, food, or steps?", sendAt: "08:00" },
  { kind: "REFLECTION", prompt: "🌙 How did today go? Reply with your session RPE (e.g. \"RPE 8\") so your coach can tune the load.", sendAt: "20:00" },
  { kind: "WIND_DOWN", prompt: "😴 Winding down — how many hours of sleep did you get last night?", sendAt: "22:00" },
];

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);
const daysAhead = (n: number) => new Date(Date.now() + n * 864e5);

// A realistic roster: varied tenure, goals, engagement and renewal dates so the
// retention queue, tier ladder and cross-gym cohorts all have something to show.
const MEMBERS = [
  {
    whatsappPhone: "+919000000001", name: "Aarav (Demo Member)", goal: "lose fat",
    sex: "M", heightCm: 178, startWeightKg: 84, joinedAt: daysAgo(120),
    currentStreak: 12, longestStreak: 18, renewalDate: daysAhead(5),
  },
  {
    whatsappPhone: "+919000000003", name: "Priya Menon", goal: "lose fat",
    sex: "F", heightCm: 163, startWeightKg: 71, joinedAt: daysAgo(210),
    currentStreak: 34, longestStreak: 41, renewalDate: daysAhead(21),
  },
  {
    whatsappPhone: "+919000000004", name: "Rohan Das", goal: "gain muscle",
    sex: "M", heightCm: 181, startWeightKg: 68, joinedAt: daysAgo(95),
    currentStreak: 9, longestStreak: 15, renewalDate: daysAhead(30),
  },
  {
    whatsappPhone: "+919000000005", name: "Neha Kulkarni", goal: "lose fat",
    sex: "F", heightCm: 158, startWeightKg: 66, joinedAt: daysAgo(45),
    currentStreak: 0, longestStreak: 8, renewalDate: daysAhead(3),
  },
  {
    whatsappPhone: "+919000000006", name: "Vikram Shetty", goal: "intermediate hybrid athlete",
    sex: "M", heightCm: 175, startWeightKg: 79, joinedAt: daysAgo(300),
    currentStreak: 22, longestStreak: 60, renewalDate: daysAhead(45),
    eventDate: daysAhead(56), eventName: "Hyrox Mumbai",
  },
  {
    whatsappPhone: "+919000000007", name: "Ananya Iyer", goal: "maintain",
    sex: "F", heightCm: 167, startWeightKg: 60, joinedAt: daysAgo(15),
    currentStreak: 4, longestStreak: 4, renewalDate: daysAhead(60),
  },
  {
    whatsappPhone: "+919000000008", name: "Karthik Nair", goal: "lose fat",
    sex: "M", heightCm: 172, startWeightKg: 92, joinedAt: daysAgo(150),
    currentStreak: 16, longestStreak: 22, renewalDate: daysAhead(12),
  },
  {
    whatsappPhone: "+919000000009", name: "Sneha Joshi", goal: "lose fat",
    sex: "F", heightCm: 160, startWeightKg: 74, joinedAt: daysAgo(190),
    currentStreak: 31, longestStreak: 35, renewalDate: daysAhead(25),
  },
  {
    whatsappPhone: "+919000000010", name: "Imran Qureshi", goal: "lose fat",
    sex: "M", heightCm: 183, startWeightKg: 97, joinedAt: daysAgo(70),
    currentStreak: 6, longestStreak: 11, renewalDate: daysAhead(9),
  },
  {
    whatsappPhone: "+919000000011", name: "Divya Rao", goal: "lose fat",
    sex: "F", heightCm: 165, startWeightKg: 69, joinedAt: daysAgo(260),
    currentStreak: 38, longestStreak: 52, renewalDate: daysAhead(40),
  },
  {
    whatsappPhone: "+919000000012", name: "Arjun Pillai", goal: "gain muscle",
    sex: "M", heightCm: 177, startWeightKg: 64, joinedAt: daysAgo(110),
    currentStreak: 14, longestStreak: 19, renewalDate: daysAhead(33),
  },
];

/**
 * Seed real logged history so the intelligence has something to compute from:
 * paired intake+weight days let the Metabolic Twin switch from the population
 * formula to this member's OWN measured metabolism, and the log density drives
 * adherence, tier progression and churn.
 */
async function seedActivity(
  gymId: string,
  member: { id: string; startWeightKg?: number | null; sex?: string | null; goal?: string | null },
  opts: { days: number; trueTdee: number; intake: number; engaged: boolean },
) {
  const { days, trueTdee, intake } = opts;
  // Energy balance drives the weight trend, so the regression can recover trueTdee.
  const kgPerDay = (intake - trueTdee) / 7700;
  let weight = member.startWeightKg ?? 80;
  // Accumulate and write in batched commits — one await per document made this
  // seed take minutes against a remote project.
  const pending: Array<Parameters<typeof repos.logs.create>[0]> = [];

  for (let i = days; i >= 0; i--) {
    const day = daysAgo(i);
    // A disengaged member simply stops logging in the last stretch.
    if (!opts.engaged && i < Math.floor(days * 0.45)) continue;

    pending.push({
      gymId, memberId: member.id, type: "INTAKE", loggedFor: day,
      payload: { kcal: Math.round(intake + (i % 5) * 40 - 80), raw: "seed" },
    });
    pending.push({
      gymId, memberId: member.id, type: "WEIGHT", loggedFor: day,
      payload: { weightKg: Math.round(weight * 10) / 10, raw: "seed" },
    });
    // Fatigue Guardian inputs on training days.
    if (i % 2 === 0) {
      pending.push({
        gymId, memberId: member.id, type: "WORKOUT", loggedFor: day,
        payload: {
          rpe: 7 + (i % 3),
          sets: [
            { exercise: "Barbell Back Squat", loadKg: 60 + Math.floor((days - i) / 7) * 2.5, reps: 10 + (i % 3) },
            { exercise: "Bench Press", loadKg: 45 + Math.floor((days - i) / 9) * 2.5, reps: 9 + (i % 4) },
          ],
          raw: "seed",
        },
      });
      pending.push({
        gymId, memberId: member.id, type: "SLEEP", loggedFor: day,
        payload: { hours: 6.5 + (i % 4) * 0.5, raw: "seed" },
      });
    }
    weight += kgPerDay;
  }
  await repos.logs.createMany(pending);
}

async function main() {
  const gym = await repos.gyms.upsertBySlug({
    name: "Iron Yard (Demo)",
    slug: "demo-gym",
    tier: "ELITE",
    country: "IN",
    timezone: "Asia/Kolkata",
    city: "Pune",
    joinCode: "DEMO",
    // Facts the concierge bot answers from.
    classSchedule: [
      { name: "Hyrox Prep", day: "Saturday", time: "07:00", coach: "Demo Coach" },
      { name: "Strength Foundations", day: "Monday", time: "18:30", coach: "Demo Coach" },
      { name: "Conditioning", day: "Wednesday", time: "19:00", coach: "Demo Coach" },
      { name: "Mobility & Recovery", day: "Sunday", time: "09:00", coach: "Demo Coach" },
    ],
    policies: {
      fees: "Membership fees are due on your renewal date. Payment link is sent 3 days before.",
      pause: "Memberships can be paused once per year for up to 30 days — staff must approve.",
      cancellation: "30 days' written notice is required to cancel.",
      guestPass: "Gold and Platinum members get a monthly guest pass.",
    },
  });

  const coach = await repos.staff.upsert({
    gymId: gym.id,
    email: "coach@demo.gym",
    name: "Demo Coach",
    role: "OWNER",
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
  });

  const memberHash = await bcrypt.hash(MEMBER_PASSWORD, 10);
  const members = [];
  for (const m of MEMBERS) {
    members.push(
      await repos.members.upsert({
        gymId: gym.id,
        status: "ACTIVE",
        coachId: coach.id,
        passwordHash: memberHash,
        onboardedAt: new Date(),
        ...m,
      }),
    );
  }
  const member = members[0]!;

  for (const p of DIET_PROTOCOLS) {
    await repos.protocols.upsert({ kind: "DIET", version: 1, ...p });
  }
  for (const p of TRAINING_PROTOCOLS) {
    await repos.protocols.upsert({ kind: "TRAINING", version: 1, ...p });
  }
  for (const r of RITUALS) {
    await repos.rituals.upsert({ gymId: gym.id, ...r });
  }

  // ── Logged history + an active plan per member ──────────────────────────────
  // Gives the Metabolic Twin, adherence, tiers, churn and the cross-gym cohorts
  // something real to compute from. The last two members stay disengaged so the
  // at-risk queue isn't empty.
  let activityDays = 0;
  for (const [i, m] of members.entries()) {
    const goal = (m.goal ?? "").toLowerCase();
    const cutting = /lose|fat/.test(goal);
    const engaged = i < members.length - 2;
    const trueTdee = (m.sex === "F" ? 2050 : 2550) + (i % 3) * 60;

    await seedActivity(gym.id, m, {
      days: 24,
      trueTdee,
      intake: cutting ? trueTdee - 450 : /gain/.test(goal) ? trueTdee + 300 : trueTdee,
      engaged,
    });
    activityDays += 24;

    // An ACTIVE plan so the flywheel has cohorts to aggregate. Protocol follows
    // the goal, which is what puts 5+ members into the same cohort.
    const protocolSlug = cutting ? "mini-cut" : /gain/.test(goal) ? "reverse-diet" : "maintenance";
    const kcal = cutting ? trueTdee - 450 : /gain/.test(goal) ? trueTdee + 300 : trueTdee;
    await repos.plans.create({
      gymId: gym.id,
      memberId: m.id,
      type: "DIET",
      status: "ACTIVE",
      payload: {
        protocolSlug,
        dailyTargets: {
          kcal,
          proteinG: Math.round((m.startWeightKg ?? 75) * 2),
          carbsG: Math.round(kcal * 0.4 / 4),
          fatG: Math.round(kcal * 0.25 / 9),
        },
        meals: [{ name: "Breakfast", items: ["Seeded baseline plan — regenerate for a real one"] }],
        groceryList: [],
        adjustment: "hold",
        notesApplied: [],
      },
      rationale: `Seeded baseline (${protocolSlug}) so the flywheel has a cohort.`,
    });
  }

  console.log("Seeded:", {
    gym: `${gym.slug} (${gym.tier})`,
    coach: `${coach.email} / ${DEMO_PASSWORD}`,
    members: members.length,
    dietProtocols: DIET_PROTOCOLS.length,
    trainingProtocols: TRAINING_PROTOCOLS.length,
    rituals: RITUALS.length,
    activityDaysLogged: activityDays,
    firstMember: member.name,
    memberLogin: `${member.whatsappPhone} / ${MEMBER_PASSWORD}`,
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

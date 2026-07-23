import "./env";
import {
  questionsFor,
  readCheckin,
  suggestPlanKinds,
  CHECKIN_QUESTIONS,
  updateStreak,
  type CheckinAnswer,
} from "@keystone/core";
import { repos, type Member } from "@keystone/db";
import { HttpError } from "./auth";

// ── Daily check-in ───────────────────────────────────────────────────────────
// Two steps, deliberately. "Check in" is the attendance/streak moment — one tap,
// instant reward. The questionnaire is what the coach reads before deciding.
// Splitting them means a member in a hurry still records the day.

export const dayKey = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

export async function checkinState(member: Member) {
  const today = dayKey();
  const [existing, recent] = await Promise.all([
    repos.dailyCheckins.forDay(member.id, today),
    repos.dailyCheckins.recentByMember(member.id, 3),
  ]);
  const yesterday = recent.find((c) => c.forDay !== today)?.answers ?? null;

  return {
    forDay: today,
    checkedIn: !!existing,
    complete: existing?.status === "COMPLETE",
    answers: existing?.answers ?? {},
    questions: questionsFor(yesterday),
    streak: member.currentStreak,
    readiness: existing?.status === "COMPLETE" ? readCheckin(existing.answers) : null,
  };
}

/**
 * Step 1 — attendance. Idempotent: tapping twice in a day is a no-op, and the
 * streak only moves on the first check-in of a new day.
 */
export async function startCheckin(member: Member) {
  const today = dayKey();
  const existing = await repos.dailyCheckins.forDay(member.id, today);
  if (existing) {
    return { alreadyCheckedIn: true, streak: member.currentStreak, forDay: today };
  }

  await repos.dailyCheckins.upsert({
    gymId: member.gymId,
    memberId: member.id,
    forDay: today,
    answers: {},
    status: "STARTED",
  });

  const patch = updateStreak(
    { currentStreak: member.currentStreak, longestStreak: member.longestStreak },
    member.lastActiveAt,
    new Date(),
  );
  await repos.members.update(member.id, { ...patch, lastActiveAt: new Date() });

  return {
    alreadyCheckedIn: false,
    streak: patch.currentStreak,
    isNewBest: patch.currentStreak > member.longestStreak,
    forDay: today,
  };
}

/**
 * Step 2 — the questionnaire. Answers are saved to the check-in AND fanned out
 * to the existing log types, so the Metabolic Twin, adherence and churn keep
 * working from one source of truth instead of a parallel one.
 */
export async function submitCheckin(
  member: Member,
  answers: Record<string, CheckinAnswer>,
) {
  const today = dayKey();
  if (!answers || Object.keys(answers).length === 0) {
    throw new HttpError(400, "No answers submitted.");
  }

  const readiness = readCheckin(answers);

  await repos.dailyCheckins.upsert({
    gymId: member.gymId,
    memberId: member.id,
    forDay: today,
    answers,
    summary: readiness.summary,
    status: "COMPLETE",
    completedAt: new Date(),
  });

  await fanOutToLogs(member, answers);

  // Pain is the one answer a coach must not discover late.
  if (answers.pain === "Real pain") {
    await repos.notes.create({
      gymId: member.gymId,
      memberId: member.id,
      source: "MEMBER",
      text: `Reported REAL PAIN in today's check-in.${answers.notes ? ` Note: ${answers.notes}` : ""}`,
    });
    await repos.outboundMessages.create({
      gymId: member.gymId,
      memberId: member.id,
      body: `⚠️ ${member.name} reported real pain in today's check-in — review before their session.`,
      status: "DRAFT",
      requiresApproval: true,
    });
  }

  if (typeof answers.notes === "string" && answers.notes.trim()) {
    await repos.notes.create({
      gymId: member.gymId,
      memberId: member.id,
      source: "MEMBER",
      text: answers.notes.trim(),
    });
  }

  return { readiness, suggestion: suggestPlanKinds(answers), forDay: today };
}

/**
 * Write check-in answers into the log types the engines already read. Without
 * this the check-in would be a data silo and the Metabolic Twin would starve.
 */
async function fanOutToLogs(member: Member, answers: Record<string, CheckinAnswer>) {
  const now = new Date();
  const pending: Array<Parameters<typeof repos.logs.create>[0]> = [];

  const weight = Number(answers.weight);
  if (Number.isFinite(weight) && weight >= 25 && weight <= 300) {
    pending.push({
      gymId: member.gymId, memberId: member.id, type: "WEIGHT", loggedFor: now,
      payload: { weightKg: weight, source: "checkin" },
    });
  }

  const hours = Number(answers.sleepHours);
  if (Number.isFinite(hours) && hours > 0 && hours <= 24) {
    pending.push({
      gymId: member.gymId, memberId: member.id, type: "SLEEP", loggedFor: now,
      payload: { hours, quality: answers.sleepQuality, source: "checkin" },
    });
  }

  // One CHECKIN log carries the subjective picture — this is what the Fatigue
  // Guardian reads for soreness.
  pending.push({
    gymId: member.gymId, memberId: member.id, type: "CHECKIN", loggedFor: now,
    payload: {
      soreness: answers.soreness,
      mood: answers.mood,
      energy: answers.energy,
      stress: answers.stress,
      motivation: answers.motivation,
      raw: String(answers.notes ?? "daily check-in"),
      source: "checkin",
    },
  });

  await repos.logs.createMany(pending);
}

/** Formatted for the coach: question prompts alongside answers. */
export function describeAnswers(
  answers: Record<string, CheckinAnswer>,
): Array<{ label: string; value: string }> {
  return CHECKIN_QUESTIONS.filter((q) => answers[q.key] !== undefined && answers[q.key] !== "").map(
    (q) => {
      const raw = answers[q.key]!;
      const value =
        q.type === "scale" && typeof raw === "number"
          ? `${q.labels?.[raw - 1] ?? raw} (${raw}/5)`
          : `${raw}${q.unit ? ` ${q.unit}` : ""}`;
      return { label: q.prompt, value };
    },
  );
}

import { repos } from "@keystone/db";
import { detectMilestones } from "@keystone/core";
import { draftWinMessage } from "@keystone/ai";
import { llm } from "../shared.js";

/**
 * "Send a win": detect newly-crossed milestones for a member and draft a personal
 * coach congratulations behind the coach gate (human-sent, never auto-sent). New
 * milestones are persisted idempotently so a win is celebrated exactly once.
 */
export async function scanMemberWins(memberId: string): Promise<void> {
  const member = await repos.members.get(memberId);
  if (!member) return;

  const currentWeightKg = await repos.logs.latestWeightKg(memberId);
  const goal = mapGoal(member.goal);

  const detected = detectMilestones({
    goal,
    startWeightKg: member.startWeightKg,
    currentWeightKg,
    currentStreak: member.currentStreak,
    longestStreak: member.longestStreak,
  });

  for (const ms of detected) {
    if (await repos.milestones.existsByKey(memberId, ms.key)) continue;
    await repos.milestones.create({
      gymId: member.gymId,
      memberId,
      type: ms.type,
      title: ms.title,
      key: ms.key,
      detail: ms.detail,
    });
    const body = await draftWinMessage(llm, { memberName: member.name, milestoneTitle: ms.title });
    // Coach-gated: parked at DRAFT for a human to send.
    await repos.outboundMessages.create({
      gymId: member.gymId,
      memberId,
      body,
      status: "DRAFT",
      requiresApproval: true,
    });
  }
}

function mapGoal(goal?: string | null): "lose" | "gain" | "maintain" {
  const g = (goal ?? "").toLowerCase();
  if (/lose|fat|cut|lean/.test(g)) return "lose";
  if (/gain|bulk|muscle|mass|strength/.test(g)) return "gain";
  return "maintain";
}

import { assertSameTenant } from "@keystone/core";
import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { tenantFrom, HttpError } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** The assembled member brain: memories, twin, churn, notes, milestones, plans. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    const { id } = await params;
    const member = await repos.members.get(id);
    if (!member) throw new HttpError(404, "Member not found");
    assertSameTenant(ctx, member);

    const [memories, twin, churn, notes, milestones, events, diet, training, recentLogs] =
      await Promise.all([
        repos.memberMemories.listActiveByMember(id),
        repos.metabolicTwins.latestByMember(id),
        repos.churnScores.latestByMember(id),
        repos.notes.listByMemberRecent(id, 10),
        repos.milestones.listByMember(id),
        repos.events.listUpcomingByMember(id),
        repos.plans.listByMemberType(id, "DIET"),
        repos.plans.listByMemberType(id, "TRAINING"),
        repos.logs.listByMemberTypesSince(
          id,
          ["WORKOUT", "CHECKIN", "INTAKE", "WEIGHT", "SLEEP"],
          new Date(Date.now() - 90 * 864e5),
        ),
      ]);

    // Day → intensity for the coach's consistency heatmap:
    // trained (3) > checked in (2) > logged anything (1).
    const activity: Record<string, number> = {};
    for (const l of recentLogs) {
      const key = l.loggedFor.toISOString().slice(0, 10);
      const level = l.type === "WORKOUT" ? 3 : l.type === "CHECKIN" ? 2 : 1;
      activity[key] = Math.max(activity[key] ?? 0, level);
    }

    return {
      activity,
      ...member,
      memories,
      metabolicTwin: twin,
      churnScore: churn,
      notes,
      milestones,
      events,
      plans: [...diet, ...training].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    };
  });
}

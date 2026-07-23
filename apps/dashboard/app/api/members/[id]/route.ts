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

    const [memories, twin, churn, notes, milestones, events, diet, training] = await Promise.all([
      repos.memberMemories.listActiveByMember(id),
      repos.metabolicTwins.latestByMember(id),
      repos.churnScores.latestByMember(id),
      repos.notes.listByMemberRecent(id, 10),
      repos.milestones.listByMember(id),
      repos.events.listUpcomingByMember(id),
      repos.plans.listByMemberType(id, "DIET"),
      repos.plans.listByMemberType(id, "TRAINING"),
    ]);

    return {
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

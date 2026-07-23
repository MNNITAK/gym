import { repos } from "@keystone/db";
import { readCheckin } from "@keystone/core";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";

export const dynamic = "force-dynamic";

/** Past plans and check-ins, newest first. */
export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const [diet, training, checkins] = await Promise.all([
      repos.plans.listByMemberType(member.id, "DIET"),
      repos.plans.listByMemberType(member.id, "TRAINING"),
      repos.dailyCheckins.recentByMember(member.id, 30),
    ]);

    return {
      plans: [...diet, ...training]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 20)
        .map((p) => ({
          id: p.id,
          type: p.type,
          status: p.status,
          rationale: p.rationale ?? null,
          createdAt: p.createdAt,
          payload: p.payload,
        })),
      checkins: checkins
        .filter((c) => c.status === "COMPLETE")
        .map((c) => ({
          forDay: c.forDay,
          summary: c.summary ?? null,
          band: readCheckin(c.answers).band,
          weightKg: typeof c.answers.weight === "number" ? c.answers.weight : null,
        })),
    };
  });
}

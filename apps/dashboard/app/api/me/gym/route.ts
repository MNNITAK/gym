import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const gym = await repos.gyms.getBySlug(member.gymId);
    return {
      gym: { name: gym?.name, city: gym?.city, timezone: gym?.timezone },
      classSchedule: gym?.classSchedule ?? [],
      policies: gym?.policies ?? {},
      membership: {
        status: member.status,
        tier: member.tier,
        joinedAt: member.joinedAt,
        renewalDate: member.renewalDate ?? null,
      },
    };
  });
}

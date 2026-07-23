import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";

export const dynamic = "force-dynamic";

/** Complete a daily ritual with a single tap. Body: { ritualId, response? } */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const { ritualId, response } = (await req.json()) as { ritualId?: string; response?: string };
    const today = new Date().toISOString().slice(0, 10);
    if (!ritualId) return { ok: false };

    await repos.ritualCompletions.create({
      gymId: member.gymId,
      memberId: member.id,
      ritualId,
      forDay: today,
      response: response ?? null,
    });
    return { ok: true };
  });
}

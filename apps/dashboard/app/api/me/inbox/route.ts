import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const msgs = await repos.outboundMessages.inboxForMember(member.id, 50);
    return msgs.map((m) => ({ id: m.id, body: m.body, at: m.createdAt, readAt: m.readAt ?? null }));
  });
}

/** Mark everything read when the member opens their inbox. */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const msgs = await repos.outboundMessages.inboxForMember(member.id, 50);
    let marked = 0;
    for (const m of msgs) {
      if (m.readAt) continue;
      await repos.outboundMessages.update(m.id, { readAt: new Date() });
      marked += 1;
    }
    return { marked };
  });
}

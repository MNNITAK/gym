import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { injuriesFor } from "@/lib/server/member";

export const dynamic = "force-dynamic";

/** "What your coach knows about you" — the member's own view of their brain. */
export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const [memories, notes, events, injuries] = await Promise.all([
      repos.memberMemories.listActiveByMember(member.id),
      repos.notes.listByMemberRecent(member.id, 15),
      repos.events.listUpcomingByMember(member.id),
      injuriesFor(member.id),
    ]);
    return {
      member: {
        name: member.name,
        phone: member.whatsappPhone,
        goal: member.goal,
        sex: member.sex,
        heightCm: member.heightCm,
        startWeightKg: member.startWeightKg,
        joinedAt: member.joinedAt,
        tier: member.tier,
      },
      memories: memories
        .filter((m) => m.value?.trim())
        .map((m) => ({ id: m.id, kind: m.kind, key: m.key, value: m.value })),
      notes: notes.map((n) => ({ id: n.id, text: n.text, at: n.createdAt, source: n.source })),
      events: events.map((e) => ({ id: e.id, type: e.type, date: e.date, label: e.label })),
      injuries,
    };
  });
}

/** Members can forget a fact the AI got wrong. */
export async function DELETE(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const id = new URL(req.url).searchParams.get("memoryId");
    if (!id) return { ok: false };
    const all = await repos.memberMemories.listActiveByMember(member.id);
    if (!all.some((m) => m.id === id)) return { ok: false };
    await repos.memberMemories.deactivate(id);
    return { ok: true };
  });
}

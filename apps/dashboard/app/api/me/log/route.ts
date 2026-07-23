import { repos } from "@keystone/db";
import { updateStreak } from "@keystone/core";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { HttpError } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/**
 * Direct logging from the panel's quick-log controls — the tap-don't-type path.
 * Body: { type, payload }
 */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const body = (await req.json()) as { type?: string; payload?: Record<string, unknown> };
    const type = (body.type ?? "").toUpperCase();
    const p = body.payload ?? {};
    const now = new Date();
    const num = (v: unknown) => Number(v);

    const allowed = ["WEIGHT", "INTAKE", "WORKOUT", "SLEEP", "CHECKIN"];
    if (!allowed.includes(type)) throw new HttpError(400, `Unsupported log type "${body.type}".`);

    if (type === "WEIGHT") {
      const weightKg = num(p.weightKg);
      if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300) {
        throw new HttpError(400, "That weight doesn't look right.");
      }
    }

    const log = await repos.logs.create({
      gymId: member.gymId,
      memberId: member.id,
      type: type as "WEIGHT" | "INTAKE" | "WORKOUT" | "SLEEP" | "CHECKIN",
      loggedFor: now,
      payload: { ...p, source: "panel" },
    });

    const patch = updateStreak(
      { currentStreak: member.currentStreak, longestStreak: member.longestStreak },
      member.lastActiveAt,
      now,
    );
    await repos.members.update(member.id, { ...patch, lastActiveAt: now });

    return { ok: true, logId: log.id, streak: patch.currentStreak };
  });
}

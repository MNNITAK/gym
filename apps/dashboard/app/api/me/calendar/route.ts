import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";

export const dynamic = "force-dynamic";

/**
 * A month of activity, one entry per day. Built entirely from data that already
 * exists — check-ins and logs — rather than a new collection, so the calendar can
 * never disagree with the rest of the app.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const url = new URL(req.url);
    const monthsBack = Math.min(6, Math.max(0, Number(url.searchParams.get("back") ?? 0)));

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0, 23, 59, 59);
    const startKey = start.toISOString().slice(0, 10);

    const [checkins, logs] = await Promise.all([
      repos.dailyCheckins.recentByMember(member.id, 120),
      repos.logs.listByMemberTypesSince(
        member.id,
        ["WEIGHT", "WORKOUT", "INTAKE", "SLEEP", "CHECKIN"],
        start,
      ),
    ]);

    interface DayCell {
      checkedIn: boolean;
      trained: boolean;
      logged: boolean;
      weightKg: number | null;
    }
    const days = new Map<string, DayCell>();
    const touch = (key: string): DayCell =>
      days.get(key) ?? { checkedIn: false, trained: false, logged: false, weightKg: null };

    for (const c of checkins) {
      if (c.forDay < startKey) continue;
      const d = touch(c.forDay);
      d.checkedIn = c.status === "COMPLETE";
      days.set(c.forDay, d);
    }

    for (const l of logs) {
      if (l.loggedFor > end) continue;
      const key = l.loggedFor.toISOString().slice(0, 10);
      const d = touch(key);
      d.logged = true;
      if (l.type === "WORKOUT") d.trained = true;
      if (l.type === "WEIGHT") {
        const w = (l.payload as { weightKg?: number }).weightKg;
        if (typeof w === "number") d.weightKg = w;
      }
      days.set(key, d);
    }

    return {
      month: start.toISOString().slice(0, 7),
      monthLabel: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      firstWeekday: new Date(start.getFullYear(), start.getMonth(), 1).getDay(),
      daysInMonth: new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(),
      monthsBack,
      days: Object.fromEntries(days),
    };
  });
}

import bcrypt from "bcryptjs";
import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { HttpError } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    return {
      name: member.name,
      phone: member.whatsappPhone,
      goal: member.goal ?? null,
      preferredTrainingTime: member.preferredTrainingTime ?? null,
      eventName: member.eventName ?? null,
      eventDate: member.eventDate ?? null,
    };
  });
}

/** Update preferences, or change password. */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const b = (await req.json()) as {
      name?: string;
      goal?: string;
      preferredTrainingTime?: string;
      eventName?: string;
      eventDate?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const patch: Record<string, unknown> = {};
    if (b.name?.trim()) patch.name = b.name.trim();
    if (b.goal?.trim()) patch.goal = b.goal.trim();
    if (b.preferredTrainingTime && /^\d{1,2}:\d{2}$/.test(b.preferredTrainingTime)) {
      patch.preferredTrainingTime = b.preferredTrainingTime;
    }
    if (b.eventName !== undefined) patch.eventName = b.eventName.trim() || null;
    if (b.eventDate) {
      const d = new Date(b.eventDate);
      if (!Number.isNaN(d.getTime())) patch.eventDate = d;
    }

    // Changing a password requires proving you know the current one — otherwise
    // a stolen session token would be enough to lock the real member out.
    if (b.newPassword) {
      if (b.newPassword.length < 6) {
        throw new HttpError(400, "Password must be at least 6 characters.");
      }
      if (member.passwordHash) {
        const ok = await bcrypt.compare(b.currentPassword ?? "", member.passwordHash);
        if (!ok) throw new HttpError(401, "Current password is incorrect.");
      }
      patch.passwordHash = await bcrypt.hash(b.newPassword, 10);
    }

    if (Object.keys(patch).length === 0) return { ok: true, changed: 0 };
    await repos.members.update(member.id, patch);
    return { ok: true, changed: Object.keys(patch).length };
  });
}

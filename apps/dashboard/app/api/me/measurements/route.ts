import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { HttpError } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const FIELDS = ["weightKg", "waistCm", "chestCm", "armCm", "hipCm", "thighCm", "bodyFatPct"] as const;

export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const list = await repos.measurements.listByMember(member.id);
    return {
      measurements: list.map((m) => ({
        id: m.id,
        takenOn: m.takenOn,
        weightKg: m.weightKg ?? null,
        waistCm: m.waistCm ?? null,
        chestCm: m.chestCm ?? null,
        armCm: m.armCm ?? null,
        hipCm: m.hipCm ?? null,
        thighCm: m.thighCm ?? null,
        bodyFatPct: m.bodyFatPct ?? null,
        note: m.note ?? null,
      })),
      startWeightKg: member.startWeightKg ?? null,
    };
  });
}

/**
 * Record a set of measurements. A weight entered here also becomes a WEIGHT log,
 * so the Metabolic Twin and the progress chart pick it up — the member should
 * never have to enter the same number twice.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const body = (await req.json()) as Record<string, unknown>;

    const values: Record<string, number> = {};
    for (const f of FIELDS) {
      const n = Number(body[f]);
      if (Number.isFinite(n) && n > 0) values[f] = n;
    }
    if (Object.keys(values).length === 0) {
      throw new HttpError(400, "Enter at least one measurement.");
    }

    const created = await repos.measurements.create({
      gymId: member.gymId,
      memberId: member.id,
      takenOn: new Date(),
      ...values,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    });

    if (values.weightKg) {
      await repos.logs.create({
        gymId: member.gymId,
        memberId: member.id,
        type: "WEIGHT",
        loggedFor: new Date(),
        payload: { weightKg: values.weightKg, source: "measurements" },
      });
    }

    return { ok: true, id: created.id };
  });
}

import type { PlanStatus } from "@keystone/core";
import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import { transitionPlan } from "@/lib/server/plans";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Coach gate: { to: "APPROVED" | "ACTIVE" | "REJECTED", note?: string } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    const { id } = await params;
    const body = (await req.json()) as { to?: PlanStatus; note?: string };
    return transitionPlan(ctx, id, (body.to ?? "APPROVED") as PlanStatus, body.note);
  });
}

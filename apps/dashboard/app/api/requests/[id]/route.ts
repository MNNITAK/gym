import type { PlanType } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import {
  requestDetail,
  generateForRequest,
  approveRequest,
  declineRequest,
} from "@/lib/server/requests";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // generating two plans is two LLM calls

/** Everything the coach needs to decide, on one screen. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    const { id } = await params;
    return requestDetail(ctx, id);
  });
}

/** { action: "generate" | "approve" | "decline", kinds?, note? } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    const { id } = await params;
    const body = (await req.json()) as {
      action?: "generate" | "approve" | "decline";
      kinds?: PlanType[];
      note?: string;
    };
    if (body.action === "approve") return approveRequest(ctx, id);
    if (body.action === "decline") return declineRequest(ctx, id, body.note ?? "");
    return generateForRequest(ctx, id, body.kinds ?? ["TRAINING", "DIET"]);
  });
}

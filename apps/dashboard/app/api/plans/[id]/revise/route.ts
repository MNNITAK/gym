import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import { revisePlan } from "@/lib/server/engines";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // a revision is a full regeneration

/**
 * Coach ⇄ AI revision on a drafted plan. Body: { instruction: string }
 * The plan is rewritten in place and stays at PENDING_REVIEW — revising never approves.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    const { id } = await params;
    const body = (await req.json()) as { instruction?: string };
    return revisePlan(ctx, id, body.instruction ?? "");
  });
}

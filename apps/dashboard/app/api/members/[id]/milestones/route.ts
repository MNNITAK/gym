import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import { memberMilestones } from "@/lib/server/retention";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    const { id } = await params;
    return memberMilestones(ctx, id);
  });
}

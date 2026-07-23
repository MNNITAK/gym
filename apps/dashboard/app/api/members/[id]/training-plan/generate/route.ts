import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import { generateTrainingPlan } from "@/lib/server/engines";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    const { id } = await params;
    return generateTrainingPlan(ctx, id);
  });
}

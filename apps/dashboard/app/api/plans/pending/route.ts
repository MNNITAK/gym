import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import { pendingPlans } from "@/lib/server/plans";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => pendingPlans(tenantFrom(req)));
}

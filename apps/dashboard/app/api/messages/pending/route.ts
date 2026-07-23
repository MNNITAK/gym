import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import { pendingMessages } from "@/lib/server/plans";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => pendingMessages(tenantFrom(req)));
}

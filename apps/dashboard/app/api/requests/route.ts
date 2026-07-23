import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import { openRequests } from "@/lib/server/requests";

export const dynamic = "force-dynamic";

/** The coach's queue of members waiting on a decision. */
export async function GET(req: Request) {
  return handle(async () => openRequests(tenantFrom(req)));
}

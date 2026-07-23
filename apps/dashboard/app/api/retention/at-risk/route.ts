import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import { atRisk } from "@/lib/server/retention";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => atRisk(tenantFrom(req)));
}

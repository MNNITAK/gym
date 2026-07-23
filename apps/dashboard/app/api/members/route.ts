import { repos } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    return repos.members.listByGym(ctx.gymId);
  });
}

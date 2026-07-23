import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { progressFor } from "@/lib/server/member";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => progressFor(await requireMember(req)));
}

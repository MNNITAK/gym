import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { todayFor } from "@/lib/server/member";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => todayFor(await requireMember(req)));
}

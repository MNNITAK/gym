import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { myRequest, createRequest } from "@/lib/server/requests";

export const dynamic = "force-dynamic";

/** Today's request and, once approved, the plans themselves. */
export async function GET(req: Request) {
  return handle(async () => myRequest(await requireMember(req)));
}

/** Ask the coach for today's plan. Never generates. */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const { note } = (await req.json().catch(() => ({}))) as { note?: string };
    return createRequest(member, note);
  });
}

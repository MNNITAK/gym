import { getAuth } from "firebase-admin/auth";
import { getDb } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { mintRealtimeToken } from "@/lib/server/realtime";

export const dynamic = "force-dynamic";

/**
 * Mint a Firebase custom token so the member's browser can open a live listener
 * on their own documents. The uid IS the memberId, which is what the security
 * rules match on — a member can only ever read rows that are theirs.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    getDb(); // ensure the Admin app is initialised before getAuth()
    return mintRealtimeToken(() =>
      getAuth().createCustomToken(member.id, { gymId: member.gymId, role: "member" }),
    );
  });
}

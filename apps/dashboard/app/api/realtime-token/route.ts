import { getAuth } from "firebase-admin/auth";
import { getDb } from "@keystone/db";
import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";
import { mintRealtimeToken } from "@/lib/server/realtime";

export const dynamic = "force-dynamic";

/** Staff equivalent: lets the coach console listen for incoming plan requests. */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    getDb();
    const uid = `staff:${ctx.staffUserId ?? ctx.gymId}`;
    return mintRealtimeToken(() =>
      getAuth().createCustomToken(uid, { gymId: ctx.gymId, role: "staff" }),
    );
  });
}

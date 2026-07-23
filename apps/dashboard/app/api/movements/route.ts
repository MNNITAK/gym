import { MOVEMENT_LIBRARY, rehabProtocolsFor } from "@keystone/core";
import { handle } from "@/lib/server/http";
import { tenantFrom } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** The curated movement library + rehab protocols (Training INNOV 04 & 05). */
export async function GET(req: Request) {
  return handle(async () => {
    tenantFrom(req); // staff only
    return {
      movements: MOVEMENT_LIBRARY,
      rehab: rehabProtocolsFor([
        "knee",
        "lower_back",
        "shoulder",
        "elbow_wrist",
        "hip",
        "neck",
      ]),
    };
  });
}

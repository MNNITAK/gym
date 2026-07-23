import type { CheckinAnswer } from "@keystone/core";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { checkinState, startCheckin, submitCheckin } from "@/lib/server/checkin";

export const dynamic = "force-dynamic";

/** Today's check-in: whether it's done, and the questions to ask. */
export async function GET(req: Request) {
  return handle(async () => checkinState(await requireMember(req)));
}

/**
 * Two actions:
 *   { action: "start" }              — attendance + streak
 *   { action: "submit", answers: {} } — the questionnaire
 */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const body = (await req.json()) as {
      action?: "start" | "submit";
      answers?: Record<string, CheckinAnswer>;
    };
    if (body.action === "submit") return submitCheckin(member, body.answers ?? {});
    return startCheckin(member);
  });
}

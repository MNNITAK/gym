import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { todayFor } from "@/lib/server/member";
import { needsOnboarding } from "@/lib/server/onboarding";
import { checkinState } from "@/lib/server/checkin";
import { myRequest } from "@/lib/server/requests";
import { warmupFor } from "@keystone/core";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    // The panel is gated on onboarding: a member the AI knows nothing about
    // would only get generic plans, which is the problem this flow exists to fix.
    if (await needsOnboarding(member)) {
      return { needsOnboarding: true, member: { id: member.id, name: member.name } };
    }
    // The day has a sequence: check in, ask for a plan, wait, then train. Today
    // reports which stage the member is at so the UI never has to guess.
    const [today, checkin, request] = await Promise.all([
      todayFor(member),
      checkinState(member),
      myRequest(member),
    ]);

    const stage = !checkin.complete
      ? "CHECKIN"
      : !request.request
        ? "REQUEST"
        : request.request.status === "APPROVED"
          ? "READY"
          : request.request.status === "DECLINED"
            ? "RESTDAY"
            : "WAITING";

    return {
      needsOnboarding: false,
      stage,
      checkin: {
        complete: checkin.complete,
        checkedIn: checkin.checkedIn,
        readiness: checkin.readiness,
      },
      request: request.request,
      // Something useful to do while the coach decides.
      warmup: stage === "WAITING" ? warmupFor(today.session?.focus) : null,
      ...today,
    };
  });
}

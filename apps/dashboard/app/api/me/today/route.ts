import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { todayFor } from "@/lib/server/member";
import { needsOnboarding } from "@/lib/server/onboarding";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    // The panel is gated on onboarding: a member the AI knows nothing about
    // would only get generic plans, which is the problem this flow exists to fix.
    if (await needsOnboarding(member)) {
      return { needsOnboarding: true, member: { id: member.id, name: member.name } };
    }
    return { needsOnboarding: false, ...(await todayFor(member)) };
  });
}

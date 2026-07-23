import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { onboardingState, onboardingReply } from "@/lib/server/onboarding";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The conversation so far + how much is left. */
export async function GET(req: Request) {
  return handle(async () => onboardingState(await requireMember(req)));
}

/** One exchange. Body: { message: string } */
export async function POST(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const { message } = (await req.json()) as { message?: string };
    return onboardingReply(member, message ?? "");
  });
}

import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { activePlans, sessionForToday, exerciseDetail, rehabFor } from "@/lib/server/member";
import { TrainingPlanPayloadSchema } from "@keystone/core";

export const dynamic = "force-dynamic";

/** The member's live training week + today's session, with library detail attached. */
export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const plans = await activePlans(member.id);
    if (!plans.training) return { plan: null, rehab: await rehabFor(member.id) };

    const parsed = TrainingPlanPayloadSchema.safeParse(plans.training.payload);
    const session = sessionForToday(plans.training.payload);

    return {
      plan: {
        id: plans.training.id,
        protocolSlug: parsed.success ? parsed.data.protocolSlug : null,
        daysPerWeek: parsed.success ? parsed.data.daysPerWeek : null,
        deload: parsed.success ? parsed.data.deload : false,
        rationale: plans.training.rationale,
        week: parsed.success ? parsed.data.week : [],
      },
      today: session
        ? {
            ...session,
            exercises: session.exercises.map((e) => ({ ...e, library: exerciseDetail(e.name) })),
          }
        : null,
      rehab: await rehabFor(member.id),
    };
  });
}

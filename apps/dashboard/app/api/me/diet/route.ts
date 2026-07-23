import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/member-auth";
import { activePlans, sessionForToday, targetsForToday } from "@/lib/server/member";
import { repos } from "@keystone/db";

export const dynamic = "force-dynamic";

/** The member's live diet plan, rendered digitally — no PDF. */
export async function GET(req: Request) {
  return handle(async () => {
    const member = await requireMember(req);
    const plans = await activePlans(member.id);
    if (!plans.diet) return { plan: null };

    const session = plans.training ? sessionForToday(plans.training.payload) : null;
    const targets = targetsForToday(plans.diet.payload, session?.day);
    const todaysIntake = await repos.logs.listByMemberTypesSince(
      member.id,
      ["INTAKE"],
      new Date(new Date().setHours(0, 0, 0, 0)),
    );

    return {
      plan: {
        id: plans.diet.id,
        protocolSlug: targets?.protocolSlug,
        rationale: plans.diet.rationale,
        targets,
        coupledDays:
          (plans.diet.payload as { coupledDays?: unknown[] }).coupledDays ?? [],
        updatedAt: plans.diet.updatedAt ?? plans.diet.createdAt,
      },
      loggedToday: todaysIntake.map((l) => ({
        at: l.createdAt,
        kcal: (l.payload as { kcal?: number }).kcal ?? null,
        text: String((l.payload as { raw?: string }).raw ?? ""),
      })),
    };
  });
}

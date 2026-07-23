import { repos } from "@keystone/db";
import { sendOutbound } from "../shared.js";

const dayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Ritual Engine dispatch: send each gym's active daily micro-rituals to its active
 * members over WhatsApp. Idempotent per member/ritual/day so a re-tick never double-sends.
 * Rituals are whitelisted auto-sends (not coach-gated) — single-tap engagement prompts.
 */
export async function dispatchRitual(gymId: string, ritualId: string): Promise<number> {
  const rituals = await repos.rituals.listActiveByGym(gymId);
  const ritual = rituals.find((r) => r.id === ritualId);
  if (!ritual) return 0;

  const members = (await repos.members.listByGym(gymId)).filter((m) => m.status === "ACTIVE");
  const today = dayKey();
  let sent = 0;

  for (const member of members) {
    if (await repos.ritualCompletions.existsForDay(member.id, ritual.id, today)) continue;
    // Record the dispatch first (idempotency guard), then send.
    await repos.ritualCompletions.create({
      gymId,
      memberId: member.id,
      ritualId: ritual.id,
      forDay: today,
    });
    await sendOutbound(gymId, member.id, member.whatsappPhone, ritual.prompt);
    sent += 1;
  }
  return sent;
}

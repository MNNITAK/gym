import { repos } from "@keystone/db";
import { extractMemories } from "@keystone/ai";
import { llm } from "../shared.js";

/**
 * Memory-extraction pipeline (IP #4 — the compounding switching cost). Reads a
 * member's recent conversation and distills durable facts into MemberMemory,
 * upserting by (kind, key) so the memory compounds rather than bloats.
 */
export async function extractMemberMemory(memberId: string): Promise<void> {
  const member = await repos.members.get(memberId);
  if (!member) return;

  const turns = await repos.conversationTurns.recentByMember(memberId, 20);
  const inbound = turns.filter((t) => t.direction === "INBOUND");
  if (inbound.length === 0) return;

  // Oldest→newest so the model reads the conversation in order.
  const text = inbound
    .slice()
    .reverse()
    .map((t) => t.text)
    .join("\n");

  const { memories } = await extractMemories(llm, text);
  const mostRecentTurnId = inbound[0]!.id;

  for (const m of memories) {
    await repos.memberMemories.upsertByKey({
      gymId: member.gymId,
      memberId,
      kind: m.kind,
      key: m.key,
      value: m.value,
      confidence: m.confidence,
      sourceTurnId: mostRecentTurnId,
      active: true,
    });
  }
}

import { repos } from "@keystone/db";
import { scoreChurn, estimateSentiment, type ChurnFeatures } from "@keystone/core";

/**
 * Score a member's churn risk (heuristic v1) and persist it with a suggested
 * intervention. Intervene at ~day 20 of a downward trend, not day 90.
 */
export async function scoreMemberChurn(memberId: string): Promise<void> {
  const member = await repos.members.get(memberId);
  if (!member) return;

  const now = Date.now();
  const daysSince = (d: Date) => (now - d.getTime()) / (1000 * 60 * 60 * 24);

  const recentTurns = await repos.conversationTurns.recentByMember(memberId, 20);
  const inbound = recentTurns.filter((t) => t.direction === "INBOUND");
  const lastInbound = inbound[0] ?? null;
  const latencyDays = lastInbound ? daysSince(lastInbound.createdAt) : 14;

  // Message sentiment over the recent window (Phase 3 wires this into churn).
  const sentiments = inbound.map((t) => estimateSentiment(t.text)).filter((s) => s !== 0);
  const sentiment = sentiments.length
    ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
    : 0;

  // Attendance proxy: logs in the last 14 vs prior 14 days.
  const recent = await repos.logs.countByMemberBetween(
    memberId,
    new Date(now - 14 * 864e5),
  );
  const prior = await repos.logs.countByMemberBetween(
    memberId,
    new Date(now - 28 * 864e5),
    new Date(now - 14 * 864e5),
  );
  const attendanceRatio =
    prior === 0 ? (recent > 0 ? 1 : 0.5) : Math.min(1, recent / prior);

  const features: ChurnFeatures = {
    attendanceRatio,
    adherence: 0.7, // adherence prior; the Diet engine owns the precise signal
    responseLatencyNorm: Math.min(1, latencyDays / 14),
    sentiment,
    tenureDays: daysSince(member.joinedAt),
  };

  const result = scoreChurn(features);

  await repos.churnScores.create({
    gymId: member.gymId,
    memberId,
    score: result.score,
    risk: result.risk,
    features: result.contributions,
    suggestion: result.suggestion,
  });
}

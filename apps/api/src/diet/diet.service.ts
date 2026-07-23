import { Injectable, NotFoundException } from "@nestjs/common";
import {
  assertSameTenant,
  mifflinStJeorTdee,
  type AdherenceInput,
  type TenantContext,
} from "@keystone/core";
import {
  draftDietPlan,
  parseNote,
  selectDietProtocol,
  type ProtocolCandidate,
} from "@keystone/ai";
import type { Log, Member } from "@keystone/db";
import { DbService } from "../db/db.service.js";
import { LlmService } from "../shared/llm.service.js";

@Injectable()
export class DietService {
  constructor(
    private readonly db: DbService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Coach-triggered Diet plan generation. Assembles the member brain
   * (Metabolic Twin, memories, recent notes, adherence signal), selects a protocol
   * from the library, drafts a plan via the LLM, and parks it at PENDING_REVIEW
   * for the coach — nothing reaches the member until approved.
   */
  async generateForMember(ctx: TenantContext, memberId: string) {
    const member = await this.db.repos.members.get(memberId);
    if (!member) throw new NotFoundException("Member not found");
    assertSameTenant(ctx, member);

    const goal = mapGoal(member.goal);
    const sex: "M" | "F" = member.sex === "F" ? "F" : "M";
    const weightKg = member.startWeightKg ?? 75;

    // Individualized TDEE from the Metabolic Twin, else the population formula.
    const twin = await this.db.repos.metabolicTwins.latestByMember(memberId);
    const tdee =
      twin?.computedTdee ??
      mifflinStJeorTdee({
        sex,
        weightKg,
        heightCm: member.heightCm ?? 170,
        age: ageFrom(member.dateOfBirth) ?? 30,
      });

    // Durable member memory → conditioning strings.
    const memories = (
      await this.db.repos.memberMemories.listActiveByMember(memberId)
    ).map((m) => `${m.key}: ${m.value}`);

    // Parse the most recent free-form note into structured adjustments.
    const notes = await this.db.repos.notes.listByMemberRecent(memberId, 1);
    const noteAdjustments: string[] = [];
    if (notes[0]) {
      try {
        const parsed = await parseNote(this.llm.provider, notes[0].text);
        for (const a of parsed.adjustments) noteAdjustments.push(`${a.kind}: ${a.detail}`);
      } catch {
        /* note parsing is best-effort */
      }
    }

    // Adherence signal (drives the adherence-gated adjustment logic, IP #1).
    const logs = await this.db.repos.logs.listByMemberTypesSince(
      memberId,
      ["INTAKE", "WEIGHT", "CHECKIN"],
      new Date(Date.now() - 14 * 864e5),
    );
    const adherence = buildAdherence(member, logs, goal);

    // Select a protocol from the library (AI picks + explains; never invents).
    const candidates: ProtocolCandidate[] = (
      await this.db.repos.protocols.listByKind("DIET")
    ).map((p) => ({ slug: p.slug, name: p.name, summary: p.summary, science: p.science }));
    const choice = await selectDietProtocol(this.llm.provider, {
      member: { goal, adherent: adherence.adherence >= 0.6 },
      candidates,
    });
    const protocol =
      candidates.find((c) => c.slug === choice.slug) ??
      candidates[0] ?? { slug: choice.slug, name: choice.slug, summary: "", science: {} };
    const protocolDoc = (await this.db.repos.protocols.listByKind("DIET")).find(
      (p) => p.slug === protocol.slug,
    );

    // Draft the plan (adherence gate + calorie floor enforced inside).
    const { payload, adjustmentReason, floorEnforced } = await draftDietPlan(
      this.llm.provider,
      {
        member: { name: member.name, sex, goal, weightKg },
        tdee,
        protocol,
        memories,
        noteAdjustments,
        adherence,
      },
    );

    const plan = await this.db.repos.plans.create({
      gymId: member.gymId,
      memberId,
      type: "DIET",
      status: "PENDING_REVIEW",
      protocolId: protocolDoc?.id ?? null,
      payload: payload as unknown as Record<string, unknown>,
      rationale: choice.rationale,
      stateSnapshot: {
        tdee,
        usesRegression: twin?.usesRegression ?? false,
        adherence: adherence.adherence,
        adjustmentReason,
        floorEnforced,
        memories: memories.length,
      },
    });

    return { plan, adjustmentReason, floorEnforced };
  }
}

function mapGoal(goal?: string | null): "lose" | "gain" | "maintain" {
  const g = (goal ?? "").toLowerCase();
  if (/lose|fat|cut|lean/.test(g)) return "lose";
  if (/gain|bulk|muscle|mass|strength/.test(g)) return "gain";
  return "maintain";
}

function ageFrom(dob?: Date | null): number | undefined {
  if (!dob) return undefined;
  return Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365));
}

/**
 * Build the adherence input. With too little history (a fresh member) we return a
 * neutral, on-track signal so the first plan is a clean baseline (adjustment=hold)
 * rather than a spurious "plateau" cut.
 */
function buildAdherence(
  member: Member,
  logs: Log[],
  goal: "lose" | "gain" | "maintain",
): AdherenceInput {
  const expectedWeeklyChangeKg = 0.35;
  if (logs.length < 5) {
    return {
      adherence: 0.9,
      weightChangeKg: goal === "lose" ? -0.4 : goal === "gain" ? 0.4 : 0,
      goal,
      expectedWeeklyChangeKg,
    };
  }
  const days = new Set(logs.map((l) => l.loggedFor.toISOString().slice(0, 10)));
  const adherence = Math.min(1, days.size / 14);
  const weights = logs
    .filter((l) => l.type === "WEIGHT")
    .map((l) => (l.payload as { weightKg?: number }).weightKg)
    .filter((w): w is number => typeof w === "number");
  const weightChangeKg =
    weights.length >= 2 ? weights[weights.length - 1]! - weights[0]! : 0;
  return { adherence, weightChangeKg, goal, expectedWeeklyChangeKg };
}

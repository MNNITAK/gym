import { Injectable, Logger } from "@nestjs/common";
import { classifyInbound, answerConcierge } from "@keystone/ai";
import {
  MEDICAL_DISCLAIMER,
  screenForSafety,
  updateStreak,
} from "@keystone/core";
import type { NormalizedInbound } from "@keystone/whatsapp";
import { DbService } from "../db/db.service.js";
import { LlmService } from "../shared/llm.service.js";
import { MessagesService } from "../messages/messages.service.js";

@Injectable()
export class WhatsAppInboundService {
  private readonly log = new Logger("WhatsAppInbound");

  constructor(
    private readonly db: DbService,
    private readonly llm: LlmService,
    private readonly messages: MessagesService,
  ) {}

  /**
   * Process one normalized inbound message end-to-end:
   *   resolve gym+member → persist turn → classify intent → route.
   * Idempotent on providerMessageId so retried webhooks don't double-handle.
   */
  async handleInbound(msg: NormalizedInbound): Promise<{ handled: boolean; intent?: string }> {
    if (await this.db.repos.conversationTurns.existsByProviderMessageId(msg.providerMessageId)) {
      return { handled: false };
    }

    const gym = await this.resolveGym(msg.phoneNumberId);
    if (!gym) {
      this.log.warn(`No gym for phoneNumberId=${msg.phoneNumberId}; dropping.`);
      return { handled: false };
    }

    const member = await this.resolveMember(gym.id, msg);

    const priorActive = member.lastActiveAt;

    await this.db.repos.conversationTurns.create({
      gymId: gym.id,
      memberId: member.id,
      direction: "INBOUND",
      text: msg.text,
      providerMessageId: msg.providerMessageId,
    });

    // Safety first — hard override before any engine logic.
    const safety = screenForSafety(msg.text);
    const intent = safety.mustEscalate
      ? "escalate"
      : (await classifyInbound(this.llm.provider, msg.text)).intent;

    // Engagement intents extend the member's streak.
    const engaged = intent === "log" || intent === "ritual";
    const streakPatch = engaged
      ? updateStreak(
          { currentStreak: member.currentStreak, longestStreak: member.longestStreak },
          priorActive,
          new Date(),
        )
      : null;
    await this.db.repos.members.update(member.id, {
      lastActiveAt: new Date(),
      ...(streakPatch ?? {}),
    });

    await this.route(gym.id, member.id, intent, msg.text, safety.mustEscalate);
    return { handled: true, intent };
  }

  private async route(
    gymId: string,
    memberId: string,
    intent: string,
    text: string,
    safetyEscalation: boolean,
  ): Promise<void> {
    switch (intent) {
      case "escalate": {
        const body = safetyEscalation
          ? `Thanks for reaching out. A coach will personally follow up shortly. ${MEDICAL_DISCLAIMER}`
          : "Thanks — a coach will get back to you shortly.";
        await this.messages.draft({ gymId, memberId, body, requiresApproval: true });
        break;
      }
      case "note": {
        await this.db.repos.notes.create({
          gymId,
          memberId,
          source: "MEMBER",
          text,
        });
        break;
      }
      case "log":
      case "ritual": {
        await this.persistLog(gymId, memberId, text);
        break;
      }
      case "concierge":
      default: {
        await this.handleConcierge(gymId, memberId, text);
        break;
      }
    }
  }

  /**
   * Concierge bot: answer with member-brain context. Confident, non-escalating
   * answers are auto-sent (a whitelisted auto-answer); anything needing judgment is
   * drafted behind the coach gate with the model's holding reply.
   */
  private async handleConcierge(
    gymId: string,
    memberId: string,
    text: string,
  ): Promise<void> {
    const member = await this.db.repos.members.get(memberId);
    const memoryRecords = await this.db.repos.memberMemories.listActiveByMember(memberId);
    const memories = memoryRecords.map((m) => `${m.key}: ${m.value}`);
    const activePlan = (
      await this.db.repos.plans.listByMemberType(memberId, "DIET")
    ).find((p) => p.status === "ACTIVE");
    const planSummary = activePlan
      ? `On a ${(activePlan.payload as { protocolSlug?: string }).protocolSlug ?? "custom"} diet plan.`
      : undefined;

    const answer = await answerConcierge(this.llm.provider, {
      question: text,
      memberName: member?.name ?? "there",
      memories,
      planSummary,
    });

    const msg = await this.messages.draft({
      gymId,
      memberId,
      body: answer.answer,
      requiresApproval: answer.needsEscalation,
    });
    // Whitelisted auto-answer: deliver immediately when the bot is confident it
    // doesn't need a human. Otherwise it stays at DRAFT behind the coach gate.
    if (!answer.needsEscalation) {
      await this.messages.deliver(msg.id);
    }
  }

  /**
   * Persist an inbound log, parsing structured signal from free text so the
   * Metabolic Twin, auto-progression, and milestone detection get real data —
   * a weigh-in becomes a WEIGHT log, an intake becomes an INTAKE log, else CHECKIN.
   */
  private async persistLog(gymId: string, memberId: string, text: string): Promise<void> {
    const weight = text.match(/\b(\d{2,3}(?:\.\d+)?)\s?(?:kg|kgs|kilo)/i);
    const kcal = text.match(/\b(\d{3,5})\s?(?:kcal|cal|calories)/i);
    const now = new Date();
    if (weight) {
      await this.db.repos.logs.create({
        gymId, memberId, type: "WEIGHT", loggedFor: now,
        payload: { weightKg: Number(weight[1]), raw: text },
      });
      return;
    }
    if (kcal) {
      await this.db.repos.logs.create({
        gymId, memberId, type: "INTAKE", loggedFor: now,
        payload: { kcal: Number(kcal[1]), raw: text },
      });
      return;
    }
    await this.db.repos.logs.create({
      gymId, memberId, type: "CHECKIN", loggedFor: now, payload: { raw: text },
    });
  }

  private async resolveGym(phoneNumberId: string) {
    const byPhone = await this.db.repos.gyms.findByPhoneNumberId(phoneNumberId);
    if (byPhone) return byPhone;
    // Dev fallback: the simulator may not set a real phone number id.
    if (process.env.NODE_ENV !== "production") {
      return this.db.repos.gyms.first();
    }
    return null;
  }

  private async resolveMember(gymId: string, msg: NormalizedInbound) {
    const existing = await this.db.repos.members.findByPhone(gymId, msg.fromPhone);
    if (existing) return existing;
    return this.db.repos.members.create({
      gymId,
      whatsappPhone: msg.fromPhone,
      name: msg.profileName ?? "New Member",
      status: "PROSPECT",
    });
  }
}

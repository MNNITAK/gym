import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import {
  assertSameTenant,
  canTransitionMessage,
  type TenantContext,
} from "@keystone/core";
import { DbService } from "../db/db.service.js";
import { WhatsAppService } from "../shared/whatsapp.service.js";

@Injectable()
export class MessagesService {
  constructor(
    private readonly db: DbService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /**
   * Draft an outbound message. requiresApproval=true parks it at DRAFT behind the
   * coach gate; false (whitelisted concierge auto-answers) queues it immediately.
   */
  async draft(params: {
    gymId: string;
    memberId: string;
    body: string;
    requiresApproval?: boolean;
  }) {
    const requiresApproval = params.requiresApproval ?? true;
    return this.db.repos.outboundMessages.create({
      gymId: params.gymId,
      memberId: params.memberId,
      body: params.body,
      status: requiresApproval ? "DRAFT" : "QUEUED",
      requiresApproval,
    });
  }

  /** List messages awaiting coach approval, scoped to the tenant. */
  async listPending(ctx: TenantContext) {
    const msgs = await this.db.repos.outboundMessages.listPending(ctx.gymId);
    // attach a light member label for the console
    return Promise.all(
      msgs.map(async (m) => {
        const member = await this.db.repos.members.get(m.memberId);
        return {
          ...m,
          member: member
            ? { name: member.name, whatsappPhone: member.whatsappPhone }
            : null,
        };
      }),
    );
  }

  /** Coach approves a drafted message → queue → send. */
  async approveAndSend(ctx: TenantContext, id: string) {
    const msg = await this.db.repos.outboundMessages.get(id);
    if (!msg) throw new NotFoundException("Message not found");
    assertSameTenant(ctx, msg);
    if (!canTransitionMessage(msg.status, "QUEUED")) {
      throw new BadRequestException(`Cannot approve from ${msg.status}`);
    }

    await this.db.repos.outboundMessages.update(id, {
      status: "QUEUED",
      approverId: ctx.staffUserId ?? null,
      approvedAt: new Date(),
    });

    return this.deliver(id);
  }

  /** Push a QUEUED message to WhatsApp and record the outcome. */
  async deliver(id: string) {
    const msg = await this.db.repos.outboundMessages.get(id);
    if (!msg) throw new NotFoundException("Message not found");
    const member = await this.db.repos.members.get(msg.memberId);
    if (!member) throw new NotFoundException("Member not found");

    const res = await this.whatsapp.send(member.whatsappPhone, msg.body);
    return this.db.repos.outboundMessages.update(
      id,
      res.ok
        ? {
            status: "SENT",
            sentAt: new Date(),
            providerMessageId: res.providerMessageId ?? null,
          }
        : { status: "FAILED", error: res.error ?? "unknown" },
    );
  }
}

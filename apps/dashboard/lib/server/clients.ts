import "./env";
import { createLlmProvider, type LlmProvider } from "@keystone/ai";
import { WhatsAppClient } from "@keystone/whatsapp";
import { repos } from "@keystone/db";

// Lazy singletons — created on first use so env vars are always loaded first.
let _llm: LlmProvider | undefined;
export function llm(): LlmProvider {
  if (!_llm) _llm = createLlmProvider();
  return _llm;
}

let _whatsapp: WhatsAppClient | undefined;
export function whatsapp(): WhatsAppClient {
  if (!_whatsapp) {
    _whatsapp = new WhatsAppClient({
      token: process.env.WHATSAPP_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    });
  }
  return _whatsapp;
}

// ── Outbound messages (the delivery side of the coach gate) ──────────────────

/**
 * Draft an outbound message. requiresApproval=true parks it at DRAFT behind the
 * coach gate; false (whitelisted auto-answers) queues it for immediate delivery.
 */
export function draftMessage(params: {
  gymId: string;
  memberId: string;
  body: string;
  requiresApproval?: boolean;
}) {
  const requiresApproval = params.requiresApproval ?? true;
  return repos.outboundMessages.create({
    gymId: params.gymId,
    memberId: params.memberId,
    body: params.body,
    status: requiresApproval ? "DRAFT" : "QUEUED",
    requiresApproval,
  });
}

/**
 * Deliver a queued message to the member.
 *
 * The member panel is the primary channel — delivery means the message appears
 * in their in-app inbox, which needs no external provider and works offline of
 * WhatsApp entirely. WhatsApp becomes an optional mirror, only used when it is
 * configured, and a failure there never fails the delivery.
 */
export async function deliverMessage(id: string) {
  const msg = await repos.outboundMessages.get(id);
  if (!msg) throw new Error("Message not found");
  const member = await repos.members.get(msg.memberId);
  if (!member) throw new Error("Member not found");

  let providerMessageId: string | null = null;
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const res = await whatsapp().sendText(member.whatsappPhone, msg.body);
      providerMessageId = res.providerMessageId ?? null;
    } catch {
      /* the in-app copy is the source of truth; a mirror failure is not fatal */
    }
  }

  return repos.outboundMessages.update(id, {
    status: "SENT",
    channel: "IN_APP",
    sentAt: new Date(),
    providerMessageId,
  });
}

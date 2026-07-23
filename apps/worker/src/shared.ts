import { createLlmProvider, type LlmProvider } from "@keystone/ai";
import { WhatsAppClient } from "@keystone/whatsapp";
import { repos } from "@keystone/db";

// Process-wide singletons for the worker (env is loaded in main.ts before import).
export const llm: LlmProvider = createLlmProvider();

export const whatsapp = new WhatsAppClient({
  token: process.env.WHATSAPP_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
});

/**
 * Deliver an outbound message from a worker job: create the record, push to
 * WhatsApp, and record the outcome. Used for whitelisted auto-sends (rituals) and
 * coach-gated drafts (wins are drafted, not sent).
 */
export async function sendOutbound(
  gymId: string,
  memberId: string,
  toPhone: string,
  body: string,
): Promise<void> {
  const msg = await repos.outboundMessages.create({
    gymId,
    memberId,
    body,
    status: "QUEUED",
    requiresApproval: false,
  });
  const res = await whatsapp.sendText(toPhone, body);
  await repos.outboundMessages.update(
    msg.id,
    res.ok
      ? { status: "SENT", sentAt: new Date(), providerMessageId: res.providerMessageId ?? null }
      : { status: "FAILED", error: res.error ?? "unknown" },
  );
}

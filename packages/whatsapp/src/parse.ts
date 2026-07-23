import { z } from "zod";

// ── Inbound webhook payload (Meta WhatsApp Business Cloud API) ────────────────
// We validate the slice we use and normalize it to a flat NormalizedInbound.

const InboundMessageSchema = z.object({
  from: z.string(), // sender wa_id (phone)
  id: z.string(), // provider message id (idempotency key)
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  button: z.object({ text: z.string(), payload: z.string() }).optional(),
  interactive: z.unknown().optional(),
});

const ChangeValueSchema = z.object({
  metadata: z
    .object({
      display_phone_number: z.string().optional(),
      phone_number_id: z.string(),
    })
    .optional(),
  contacts: z
    .array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() }))
    .optional(),
  messages: z.array(InboundMessageSchema).optional(),
  statuses: z.array(z.unknown()).optional(),
});

export const WebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(z.object({ field: z.string(), value: ChangeValueSchema })),
    }),
  ),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

export interface NormalizedInbound {
  providerMessageId: string;
  fromPhone: string;
  phoneNumberId: string;
  profileName?: string;
  text: string;
  timestamp: Date;
}

/** Flatten a raw webhook into the individual member messages we care about. */
export function normalizeWebhook(raw: unknown): NormalizedInbound[] {
  const parsed = WebhookPayloadSchema.parse(raw);
  const out: NormalizedInbound[] = [];

  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const profileName = value.contacts?.[0]?.profile?.name;
      for (const msg of value.messages ?? []) {
        const text = msg.text?.body ?? msg.button?.text ?? "";
        if (!text) continue;
        out.push({
          providerMessageId: msg.id,
          fromPhone: normalizePhone(msg.from),
          phoneNumberId,
          profileName,
          text,
          timestamp: new Date(Number(msg.timestamp) * 1000),
        });
      }
    }
  }
  return out;
}

/** Store phones in E.164-ish form so member lookup is stable. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

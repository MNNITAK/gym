// Thin WhatsApp Business Cloud API client for outbound delivery.
// In dev (no token) it no-ops and logs, so the coach→member path is runnable offline.

export interface WhatsAppConfig {
  token?: string;
  phoneNumberId?: string;
  apiVersion?: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  simulated?: boolean;
  error?: string;
}

export class WhatsAppClient {
  constructor(private cfg: WhatsAppConfig) {}

  private get baseUrl(): string {
    const v = this.cfg.apiVersion ?? "v21.0";
    return `https://graph.facebook.com/${v}/${this.cfg.phoneNumberId}/messages`;
  }

  async sendText(toPhone: string, body: string): Promise<SendResult> {
    if (!this.cfg.token || !this.cfg.phoneNumberId) {
      // eslint-disable-next-line no-console
      console.log(`[whatsapp:simulated] → ${toPhone}: ${body}`);
      return { ok: true, simulated: true, providerMessageId: `sim_${Date.now()}` };
    }

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone.replace(/^\+/, ""),
        type: "text",
        text: { body },
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }
    const json = (await res.json()) as { messages?: Array<{ id: string }> };
    return { ok: true, providerMessageId: json.messages?.[0]?.id };
  }
}

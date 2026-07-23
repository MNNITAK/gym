import { describe, it, expect } from "vitest";
import { normalizeWebhook, normalizePhone } from "./parse.js";
import { verifyWebhookSignature, verifyChallenge } from "./verify.js";
import crypto from "node:crypto";

const sampleWebhook = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "PN_123", display_phone_number: "+911111" },
            contacts: [{ wa_id: "919000000001", profile: { name: "Aarav" } }],
            messages: [
              {
                from: "919000000001",
                id: "wamid.ABC",
                timestamp: "1700000000",
                type: "text",
                text: { body: "what's my plan today?" },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("webhook parsing", () => {
  it("normalizes an inbound text message", () => {
    const msgs = normalizeWebhook(sampleWebhook);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.fromPhone).toBe("+919000000001");
    expect(msgs[0]!.text).toBe("what's my plan today?");
    expect(msgs[0]!.providerMessageId).toBe("wamid.ABC");
  });

  it("normalizes phones to +E.164", () => {
    expect(normalizePhone("919000000001")).toBe("+919000000001");
    expect(normalizePhone("+91 90000 00001")).toBe("+919000000001");
  });
});

describe("signature verification", () => {
  it("accepts a correctly signed body and rejects tampering", () => {
    const secret = "app-secret";
    const body = JSON.stringify(sampleWebhook);
    const sig =
      "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body + "x", sig, secret)).toBe(false);
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
  });

  it("handles the GET challenge handshake", () => {
    expect(
      verifyChallenge(
        {
          "hub.mode": "subscribe",
          "hub.verify_token": "tok",
          "hub.challenge": "12345",
        },
        "tok",
      ),
    ).toBe("12345");
    expect(
      verifyChallenge({ "hub.mode": "subscribe", "hub.verify_token": "wrong" }, "tok"),
    ).toBeNull();
  });
});

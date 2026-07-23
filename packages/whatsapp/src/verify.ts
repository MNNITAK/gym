import crypto from "node:crypto";

/**
 * Verify the X-Hub-Signature-256 header Meta sends with every webhook POST.
 * Uses a timing-safe compare over the raw request body.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** GET verification handshake when registering the webhook with Meta. */
export function verifyChallenge(
  query: { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string },
  verifyToken: string,
): string | null {
  if (
    query["hub.mode"] === "subscribe" &&
    query["hub.verify_token"] === verifyToken
  ) {
    return query["hub.challenge"] ?? null;
  }
  return null;
}

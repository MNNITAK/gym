// End-to-end smoke test of the member → coach → member loop against a running API.
// Usage: node scripts/e2e-smoke.mjs   (requires: pnpm dev + seeded DB)
const API = process.env.API_URL ?? "http://localhost:4000";

async function j(path, opts = {}, token) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  // 1. health
  const health = await j("/health");
  console.log("health:", health);

  // 2. simulate an inbound member message
  const inbound = await j("/webhooks/whatsapp/simulate", {
    method: "POST",
    body: JSON.stringify({
      fromPhone: "+919000000001",
      text: "what is my plan today?",
    }),
  });
  console.log("inbound handled:", inbound);

  // 3. safety escalation path
  const escalate = await j("/webhooks/whatsapp/simulate", {
    method: "POST",
    body: JSON.stringify({
      fromPhone: "+919000000002",
      text: "I have chest pain during squats",
    }),
  });
  console.log("safety escalation intent:", escalate.intent);
  if (escalate.intent !== "escalate") throw new Error("safety path failed");

  // 4. coach logs in
  const { token } = await j("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "coach@demo.gym", password: "demo" }),
  });
  console.log("coach authenticated");

  // 5. coach sees pending messages and approves the first
  const pending = await j("/messages/pending", {}, token);
  console.log(`pending messages: ${pending.length}`);
  if (pending.length === 0) throw new Error("expected a drafted message");

  const sent = await j(`/messages/${pending[0].id}/approve`, { method: "POST" }, token);
  console.log("approved & sent:", { id: sent.id, status: sent.status });
  if (sent.status !== "SENT") throw new Error("delivery did not reach SENT");

  console.log("\n✅ E2E loop passed: member → coach approval → delivery");
}

main().catch((e) => {
  console.error("\n❌ E2E failed:", e.message);
  process.exit(1);
});

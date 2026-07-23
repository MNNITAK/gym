// End-to-end test of the Retention Engine: inbound concierge (auto-answer),
// a durable-fact note, injury signal, a logged weigh-in that builds a streak,
// a "send a win" scan (milestone → coach-gated congrats), and the at-risk list.
// Requires: API running + seeded DB.
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

async function sim(text, fromPhone = "+919000000001") {
  return j("/webhooks/whatsapp/simulate", {
    method: "POST",
    body: JSON.stringify({ fromPhone, text }),
  });
}

async function main() {
  const { token } = await j("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "coach@demo.gym", password: "keystone-demo" }),
  });
  console.log("coach authenticated");

  // 1) Concierge question → the bot answers (auto-sent when confident).
  const c = await sim("when is my next class?");
  console.log("concierge inbound → intent:", c.intent);

  // 2) A durable-fact note (memory-extraction fodder) + an injury signal.
  const n = await sim("just a heads up, I'm vegetarian and my left knee hurts on squats");
  console.log("note inbound → intent:", n.intent);

  // 3) A weigh-in log (engagement → streak).
  const w = await sim("weighed in at 81 kg today");
  console.log("log inbound → intent:", w.intent);

  // 4) Send-a-win scan (member started at 84kg → 81kg = 3kg down milestone).
  const members = await j("/members", {}, token);
  const member = members.find((m) => m.whatsappPhone === "+919000000001") ?? members[0];
  const wins = await j(`/members/${member.id}/wins/scan`, { method: "POST" }, token);
  console.log("win scan → detected:", wins.detected, "| newly celebrated:", wins.newlyCelebrated);

  const milestones = await j(`/members/${member.id}/milestones`, {}, token);
  console.log("milestones on record:", milestones.map((m) => m.title));

  // 5) At-risk list (coach retention queue).
  const atRisk = await j("/retention/at-risk", {}, token);
  console.log("at-risk members:", atRisk.length);

  // 6) Owner analytics overview.
  const overview = await j("/analytics/overview", {}, token);
  console.log("analytics overview:", overview);

  console.log("\n✅ Retention Engine E2E passed: concierge → note/injury → log/streak → win scan → at-risk → analytics");
}

main().catch((e) => {
  console.error("\n❌ Retention E2E failed:", e.message);
  process.exit(1);
});

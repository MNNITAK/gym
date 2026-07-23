// End-to-end smoke of the consolidated Next.js app (the Vercel deployment target).
// Exercises all three engines + the flywheel through the /api routes.
// Requires: the dashboard running (pnpm --filter @keystone/dashboard start) + seeded DB.
const APP = process.env.APP_URL ?? "http://localhost:3000";

async function j(path, opts = {}, token) {
  const res = await fetch(`${APP}/api${path}`, {
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
  const { token } = await j("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "coach@demo.gym", password: "keystone-demo" }),
  });
  console.log("✓ coach authenticated");

  const members = await j("/members", {}, token);
  const member = members.find((m) => m.whatsappPhone === "+919000000001") ?? members[0];
  if (!member) throw new Error("no members — run pnpm db:seed");
  console.log(`✓ members listed (${members.length}) → ${member.name}`);

  const brain = await j(`/members/${encodeURIComponent(member.id)}`, {}, token);
  console.log(
    `✓ member brain: ${brain.memories.length} memories · twin ${brain.metabolicTwin?.computedTdee ?? "—"} kcal · churn ${brain.churnScore?.risk ?? "—"}`,
  );

  // Diet engine
  const diet = await j(`/members/${encodeURIComponent(member.id)}/diet-plan/generate`, { method: "POST" }, token);
  console.log(
    `✓ diet plan drafted: ${diet.plan.payload.protocolSlug} · ${diet.plan.payload.dailyTargets.kcal} kcal`,
  );

  // Training engine
  const training = await j(`/members/${encodeURIComponent(member.id)}/training-plan/generate`, { method: "POST" }, token);
  console.log(
    `✓ training plan drafted: ${training.plan.payload.protocolSlug} · deload=${training.plan.payload.deload}`,
  );

  // Coach gate: approve + activate both
  for (const [label, plan] of [["diet", diet.plan], ["training", training.plan]]) {
    await j(`/plans/${plan.id}/transition`, { method: "POST", body: JSON.stringify({ to: "APPROVED" }) }, token);
    const active = await j(`/plans/${plan.id}/transition`, { method: "POST", body: JSON.stringify({ to: "ACTIVE" }) }, token);
    if (active.status !== "ACTIVE") throw new Error(`${label} plan not ACTIVE`);
    console.log(`✓ ${label} plan approved + activated → delivered to member`);

    const pdf = await fetch(`${APP}/api/plans/${plan.id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bytes = Buffer.from(await pdf.arrayBuffer());
    if (!(pdf.headers.get("content-type") ?? "").includes("pdf") || bytes.length < 500) {
      throw new Error(`${label} PDF failed`);
    }
    console.log(`✓ ${label} PDF rendered (${bytes.length} bytes)`);
  }

  // Retention: inbound concierge + a weigh-in
  const c = await j("/whatsapp/simulate", { method: "POST", body: JSON.stringify({ text: "when is my next class?" }) });
  console.log(`✓ concierge inbound handled (intent: ${c.intent})`);
  const w = await j("/whatsapp/simulate", { method: "POST", body: JSON.stringify({ text: "weighed in at 80 kg today" }) });
  console.log(`✓ weigh-in logged (intent: ${w.intent})`);

  // Send-a-win
  const wins = await j(`/members/${encodeURIComponent(member.id)}/wins/scan`, { method: "POST" }, token);
  console.log(`✓ win scan → detected [${wins.detected.join(", ") || "none"}]`);

  // Recurring engine work (replaces the Redis worker)
  const jobs = await j("/jobs/run", { method: "POST", body: JSON.stringify({}) }, token);
  console.log(`✓ engine jobs ran: ${JSON.stringify(jobs.summary)}`);

  // Coach queue + analytics
  const [pendingPlans, pendingMsgs, atRisk, overview, patterns] = await Promise.all([
    j("/plans/pending", {}, token),
    j("/messages/pending", {}, token),
    j("/retention/at-risk", {}, token),
    j("/analytics/overview", {}, token),
    j("/analytics/patterns", {}, token),
  ]);
  console.log(
    `✓ coach queue: ${pendingPlans.length} plans · ${pendingMsgs.length} messages | at-risk ${atRisk.length} | patterns ${patterns.length}`,
  );
  console.log(`✓ analytics:`, overview);

  console.log("\n✅ Full demo passed on the single Next.js app — no API server, no Redis.");
}

main().catch((e) => {
  console.error("\n❌ Demo failed:", e.message);
  process.exit(1);
});

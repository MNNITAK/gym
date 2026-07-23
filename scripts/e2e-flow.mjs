// The full premium-coaching loop, end to end:
//   register → onboard → check in → request → coach generates → approves →
//   member's screen flips to READY.
// Requires the app running + seeded DB.
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
  const body = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function main() {
  // ── Member ──
  const { token: MT } = await j("/me/login", {
    method: "POST",
    body: JSON.stringify({ phone: "9000000003", password: "member-demo" }),
  });
  const me = await j("/me/today", {}, MT);
  console.log(`✓ member signed in — stage: ${me.stage}`);

  if (!me.checkin.complete) {
    await j("/me/checkin", { method: "POST", body: JSON.stringify({ action: "start" }) }, MT);
    const answers = {
      weight: 68.4, mood: 4, energy: 4, sleepQuality: 4, sleepHours: 7.5,
      soreness: 2, pain: "None", stress: 2, water: "2–3L",
      mealsYesterday: "On plan", motivation: 4, timeAvailable: "60 min",
      preference: "Whatever's planned", recovery: 4,
      notes: "Feeling good, knee has been quiet this week.",
    };
    const sub = await j(
      "/me/checkin",
      { method: "POST", body: JSON.stringify({ action: "submit", answers }) },
      MT,
    );
    console.log(`✓ checked in — readiness ${sub.readiness.band.toUpperCase()} (${sub.readiness.score})`);
    console.log(`  suggests: ${sub.suggestion.kinds.join(" + ")}`);
  } else {
    console.log("✓ already checked in today");
  }

  const req = await j("/me/plan-request", { method: "POST", body: JSON.stringify({}) }, MT);
  console.log(`✓ plan requested → ${req.request.status}`);

  const waiting = await j("/me/today", {}, MT);
  console.log(`✓ member is now in stage: ${waiting.stage}`);
  if (waiting.warmup) {
    console.log(`  warm-up offered: ${waiting.warmup.name} (${waiting.warmup.steps.length} steps, ${waiting.warmup.totalMinutes} min)`);
  }

  // ── Coach ──
  const { token: CT } = await j("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "coach@demo.gym", password: "keystone-demo" }),
  });
  const queue = await j("/requests", {}, CT);
  const mine = queue.find((q) => q.id === req.request.id) ?? queue[0];
  console.log(`✓ coach queue has ${queue.length} request(s) — reviewing ${mine.memberName}`);

  const detail = await j(`/requests/${mine.id}`, {}, CT);
  console.log(`  readiness ${detail.checkin.readiness.band} · ${detail.memories.length} memories · ${detail.weightSeries.length} weight points`);

  console.log("  generating (real Groq)…");
  await j(
    `/requests/${mine.id}`,
    { method: "POST", body: JSON.stringify({ action: "generate", kinds: mine.kinds }) },
    CT,
  );
  const drafted = await j(`/requests/${mine.id}`, {}, CT);
  console.log(`✓ drafted ${drafted.draftedPlans.length} plan(s): ${drafted.draftedPlans.map((p) => p.type).join(", ")}`);
  for (const p of drafted.draftedPlans) {
    const decisions = p.stateSnapshot?.decisions ?? [];
    const enforced = decisions.filter((d) => d.severity === "enforced").length;
    console.log(`  ${p.type}: ${decisions.length} decisions traced, ${enforced} enforced rule(s)`);
  }

  await j(`/requests/${mine.id}`, { method: "POST", body: JSON.stringify({ action: "approve" }) }, CT);
  console.log("✓ coach approved");

  // ── Back to the member ──
  const after = await j("/me/today", {}, MT);
  console.log(`✓ member stage is now: ${after.stage}`);
  if (after.stage !== "READY") throw new Error(`expected READY, got ${after.stage}`);
  console.log(`  today: ${after.targets ? `${after.targets.kcal} kcal` : "no targets"} · ${after.session ? after.session.focus : "rest"}`);

  console.log("\n✅ Full loop passed: check-in → request → coach review → approve → member sees the plan.");
}

main().catch((e) => {
  console.error("\n❌ Flow failed:", e.message);
  process.exit(1);
});

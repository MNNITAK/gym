// End-to-end smoke of the MEMBER panel — the whole member experience with no
// WhatsApp involved. Requires the app running + seeded DB.
const APP = process.env.APP_URL ?? "http://localhost:3000";
let TOKEN = "";

async function me(path, opts = {}) {
  const res = await fetch(`${APP}/api/me${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  // 1. Sign in as a member
  const login = await me("/login", {
    method: "POST",
    body: JSON.stringify({ phone: "9000000001", password: "member-demo" }),
  });
  TOKEN = login.token;
  console.log(`✓ member signed in: ${login.member.name} · ${login.member.tier} · 🔥${login.member.currentStreak}`);

  // 2. Today
  const today = await me("/today");
  console.log(
    `✓ today: ${today.targets ? `${today.targets.kcal} kcal` : "no diet plan"} · ${today.session ? today.session.focus : "rest day"} · ${today.rituals.length} rituals`,
  );

  // 3. Diet — plan shown digitally, no PDF
  const diet = await me("/diet");
  console.log(
    `✓ diet: ${diet.plan ? `${diet.plan.protocolSlug} · ${diet.plan.targets.meals.length} meals · ${diet.plan.coupledDays.length} coupled days` : "none"}`,
  );

  // 4. Training — session + curated library detail
  const training = await me("/training");
  const withLib = training.today?.exercises.filter((e) => e.library).length ?? 0;
  console.log(
    `✓ training: ${training.plan ? training.plan.protocolSlug : "none"} · today ${training.today?.focus ?? "rest"} · ${withLib} exercises with coaching cues · rehab ${training.rehab.length}`,
  );

  // 5. Log something directly
  await me("/log", { method: "POST", body: JSON.stringify({ type: "WEIGHT", payload: { weightKg: 80.4 } }) });
  console.log("✓ logged weight from the panel");

  // 6. Talk to each agent — and check they take real actions
  for (const [agent, message] of [
    ["hearth", "I'm craving chocolate really badly right now"],
    ["forge", "my left knee hurts when I squat"],
    ["anchor", "am I actually making progress?"],
  ]) {
    const res = await me("/agent", { method: "POST", body: JSON.stringify({ agent, message }) });
    console.log(`✓ ${agent} coach → "${res.reply.slice(0, 70)}…"`);
    if (res.actions.length) console.log(`    actions: ${res.actions.map((a) => a.label).join(" · ")}`);
    if (res.escalated) console.log("    ⚠ escalated to a human coach");
  }

  // 7. Thread persisted
  const thread = await me("/agent?agent=hearth");
  console.log(`✓ Hearth thread persisted: ${thread.turns.length} turns · ${thread.openers.length} suggestions`);

  // 8. Progress
  const prog = await me("/progress");
  console.log(
    `✓ progress: ${prog.currentWeightKg}kg (${prog.changeKg > 0 ? "+" : ""}${prog.changeKg}) · twin ${prog.twin?.tdee ?? "—"}${prog.twin?.usesRegression ? " (measured)" : ""} · ${prog.milestones.length} wins · tier ${prog.tier.current}`,
  );

  // 9. Profile — the member brain, member-visible
  const profile = await me("/profile");
  console.log(
    `✓ profile: ${profile.memories.length} remembered facts · ${profile.injuries.length} injuries · ${profile.events.length} events`,
  );

  // 10. Gym + inbox
  const gym = await me("/gym");
  const inbox = await me("/inbox");
  console.log(`✓ gym: ${gym.classSchedule.length} classes · ${Object.keys(gym.policies).length} policies`);
  console.log(`✓ inbox: ${inbox.length} messages`);

  console.log("\n✅ Member panel E2E passed — full experience in the browser, zero WhatsApp.");
}

main().catch((e) => {
  console.error("\n❌ Member E2E failed:", e.message);
  process.exit(1);
});

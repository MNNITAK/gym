// End-to-end smoke of the Phase 5 surfaces — measurements, calendar, history,
// settings, and the ordered day schedule. Requires the app running + seeded DB.
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
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function main() {
  const login = await me("/login", {
    method: "POST",
    body: JSON.stringify({ phone: "9000000001", password: "member-demo" }),
  });
  TOKEN = login.token;
  console.log(`✓ signed in: ${login.member.name}`);

  // 1. The day as an ordered list of tasks
  const today = await me("/today");
  const sched = today.schedule ?? [];
  const times = sched.map((t) => t.time);
  if (sched.length < 2) throw new Error("schedule is empty — buildDayPlan produced nothing");
  if (JSON.stringify(times) !== JSON.stringify([...times].sort())) {
    throw new Error(`schedule is not in time order: ${times.join(", ")}`);
  }
  console.log(
    `✓ schedule: ${sched.length} tasks ${sched[0].time}→${sched.at(-1).time} · next = ${
      today.nextTask ? `${today.nextTask.time} ${today.nextTask.title}` : "day complete"
    }`,
  );
  console.log(`  ${sched.map((t) => `${t.time} ${t.done ? "✓" : "○"} ${t.title}`).join("\n  ")}`);

  // 2. Ticking a meal writes a real INTAKE log, and today reflects it
  const meal = sched.find((t) => t.kind === "MEAL" && !t.done);
  if (meal) {
    await me("/log", {
      method: "POST",
      body: JSON.stringify({
        type: "INTAKE",
        payload: { taskId: meal.id, mealName: meal.title, raw: meal.detail },
      }),
    });
    const after = await me("/today");
    const same = after.schedule.find((t) => t.id === meal.id);
    if (!same?.done) throw new Error("completed meal did not come back as done");
    console.log(`✓ completing "${meal.title}" wrote an INTAKE log and ticked the task`);
  }

  // 3. Measurements — write then read back
  const before = await me("/measurements");
  await me("/measurements", {
    method: "POST",
    body: JSON.stringify({ waistCm: 86.5, chestCm: 101, armCm: 35 }),
  });
  const after = await me("/measurements");
  if (after.measurements.length <= before.measurements.length) {
    throw new Error("measurement was not persisted");
  }
  console.log(
    `✓ measurements: ${before.measurements.length} → ${after.measurements.length} entries · latest waist ${after.measurements[0].waistCm}cm`,
  );

  // 4. Calendar — this month and one month back
  const cal = await me("/calendar?back=0");
  const back = await me("/calendar?back=1");
  const active = Object.values(cal.days).filter((d) => d.checkedIn || d.logged).length;
  console.log(`✓ calendar: ${cal.monthLabel} · ${active} active days · prev = ${back.monthLabel}`);

  // 5. History
  const hist = await me("/history");
  console.log(`✓ history: ${hist.plans.length} plans · ${hist.checkins.length} check-ins`);

  // 6. Settings — read, patch, confirm
  const s = await me("/settings");
  await me("/settings", { method: "POST", body: JSON.stringify({ preferredTrainingTime: "06:00" }) });
  const s2 = await me("/settings");
  if (s2.preferredTrainingTime !== "06:00") throw new Error("settings patch did not stick");
  await me("/settings", {
    method: "POST",
    body: JSON.stringify({ preferredTrainingTime: s.preferredTrainingTime ?? "18:00" }),
  });
  console.log(`✓ settings: training time round-tripped (restored to ${s.preferredTrainingTime ?? "18:00"})`);

  // 7. Every Phase 5 screen renders
  for (const p of ["/app/measurements", "/app/calendar", "/app/history", "/app/settings", "/app/more"]) {
    const res = await fetch(`${APP}${p}`);
    if (!res.ok) throw new Error(`${p} → ${res.status}`);
  }
  console.log("✓ screens: measurements, calendar, history, settings, more all render");

  console.log("\nPhase 5 green.");
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});

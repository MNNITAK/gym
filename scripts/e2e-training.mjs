// End-to-end test of the Training Engine: generate (real LLM) → coach review →
// approve → activate → member delivery + branded PDF. Requires: API running + seeded DB.
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
  const { token } = await j("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "coach@demo.gym", password: "keystone-demo" }),
  });
  console.log("coach authenticated");

  const members = await j("/members", {}, token);
  const member = members.find((m) => m.whatsappPhone === "+919000000001") ?? members[0];
  if (!member) throw new Error("no members found — seed first");
  console.log("member:", member.name, member.id);

  console.log("generating training plan via LLM… (this calls Groq)");
  const gen = await j(`/members/${member.id}/training-plan/generate`, { method: "POST" }, token);
  const planId = gen.plan.id;
  const payload = gen.plan.payload;
  console.log("  protocol:", payload.protocolSlug, "| days/week:", payload.daysPerWeek);
  console.log("  deload:", payload.deload, "| fatigue:", gen.fatigue.level);
  console.log("  injured regions:", gen.injuredRegions.join(", ") || "none");
  console.log("  week:", (payload.week ?? []).map((d) => `${d.day}:${d.focus}`).join(", "));
  console.log("  rationale:", gen.plan.rationale);

  const detail = await j(`/plans/${planId}`, {}, token);
  if (detail.status !== "PENDING_REVIEW") throw new Error(`expected PENDING_REVIEW, got ${detail.status}`);
  if (detail.type !== "TRAINING") throw new Error(`expected TRAINING, got ${detail.type}`);
  console.log("plan is PENDING_REVIEW (awaiting coach)");

  await j(`/plans/${planId}/approve`, { method: "POST" }, token);
  const activated = await j(`/plans/${planId}/activate`, { method: "POST" }, token);
  if (activated.status !== "ACTIVE") throw new Error(`expected ACTIVE, got ${activated.status}`);
  console.log("coach approved + activated → delivered to member on WhatsApp (simulated)");

  const pdfRes = await fetch(`${API}/plans/${planId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ct = pdfRes.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await pdfRes.arrayBuffer());
  if (!ct.includes("pdf") || bytes.length < 500) throw new Error("PDF generation failed");
  console.log(`branded PDF generated: ${bytes.length} bytes (${ct})`);

  console.log("\n✅ Training Engine E2E passed: generate → review → approve → activate → deliver + PDF");
}

main().catch((e) => {
  console.error("\n❌ Training E2E failed:", e.message);
  process.exit(1);
});

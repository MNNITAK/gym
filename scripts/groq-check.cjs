// Verify the Groq key + structured JSON output work end to end.
const { createLlmProvider } = require("../packages/ai/dist/index.js");
const { z } = require("zod");

(async () => {
  const llm = createLlmProvider();
  console.log("provider:", llm.name);
  const schema = z.object({ ok: z.boolean(), pickedProtocol: z.string() });
  const { data, raw } = await llm.completeStructured(
    [
      { role: "system", content: "You pick a diet protocol. Return JSON." },
      { role: "user", content: "Member wants fat loss, high adherence. Choose one of: mini-cut, maintenance, reverse-diet. Return {ok:true, pickedProtocol}." },
    ],
    schema,
    { task: "fast" },
  );
  console.log("model:", raw.model);
  console.log("structured output:", data);
  console.log("\n✅ Groq structured output works.");
  process.exit(0);
})().catch((e) => {
  console.error("\n❌ Groq check failed:", e.message);
  process.exit(1);
});

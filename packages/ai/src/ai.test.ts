import { describe, it, expect } from "vitest";
import { MockProvider } from "./mock-provider.js";
import { classifyInbound } from "./engines/routing.js";
import { draftDietPlan } from "./engines/diet.js";

describe("routing", () => {
  it("hard-escalates safety signals before hitting the model", async () => {
    const llm = new MockProvider(); // no canned data — proves model wasn't consulted
    const res = await classifyInbound(llm, "I have chest pain during squats");
    expect(res.intent).toBe("escalate");
    expect(res.reason).toContain("safety");
  });

  it("routes a normal question via the model", async () => {
    const llm = new MockProvider().when(/what's my plan/i, {
      intent: "concierge",
      confidence: 0.9,
    });
    const res = await classifyInbound(llm, "what's my plan today?");
    expect(res.intent).toBe("concierge");
  });
});

describe("diet engine", () => {
  it("overrides model adjustment with the adherence gate and clamps the floor", async () => {
    const llm = new MockProvider().when(/nutritionist/i, {
      protocolSlug: "mini-cut",
      dailyTargets: { kcal: 1000, proteinG: 180, carbsG: 60, fatG: 30 },
      meals: [{ name: "Breakfast", items: ["eggs", "oats"] }],
      groceryList: ["eggs"],
      adjustment: "decrease", // model wants to cut...
    });

    const res = await draftDietPlan(llm, {
      member: { name: "A", sex: "M", goal: "lose", weightKg: 84 },
      tdee: 2500,
      protocol: { slug: "mini-cut", name: "Mini-Cut", summary: "", science: {} },
      memories: [],
      noteAdjustments: [],
      // ...but adherence is low, so the gate must force a behavior conversation
      adherence: { adherence: 0.4, weightChangeKg: 0, goal: "lose" },
    });

    expect(res.payload.adjustment).toBe("behavior_intervention");
    expect(res.payload.dailyTargets.kcal).toBe(1500); // clamped to male floor
    expect(res.floorEnforced).toBe(true);
  });
});

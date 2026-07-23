import { describe, it, expect } from "vitest";
import { MockProvider } from "./mock-provider.js";
import {
  selectDietProtocol,
  parseNote,
  renderDietPlanText,
} from "./engines/diet.js";
import type { DietPlanPayload } from "@keystone/core";

const candidates = [
  { slug: "mini-cut", name: "Mini-Cut", summary: "", science: {} },
  { slug: "maintenance", name: "Maintenance", summary: "", science: {} },
  { slug: "reverse-diet", name: "Reverse", summary: "", science: {} },
];

describe("protocol selection", () => {
  it("uses the model's valid choice", async () => {
    const llm = new MockProvider().when(/protocol/i, {
      slug: "mini-cut",
      rationale: "adherent fat-loss member",
    });
    const res = await selectDietProtocol(llm, {
      member: { goal: "lose", adherent: true },
      candidates,
    });
    expect(res.slug).toBe("mini-cut");
  });

  it("falls back to a heuristic when the model returns an unknown slug", async () => {
    const llm = new MockProvider().when(/protocol/i, {
      slug: "does-not-exist",
      rationale: "bogus",
    });
    const res = await selectDietProtocol(llm, {
      member: { goal: "lose", adherent: true },
      candidates,
    });
    expect(res.slug).toBe("mini-cut"); // heuristic prefers mini-cut for fat loss
  });

  it("defaults to maintenance when the library is empty", async () => {
    const res = await selectDietProtocol(new MockProvider(), {
      member: { goal: "maintain", adherent: true },
      candidates: [],
    });
    expect(res.slug).toBe("maintenance");
  });
});

describe("note parsing", () => {
  it("returns structured adjustments", async () => {
    const llm = new MockProvider().when(/structured plan adjustments/i, {
      sentiment: "stressed",
      adjustments: [{ kind: "cheaper_food", detail: "tight on money" }],
    });
    const res = await parseNote(llm, "trying to save money this month");
    expect(res.adjustments[0]!.kind).toBe("cheaper_food");
  });
});

describe("plan renderer", () => {
  it("renders macros, meals, and grocery list", () => {
    const payload: DietPlanPayload = {
      protocolSlug: "mini-cut",
      dailyTargets: { kcal: 2000, proteinG: 180, carbsG: 150, fatG: 60 },
      meals: [{ name: "Breakfast", items: ["eggs", "oats"] }],
      groceryList: ["eggs", "oats"],
      adjustment: "hold",
      notesApplied: [],
    };
    const text = renderDietPlanText(payload, "Aarav");
    expect(text).toContain("Aarav");
    expect(text).toContain("2000 kcal");
    expect(text).toContain("Breakfast");
    expect(text).toContain("Grocery list");
  });
});

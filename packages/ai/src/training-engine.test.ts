import { describe, it, expect } from "vitest";
import { MockProvider } from "./mock-provider.js";
import {
  selectTrainingProtocol,
  draftTrainingPlan,
  renderTrainingPlanText,
} from "./engines/training.js";

const candidates = [
  { slug: "stronglifts-5x5", name: "StrongLifts 5x5", summary: "", science: {} },
  { slug: "ppl", name: "PPL", summary: "", science: {} },
  { slug: "hyrox-prep", name: "Hyrox", summary: "", science: {} },
];

describe("training protocol selection", () => {
  it("uses the model's valid choice", async () => {
    const llm = new MockProvider().when(/protocol/i, { slug: "ppl", rationale: "intermediate, 6 days" });
    const res = await selectTrainingProtocol(llm, {
      member: { goal: "gain", experience: "intermediate", daysPerWeek: 6 },
      candidates,
    });
    expect(res.slug).toBe("ppl");
  });

  it("falls back to a heuristic on an unknown slug (novice → stronglifts)", async () => {
    const llm = new MockProvider().when(/protocol/i, { slug: "nope", rationale: "x" });
    const res = await selectTrainingProtocol(llm, {
      member: { goal: "gain", experience: "novice", daysPerWeek: 3 },
      candidates,
    });
    expect(res.slug).toBe("stronglifts-5x5");
  });
});

describe("training plan drafting", () => {
  const canned = {
    protocolSlug: "ppl",
    daysPerWeek: 3,
    week: [
      {
        day: "Mon",
        focus: "Push",
        intensity: "high",
        exercises: [
          { name: "Bench Press", sets: 4, reps: "6-8", targetRpe: 8, regression: "Push-up", progression: "Add load" },
        ],
      },
    ],
    deload: false,
  };

  it("forces a deload and softens intensity when the Fatigue Guardian fires", async () => {
    const llm = new MockProvider().when(/conditioning coach generating/i, canned);
    const res = await draftTrainingPlan(llm, {
      member: { name: "A", goal: "gain", experience: "intermediate", daysPerWeek: 3 },
      protocol: { slug: "ppl", name: "PPL", summary: "", science: {} },
      memories: [],
      injuredRegions: [],
      // 6 weeks since deload → cap forces a deload regardless of the model
      fatigue: { avgRpe: 7, avgSleepHours: 8, soreness: 2, weeksSinceDeload: 6, failedSets: 0 },
    });
    expect(res.payload.deload).toBe(true);
    expect(res.payload.week[0]!.intensity).not.toBe("high");
  });

  it("renders a WhatsApp week with the deload banner", () => {
    const text = renderTrainingPlanText(
      { ...canned, deload: true } as never,
      "Aarav",
    );
    expect(text).toContain("Aarav");
    expect(text).toContain("Deload");
    expect(text).toContain("Bench Press");
  });
});

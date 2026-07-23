import { describe, it, expect } from "vitest";
import {
  updateStreak,
  computeTier,
  detectMilestones,
  estimatedOneRepMax,
  estimateSentiment,
} from "./retention.js";

const day = (n: number) => new Date(2026, 0, n);

describe("streaks", () => {
  it("extends on a consecutive day", () => {
    const s = updateStreak({ currentStreak: 3, longestStreak: 5 }, day(10), day(11));
    expect(s.currentStreak).toBe(4);
  });
  it("is a no-op on the same day", () => {
    const s = updateStreak({ currentStreak: 3, longestStreak: 5 }, day(10), day(10));
    expect(s.currentStreak).toBe(3);
  });
  it("resets after a gap and tracks the longest", () => {
    const s = updateStreak({ currentStreak: 9, longestStreak: 9 }, day(10), day(14));
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(9);
  });
});

describe("tiers", () => {
  it("promotes a long-tenured, consistent member to platinum", () => {
    expect(computeTier({ tenureDays: 200, longestStreak: 40, adherence: 0.9 })).toBe("PLATINUM");
  });
  it("keeps a brand-new member at bronze", () => {
    expect(computeTier({ tenureDays: 3, longestStreak: 2, adherence: 0.9 })).toBe("BRONZE");
  });
});

describe("milestone detection", () => {
  it("celebrates whole-kg loss for a cutting member", () => {
    const ms = detectMilestones({
      goal: "lose",
      startWeightKg: 84,
      currentWeightKg: 81.4,
      currentStreak: 3,
      longestStreak: 3,
    });
    const w = ms.find((m) => m.type === "WEIGHT_LOSS");
    expect(w?.key).toBe("weight_loss:2");
  });

  it("detects a strength PR from estimated 1RM", () => {
    const ms = detectMilestones({
      currentStreak: 1,
      longestStreak: 1,
      priorBestE1rm: { squat: 140 },
      latestE1rm: { squat: 150 },
    });
    expect(ms.some((m) => m.type === "PR")).toBe(true);
  });

  it("marks streak milestones at defined thresholds", () => {
    const ms = detectMilestones({ currentStreak: 30, longestStreak: 30 });
    expect(ms.find((m) => m.type === "STREAK")?.key).toBe("streak:30");
  });
});

describe("estimated 1RM", () => {
  it("returns the load itself for a single", () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
  });
  it("scales up with reps (Epley)", () => {
    expect(estimatedOneRepMax(100, 10)).toBeGreaterThan(120);
  });
});

describe("sentiment heuristic", () => {
  it("scores encouragement positive", () => {
    expect(estimateSentiment("feeling great, smashed my workout, thanks!")).toBeGreaterThan(0);
  });
  it("scores a struggling message negative", () => {
    expect(estimateSentiment("so tired and stressed, I want to quit")).toBeLessThan(0);
  });
  it("is neutral on plain text", () => {
    expect(estimateSentiment("my weight is 80kg today")).toBe(0);
  });
});

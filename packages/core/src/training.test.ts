import { describe, it, expect } from "vitest";
import {
  decideFatigue,
  decideProgression,
  screenForInjury,
  coupleMacrosToTraining,
  MAX_WEEKS_BEFORE_DELOAD,
} from "./training.js";

describe("Fatigue Guardian", () => {
  it("forces a deload at the mesocycle cap regardless of markers", () => {
    const d = decideFatigue({
      avgRpe: 6,
      avgSleepHours: 8,
      soreness: 1,
      weeksSinceDeload: MAX_WEEKS_BEFORE_DELOAD,
      failedSets: 0,
    });
    expect(d.deload).toBe(true);
    expect(d.level).toBe("overreached");
  });

  it("forces a deload when acute fatigue markers stack up", () => {
    const d = decideFatigue({
      avgRpe: 9,
      avgSleepHours: 5,
      soreness: 8,
      weeksSinceDeload: 2,
      failedSets: 1,
    });
    expect(d.deload).toBe(true);
    expect(d.reasons.length).toBeGreaterThan(0);
  });

  it("leaves a fresh, well-recovered member training", () => {
    const d = decideFatigue({
      avgRpe: 7,
      avgSleepHours: 8,
      soreness: 2,
      weeksSinceDeload: 1,
      failedSets: 0,
    });
    expect(d.deload).toBe(false);
    expect(d.level).toBe("fresh");
  });
});

describe("auto-progression", () => {
  it("adds load when all sets hit the top of the range at RPE ≤ 8", () => {
    const d = decideProgression({
      repRange: [8, 12],
      incrementKg: 2.5,
      sets: [
        { reps: 12, rpe: 7, loadKg: 60 },
        { reps: 12, rpe: 8, loadKg: 60 },
        { reps: 12, rpe: 8, loadKg: 60 },
      ],
    });
    expect(d.action).toBe("increase");
    expect(d.nextLoadKg).toBe(62.5);
  });

  it("holds when RPE is maxed even at the top of the range", () => {
    const d = decideProgression({
      repRange: [8, 12],
      incrementKg: 2.5,
      sets: [{ reps: 12, rpe: 10, loadKg: 60 }],
    });
    expect(d.action).toBe("hold");
  });

  it("reduces load when the member misses the bottom of the range", () => {
    const d = decideProgression({
      repRange: [8, 12],
      incrementKg: 2.5,
      sets: [{ reps: 5, rpe: 10, loadKg: 60 }],
    });
    expect(d.action).toBe("decrease");
    expect(d.nextLoadKg).toBe(57.5);
  });
});

describe("injury screening", () => {
  it("flags a pain mention with a region and forces coach review", () => {
    const s = screenForInjury("my lower back hurts on deadlifts");
    expect(s.injuryFlag).toBe(true);
    expect(s.regions).toContain("lower_back");
  });

  it("does not flag ordinary training talk", () => {
    expect(screenForInjury("what should I train today?").injuryFlag).toBe(false);
  });
});

describe("diet/training coupling (IP #2)", () => {
  const baseline = { kcal: 2500, proteinG: 190, carbsG: 250, fatG: 70 };

  it("fuels a high-intensity day with more carbs, protein fixed", () => {
    const c = coupleMacrosToTraining(baseline, "high");
    expect(c.kcal).toBeGreaterThan(baseline.kcal);
    expect(c.carbsG).toBeGreaterThan(baseline.carbsG);
    expect(c.proteinG).toBe(baseline.proteinG);
  });

  it("pulls calories on a rest day", () => {
    const c = coupleMacrosToTraining(baseline, "rest");
    expect(c.kcal).toBeLessThan(baseline.kcal);
    expect(c.carbsG).toBeLessThan(baseline.carbsG);
    expect(c.proteinG).toBe(baseline.proteinG);
  });
});

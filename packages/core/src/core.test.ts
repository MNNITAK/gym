import { describe, it, expect } from "vitest";
import { decideAdjustment, ADHERENCE_THRESHOLD } from "./adherence.js";
import { estimateMetabolicTwin, mifflinStJeorTdee } from "./metabolic.js";
import { scoreChurn } from "./churn.js";
import { canTransitionPlan } from "./approval.js";
import { enforceCalorieFloor, screenForSafety } from "./guardrails.js";

describe("adherence-gated adjustment (IP #1)", () => {
  it("NEVER cuts calories when adherence is below threshold", () => {
    const d = decideAdjustment({
      adherence: 0.4,
      weightChangeKg: 0, // stalled
      goal: "lose",
    });
    expect(d.decision).toBe("behavior_intervention");
  });

  it("holds when adherent and progressing", () => {
    const d = decideAdjustment({
      adherence: 0.9,
      weightChangeKg: -0.5,
      goal: "lose",
    });
    expect(d.decision).toBe("hold");
  });

  it("decreases only on a high-adherence plateau", () => {
    const d = decideAdjustment({
      adherence: 0.9,
      weightChangeKg: 0,
      goal: "lose",
    });
    expect(d.decision).toBe("decrease");
  });

  it("threshold boundary is treated as sub-threshold safe", () => {
    const d = decideAdjustment({
      adherence: ADHERENCE_THRESHOLD - 0.001,
      weightChangeKg: 0,
      goal: "lose",
    });
    expect(d.decision).toBe("behavior_intervention");
  });
});

describe("metabolic twin (IP #3)", () => {
  it("falls back to formula with too few days", () => {
    const est = estimateMetabolicTwin([], 2400);
    expect(est.usesRegression).toBe(false);
    expect(est.computedTdee).toBe(2400);
  });

  it("recovers a known TDEE from consistent logs", () => {
    // Construct 21 days where true TDEE = 2500 and intake = 2000 (500 deficit).
    // Expected daily weight loss = 500 / 7700 kg.
    const trueTdee = 2500;
    const intake = 2000;
    const dPerDay = (intake - trueTdee) / 7700;
    let w = 90;
    const logs = Array.from({ length: 21 }, (_, i) => {
      const date = new Date(2025, 0, i + 1);
      const entry = { date, intakeKcal: intake, weightKg: w };
      w += dPerDay;
      return entry;
    });
    const est = estimateMetabolicTwin(logs, 2400);
    expect(est.usesRegression).toBe(true);
    expect(est.computedTdee).toBeGreaterThan(2400);
    expect(est.computedTdee).toBeLessThan(2600);
  });

  it("mifflin-st jeor is in a sane range", () => {
    const tdee = mifflinStJeorTdee({
      sex: "M",
      weightKg: 84,
      heightCm: 178,
      age: 30,
    });
    expect(tdee).toBeGreaterThan(2000);
    expect(tdee).toBeLessThan(3200);
  });
});

describe("churn scoring", () => {
  it("scores a disengaging member as high risk", () => {
    const r = scoreChurn({
      attendanceRatio: 0.2,
      adherence: 0.3,
      responseLatencyNorm: 0.9,
      sentiment: -0.5,
      tenureDays: 30,
    });
    expect(["HIGH", "CRITICAL"]).toContain(r.risk);
    expect(r.suggestion.length).toBeGreaterThan(0);
  });

  it("scores a steady member as low risk", () => {
    const r = scoreChurn({
      attendanceRatio: 1,
      adherence: 0.95,
      responseLatencyNorm: 0.05,
      sentiment: 0.8,
      tenureDays: 200,
    });
    expect(r.risk).toBe("LOW");
  });
});

describe("approval state machine", () => {
  it("allows PENDING_REVIEW → APPROVED", () => {
    expect(canTransitionPlan("PENDING_REVIEW", "APPROVED")).toBe(true);
  });
  it("forbids DRAFT → ACTIVE (must be reviewed)", () => {
    expect(canTransitionPlan("DRAFT", "ACTIVE")).toBe(false);
  });
});

describe("safety guardrails (moat layer 6)", () => {
  it("clamps below the calorie floor", () => {
    const c = enforceCalorieFloor(1100, "M");
    expect(c.violated).toBe(true);
    expect(c.clampedKcal).toBe(1500);
  });
  it("escalates medical + ED phrases", () => {
    expect(screenForSafety("I have chest pain after cardio").mustEscalate).toBe(
      true,
    );
    expect(screenForSafety("I've been purging after meals").mustEscalate).toBe(
      true,
    );
    expect(screenForSafety("what's my plan today?").mustEscalate).toBe(false);
  });
});

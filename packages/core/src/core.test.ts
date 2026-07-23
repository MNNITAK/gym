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

  it("survives realistic day-to-day weight noise", () => {
    // ±0.3kg of overnight water swing is ~2300 kcal of phantom energy between two
    // adjacent readings. Differencing consecutive days drowned in it (7-27% error);
    // fitting the trend must not.
    const trueTdee = 2620;
    const intake = 2140;
    const dPerDay = (intake - trueTdee) / 7700;
    let w = 85;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648 - 0.5;
    };
    const logs = Array.from({ length: 30 }, (_, i) => {
      const entry = {
        date: new Date(2026, 0, i + 1),
        intakeKcal: Math.round(intake + rnd() * 260),
        weightKg: Number((w + rnd() * 0.6).toFixed(1)),
      };
      w += dPerDay;
      return entry;
    });

    const est = estimateMetabolicTwin(logs, 2400);
    expect(est.usesRegression).toBe(true);
    const errorPct = (Math.abs(est.computedTdee - trueTdee) / trueTdee) * 100;
    expect(errorPct).toBeLessThan(3);
  });

  it("stays confident for a member holding steady", () => {
    // No weight trend to fit, so r² is ~0 — but the estimate is excellent and the
    // old r²-based gate wrongly discarded it.
    const logs = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(2026, 0, i + 1),
      intakeKcal: 2400,
      weightKg: 80 + (i % 2 === 0 ? 0.1 : -0.1),
    }));
    const est = estimateMetabolicTwin(logs, 2100);
    expect(est.usesRegression).toBe(true);
    expect(est.computedTdee).toBeGreaterThan(2300);
    expect(est.computedTdee).toBeLessThan(2500);
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

  it("treats neutral sentiment as no signal, not half-risk", () => {
    const neutral = scoreChurn({
      attendanceRatio: 1,
      adherence: 1,
      responseLatencyNorm: 0,
      sentiment: 0,
      tenureDays: 200,
    });
    expect(neutral.contributions.sentiment).toBe(0);
    expect(neutral.risk).toBe("LOW");
  });

  it("never gives alarming advice on a healthy member", () => {
    const r = scoreChurn({
      attendanceRatio: 1,
      adherence: 0.9,
      responseLatencyNorm: 0,
      sentiment: 0,
      tenureDays: 200,
    });
    expect(r.risk).toBe("LOW");
    // The old code named the largest contributor regardless of size, so a healthy
    // member was told their "messages read negative".
    expect(r.suggestion).not.toMatch(/negative|drifting|slipping|quiet/i);
    expect(r.suggestion).toMatch(/steady|engag/i);
  });

  it("still names the real driver when risk is genuine", () => {
    const r = scoreChurn({
      attendanceRatio: 0.1,
      adherence: 0.4,
      responseLatencyNorm: 0.3,
      sentiment: 0,
      tenureDays: 200,
    });
    expect(["MEDIUM", "HIGH", "CRITICAL"]).toContain(r.risk);
    expect(r.suggestion).toMatch(/attendance/i);
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

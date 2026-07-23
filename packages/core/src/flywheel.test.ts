import { describe, it, expect } from "vitest";
import {
  assertNoPii,
  PiiLeakError,
  aggregatePatterns,
  MIN_COHORT_SIZE,
} from "./flywheel.js";

describe("PII safety gate", () => {
  it("passes a clean aggregate", () => {
    expect(() => assertNoPii({ cohort: "diet:mini-cut", successRate: 0.7 })).not.toThrow();
  });
  it("rejects a PII-looking key", () => {
    expect(() => assertNoPii({ memberId: "abc" })).toThrow(PiiLeakError);
  });
  it("rejects a phone/email in a value", () => {
    expect(() => assertNoPii({ note: "call +91 90000 00001" })).toThrow(PiiLeakError);
    expect(() => assertNoPii({ note: "a@b.com" })).toThrow(PiiLeakError);
  });
});

describe("cross-gym aggregation", () => {
  it("drops cohorts below the k-anonymity floor", () => {
    const obs = Array.from({ length: MIN_COHORT_SIZE - 1 }, (_, i) => ({
      cohort: "diet:mini-cut",
      memberId: `m${i}`,
      success: true,
    }));
    expect(aggregatePatterns(obs)).toHaveLength(0);
  });

  it("aggregates a large-enough cohort into a shareable pattern", () => {
    const obs = Array.from({ length: 10 }, (_, i) => ({
      cohort: "diet:mini-cut:goal=lose",
      memberId: `m${i}`,
      success: i < 7, // 70% success
      value: 0.5,
    }));
    const [p] = aggregatePatterns(obs);
    expect(p?.cohortSize).toBe(10);
    expect(p?.successRate).toBe(0.7);
    expect(p?.avgValue).toBe(0.5);
  });

  it("every produced pattern survives the PII gate", () => {
    const obs = Array.from({ length: 6 }, (_, i) => ({
      cohort: "training:ppl",
      memberId: `m${i}`,
      success: true,
    }));
    for (const p of aggregatePatterns(obs)) {
      expect(() => assertNoPii(p)).not.toThrow();
    }
  });
});

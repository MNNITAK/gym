// Tests for the proposal innovations added in the surfacing pass:
// entitlements, craving prediction, life events, the movement library,
// loss-framed renewals, and the decision trace.
import { describe, it, expect } from "vitest";
import {
  tierAllows,
  assertTierAllows,
  requiredTierFor,
  FeatureLockedError,
} from "./entitlements.js";
import { predictCravings, describeCraving } from "./cravings.js";
import { planAroundEvent, activeEvent } from "./events.js";
import {
  matchMovement,
  ladderFor,
  substitutionsFor,
  MOVEMENT_LIBRARY,
} from "./movements.js";
import { buildRenewalNudge } from "./retention.js";
import { DecisionTrace } from "./decisions.js";

describe("subscription entitlements", () => {
  it("Core gets retention only", () => {
    expect(tierAllows("CORE", "retention")).toBe(true);
    expect(tierAllows("CORE", "diet")).toBe(false);
    expect(tierAllows("CORE", "training")).toBe(false);
  });
  it("Pro adds diet but not training", () => {
    expect(tierAllows("PRO", "diet")).toBe(true);
    expect(tierAllows("PRO", "training")).toBe(false);
  });
  it("Elite unlocks everything including the flywheel", () => {
    expect(tierAllows("ELITE", "training")).toBe(true);
    expect(tierAllows("ELITE", "crossGymLearning")).toBe(true);
  });
  it("throws a useful upgrade error", () => {
    expect(() => assertTierAllows("CORE", "training")).toThrow(FeatureLockedError);
    expect(requiredTierFor("training")).toBe("ELITE");
    expect(requiredTierFor("diet")).toBe("PRO");
  });
});

describe("craving prediction", () => {
  const at = (day: number, hour: number) => new Date(2026, 0, day, hour);

  it("ignores a one-off", () => {
    expect(predictCravings([{ at: at(5, 16), text: "craving sugar" }])).toHaveLength(0);
  });

  it("finds a recurring afternoon sugar window", () => {
    const reports = [
      { at: at(5, 16), text: "craving something sweet" },
      { at: at(12, 16), text: "sugar craving again" },
      { at: at(19, 15), text: "want chocolate" },
    ];
    const [p] = predictCravings(reports);
    expect(p?.window).toBe("afternoon");
    expect(p?.craving).toBe("sugar");
    expect(p?.occurrences).toBe(3);
    expect(describeCraving(p!)).toMatch(/afternoon/);
  });

  it("marks a day-specific pattern when it clusters on one weekday", () => {
    // 2026-01-03, -10, -17 are all Saturdays
    const reports = [
      { at: at(3, 23), text: "late night binge" },
      { at: at(10, 23), text: "late night snack" },
      { at: at(17, 23), text: "binge again" },
    ];
    const [p] = predictCravings(reports);
    expect(p?.window).toBe("late_night");
    expect(p?.dayOfWeek).toBe(6); // Saturday
  });

  it("ignores check-ins with no craving language", () => {
    expect(predictCravings([
      { at: at(5, 16), text: "weighed in at 80kg" },
      { at: at(6, 16), text: "good session today" },
    ])).toHaveLength(0);
  });
});

describe("life-aware events", () => {
  const now = new Date(2026, 0, 10);

  it("banks headroom on approach", () => {
    const p = planAroundEvent({ type: "WEDDING", date: new Date(2026, 0, 12) }, now);
    expect(p.phase).toBe("approach");
    expect(p.daysAway).toBe(2);
    expect(p.guidance.length).toBeGreaterThan(0);
  });

  it("switches to damage control on the day", () => {
    const p = planAroundEvent({ type: "WEDDING", date: now }, now);
    expect(p.phase).toBe("event_day");
    expect(p.guidance.join(" ")).toMatch(/protein/i);
  });

  it("runs a return protocol after", () => {
    const p = planAroundEvent({ type: "TRAVEL", date: new Date(2026, 0, 9) }, now);
    expect(p.phase).toBe("recovery");
  });

  it("ignores distant events", () => {
    const p = planAroundEvent({ type: "HOLIDAY", date: new Date(2026, 1, 20) }, now);
    expect(p.phase).toBe("clear");
  });

  it("picks the nearest active event", () => {
    const a = activeEvent(
      [
        { type: "HOLIDAY", date: new Date(2026, 2, 1) },
        { type: "WEDDING", date: new Date(2026, 0, 11) },
      ],
      now,
    );
    expect(a?.type).toBe("WEDDING");
  });
});

describe("movement library", () => {
  it("every movement has cues and mistakes", () => {
    for (const m of MOVEMENT_LIBRARY) {
      expect(m.cues.length).toBeGreaterThan(0);
      expect(m.commonMistakes.length).toBeGreaterThan(0);
    }
  });

  it("ladders run easiest to hardest", () => {
    const squats = ladderFor("squat");
    expect(squats.length).toBeGreaterThan(2);
    for (let i = 1; i < squats.length; i++) {
      expect(squats[i]!.level).toBeGreaterThanOrEqual(squats[i - 1]!.level);
    }
  });

  it("matches a model-written exercise name onto the library", () => {
    expect(matchMovement("Barbell Back Squat")?.slug).toBe("back-squat");
    expect(matchMovement("push-up")?.slug).toBe("push-up");
  });

  it("substitutes a safe movement for an injured knee", () => {
    const subs = substitutionsFor(["knee"]);
    const squat = subs.find((s) => s.avoid.slug === "back-squat");
    expect(squat).toBeDefined();
    expect(squat!.use).toBeDefined();
    expect(squat!.use!.contraindicatedFor).not.toContain("knee");
  });
});

describe("loss-framed renewal nudge", () => {
  it("names what the member would actually lose", () => {
    const n = buildRenewalNudge({
      memberName: "Aarav",
      tier: "GOLD",
      currentStreak: 47,
      longestStreak: 47,
      kgLost: 4,
      daysUntilRenewal: 5,
    });
    expect(n.message).toContain("47-day streak");
    expect(n.message).toContain("Gold");
    expect(n.message).toContain("4kg");
    expect(n.atStake.length).toBeGreaterThan(2);
  });

  it("degrades gracefully for a brand-new member", () => {
    const n = buildRenewalNudge({
      memberName: "Sam",
      tier: "BRONZE",
      currentStreak: 1,
      longestStreak: 1,
      daysUntilRenewal: 0,
      kgLost: null,
    });
    expect(n.message).toContain("today");
    expect(n.atStake.length).toBeGreaterThan(0);
  });
});

describe("decision trace", () => {
  it("surfaces overrides before context", () => {
    const t = new DecisionTrace()
      .info("protocol", "Protocol", "mini-cut selected")
      .enforced("safety", "Calorie floor", "held at 1500")
      .applied("memory", "Vegetarian", "no meat used");
    const order = t.toArray().map((d) => d.severity);
    expect(order[0]).toBe("enforced");
    expect(order.at(-1)).toBe("info");
  });
});

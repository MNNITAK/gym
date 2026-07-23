import { describe, it, expect } from "vitest";
import { buildDayPlan, nextTask, mealTime, sessionTime, DEFAULT_TRAINING_TIME } from "./schedule.js";

const MEALS = [
  { name: "Breakfast", items: ["3 eggs", "oats"] },
  { name: "Lunch", items: ["dal", "2 rotis"] },
  { name: "Post-workout", items: ["whey", "banana"] },
  { name: "Dinner", items: ["paneer", "salad"] },
];

const SESSION = { day: "Mon", focus: "Push", intensity: "moderate", exercises: [1, 2, 3, 4] };

describe("slot derivation", () => {
  it("prefers the plan's own time over the name", () => {
    expect(mealTime({ name: "Dinner", time: "9:15" }, 0, 1)).toBe("09:15");
  });

  it("falls back to the meal name when no time was generated", () => {
    expect(mealTime({ name: "Breakfast" }, 0, 3)).toBe("08:00");
    expect(mealTime({ name: "Post-workout shake" }, 1, 3)).toBe("19:30");
  });

  it("spreads unnamed meals across the waking day", () => {
    const times = [0, 1, 2].map((i) => mealTime({ name: `Meal ${i + 1}` }, i, 3));
    expect(times).toEqual(["08:00", "14:30", "21:00"]);
  });

  it("uses the member's preferred training time before the default", () => {
    expect(sessionTime({}, "06:30")).toBe("06:30");
    expect(sessionTime({}, null)).toBe(DEFAULT_TRAINING_TIME);
    expect(sessionTime({ time: "07:00" }, "06:30")).toBe("07:00");
  });

  // Observed: asked for a session "time", the model answered with the session
  // *duration* — "00:45" — which parses as a clock time and sorts the workout
  // before breakfast. Anything before 04:00 is not a training time.
  it("rejects a duration returned in place of a clock time", () => {
    expect(sessionTime({ time: "00:45" }, "06:30")).toBe("06:30");
    expect(sessionTime({ time: "01:30" }, null)).toBe(DEFAULT_TRAINING_TIME);
    expect(mealTime({ name: "Dinner", time: "00:20" }, 0, 1)).toBe("20:30");
  });
});

describe("buildDayPlan", () => {
  it("returns the day in chronological order", () => {
    const tasks = buildDayPlan({ meals: MEALS, session: SESSION, preferredTrainingTime: "18:00" });
    const times = tasks.map((t) => t.time);
    expect([...times].sort()).toEqual(times);
    expect(tasks[0]!.kind).toBe("WEIGH_IN");
    expect(tasks.filter((t) => t.kind === "SESSION")).toHaveLength(1);
  });

  it("places the session at the preferred time, between the right meals", () => {
    const tasks = buildDayPlan({ meals: MEALS, session: SESSION, preferredTrainingTime: "18:00" });
    const order = tasks.map((t) => t.title);
    expect(order.indexOf("Lunch")).toBeLessThan(order.indexOf("Push"));
    expect(order.indexOf("Push")).toBeLessThan(order.indexOf("Post-workout"));
  });

  it("marks tasks done from real log ids, not a parallel store", () => {
    const ids = buildDayPlan({ meals: MEALS }).map((t) => t.id);
    const tasks = buildDayPlan({
      meals: MEALS,
      weighedToday: true,
      completedIds: [ids[1]!],
    });
    expect(tasks.find((t) => t.kind === "WEIGH_IN")!.done).toBe(true);
    expect(tasks.filter((t) => t.done)).toHaveLength(2);
  });

  it("omits the session on a rest day", () => {
    const tasks = buildDayPlan({ meals: MEALS, session: { day: "Sun", focus: "Rest", exercises: [] } });
    expect(tasks.some((t) => t.kind === "SESSION")).toBe(false);
  });

  it("still produces a day when there is no plan yet", () => {
    expect(buildDayPlan({})).toHaveLength(1);
  });
});

describe("nextTask", () => {
  const tasks = buildDayPlan({ meals: MEALS, session: SESSION, preferredTrainingTime: "18:00" });

  it("is the next undone task by clock time", () => {
    const at = (h: number, m = 0) => new Date(2026, 0, 5, h, m);
    expect(nextTask(tasks, at(6))!.kind).toBe("WEIGH_IN");
    expect(nextTask(tasks, at(12))!.title).toBe("Lunch");
  });

  it("skips completed tasks", () => {
    const done = tasks.map((t) => (t.time <= "13:30" ? { ...t, done: true } : t));
    // "HH:MM" is lexicographically ordered, so a string compare is a time compare.
    expect(nextTask(done, new Date(2026, 0, 5, 9))!.time > "13:30").toBe(true);
  });

  it("falls back to the earliest outstanding task late in the day", () => {
    expect(nextTask(tasks, new Date(2026, 0, 5, 23, 30))!.kind).toBe("WEIGH_IN");
  });

  it("returns null once the day is complete", () => {
    expect(nextTask(tasks.map((t) => ({ ...t, done: true })))).toBeNull();
  });
});

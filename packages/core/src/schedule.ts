// ── Turning a plan into a day ────────────────────────────────────────────────
// A plan is a set of meals and a session; a *day* is those things at times, in
// order, each either done or not. These helpers do the derivation so the server
// and the UI agree on what "today" looks like.

export const DEFAULT_TRAINING_TIME = "18:00";

/**
 * Meal slots by name. Plans generated before meals carried a `time` still need
 * to land somewhere sensible, and models name meals predictably.
 */
const MEAL_SLOTS: Array<{ re: RegExp; time: string }> = [
  { re: /pre[- ]?workout/i, time: "17:00" },
  { re: /post[- ]?workout|after (the )?workout|recovery/i, time: "19:30" },
  { re: /breakfast|morning meal/i, time: "08:00" },
  { re: /mid[- ]?morning|elevenses/i, time: "11:00" },
  { re: /brunch/i, time: "10:30" },
  { re: /lunch|midday/i, time: "13:30" },
  { re: /afternoon|tea|evening snack/i, time: "16:30" },
  { re: /dinner|supper/i, time: "20:30" },
  { re: /supper|bed ?time|late/i, time: "22:00" },
  { re: /snack/i, time: "16:30" },
];

/** Evenly spread meals across the waking day when the name gives nothing away. */
function fallbackSlot(index: number, total: number): string {
  const startMin = 8 * 60;
  const endMin = 21 * 60;
  const step = total > 1 ? (endMin - startMin) / (total - 1) : 0;
  return minutesToHhmm(Math.round(startMin + step * index));
}

/**
 * A generated "time" is only usable if it's a well-formed clock time inside the
 * waking day. Models asked for a session time will sometimes answer with the
 * session *duration* ("00:45"), which parses fine and then sorts the workout
 * before breakfast — so anything before 04:00 is treated as not-a-time.
 */
const EARLIEST_PLAUSIBLE_MIN = 4 * 60;

function usableTime(value?: string | null): string | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const padded = pad(value);
  const mins = minutesOfDay(padded);
  if (mins < EARLIEST_PLAUSIBLE_MIN || mins > 23 * 60 + 59) return null;
  return padded;
}

/** The time a meal belongs at: its own, else its name, else an even spread. */
export function mealTime(
  meal: { name: string; time?: string | null },
  index: number,
  total: number,
): string {
  const own = usableTime(meal.time);
  if (own) return own;
  const named = MEAL_SLOTS.find((s) => s.re.test(meal.name));
  return named ? named.time : fallbackSlot(index, total);
}

export function sessionTime(
  day: { time?: string | null },
  preferred?: string | null,
): string {
  return usableTime(day.time) ?? usableTime(preferred) ?? DEFAULT_TRAINING_TIME;
}

export const minutesOfDay = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function minutesToHhmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function pad(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${String(h).padStart(2, "0")}:${m}`;
}

/** Sort anything carrying a "HH:MM" into chronological order. */
export function byTime<T extends { time: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));
}

// ── The day as an ordered list of tasks ──────────────────────────────────────
// The plan screens answer "what am I eating this week"; the Today screen has to
// answer "what do I do next". Same plan, different question — so this derives a
// single ordered task list, and completing a task writes the *real* log rather
// than a parallel completion record.

export type DayTaskKind = "MEAL" | "SESSION" | "WEIGH_IN";

export interface DayTask {
  /** Stable within a day, so a completion can be matched back to the task. */
  id: string;
  kind: DayTaskKind;
  time: string;
  title: string;
  detail: string;
  /** The log this task writes when the member ticks it off. */
  logType: "INTAKE" | "WORKOUT" | "WEIGHT";
  done: boolean;
}

export interface DayPlanInput {
  meals?: Array<{ name: string; items: unknown[]; time?: string | null }> | null;
  session?: {
    day: string;
    focus: string;
    intensity?: string;
    exercises?: unknown[];
    time?: string | null;
  } | null;
  preferredTrainingTime?: string | null;
  /** Whether the member has already weighed in today. */
  weighedToday?: boolean;
  /** Task ids already completed today, derived from today's logs. */
  completedIds?: string[];
}

/** A meal's task id — deterministic from its position and name. */
export function mealTaskId(index: number, name: string): string {
  return `meal:${index}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/**
 * Build the ordered day: weigh-in first thing, then meals and the session
 * interleaved by time. Tasks with no explicit time fall back to `mealTime` /
 * `sessionTime`, so plans generated before times existed still lay out sensibly.
 */
export function buildDayPlan(input: DayPlanInput): DayTask[] {
  const done = new Set(input.completedIds ?? []);
  const tasks: DayTask[] = [];

  tasks.push({
    id: "weigh-in",
    kind: "WEIGH_IN",
    time: "07:00",
    title: "Morning weigh-in",
    detail: "Same time, same conditions — it's the trend that matters.",
    logType: "WEIGHT",
    done: !!input.weighedToday,
  });

  const meals = input.meals ?? [];
  meals.forEach((m, i) => {
    const id = mealTaskId(i, m.name);
    tasks.push({
      id,
      kind: "MEAL",
      time: mealTime(m, i, meals.length),
      title: m.name,
      detail: m.items.map(String).join(" · "),
      logType: "INTAKE",
      done: done.has(id),
    });
  });

  if (input.session && (input.session.exercises?.length ?? 0) > 0) {
    tasks.push({
      id: "session",
      kind: "SESSION",
      time: sessionTime(input.session, input.preferredTrainingTime),
      title: input.session.focus,
      detail: `${input.session.exercises!.length} exercises${
        input.session.intensity ? ` · ${input.session.intensity}` : ""
      }`,
      logType: "WORKOUT",
      done: done.has("session"),
    });
  }

  return byTime(tasks);
}

/** The task the member should be looking at right now: next undone by time. */
export function nextTask(tasks: DayTask[], now = new Date()): DayTask | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  const pending = tasks.filter((t) => !t.done);
  return pending.find((t) => minutesOfDay(t.time) >= mins) ?? pending[0] ?? null;
}

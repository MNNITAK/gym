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

/** The time a meal belongs at: its own, else its name, else an even spread. */
export function mealTime(
  meal: { name: string; time?: string | null },
  index: number,
  total: number,
): string {
  if (meal.time && /^\d{1,2}:\d{2}$/.test(meal.time)) return pad(meal.time);
  const named = MEAL_SLOTS.find((s) => s.re.test(meal.name));
  return named ? named.time : fallbackSlot(index, total);
}

export function sessionTime(
  day: { time?: string | null },
  preferred?: string | null,
): string {
  if (day.time && /^\d{1,2}:\d{2}$/.test(day.time)) return pad(day.time);
  if (preferred && /^\d{1,2}:\d{2}$/.test(preferred)) return pad(preferred);
  return DEFAULT_TRAINING_TIME;
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

// ── Craving prediction (Diet INNOV 06) ───────────────────────────────────────
// Most diet failure isn't willpower, it's ambush cravings. Learn each member's
// craving pattern from their own check-ins, then pre-empt with meal timing and
// satiety-boosted portions on those days. Deterministic and testable.

export interface CravingReport {
  /** when the member reported the craving */
  at: Date;
  /** the raw check-in text (used to classify what they craved) */
  text: string;
}

export type CravingWindow = "morning" | "afternoon" | "evening" | "late_night";

export interface CravingPattern {
  window: CravingWindow;
  /** 0=Sun … 6=Sat, or null when the pattern isn't day-specific */
  dayOfWeek: number | null;
  occurrences: number;
  /** 0..1 — share of this member's cravings that land here */
  share: number;
  /** what they tend to crave, e.g. "sugar" */
  craving: string;
  /** the pre-emptive move for this window */
  strategy: string;
}

const CRAVING_WORDS =
  /crav|hungry|hunger|snack|sugar|sweet|chocolate|biscuit|chips|binge|cheat|tempt/i;

const CRAVING_TYPES: Array<{ re: RegExp; label: string }> = [
  { re: /sugar|sweet|chocolate|dessert|mithai|ice ?cream/i, label: "sugar" },
  { re: /chips|namkeen|savour|savory|salty|fried|samosa/i, label: "salty/fried" },
  { re: /carb|rice|roti|bread|pasta|noodle/i, label: "carbs" },
];

export const CRAVING_MIN_OCCURRENCES = 2;

function windowFor(d: Date): CravingWindow {
  const h = d.getHours();
  if (h < 11) return "morning";
  if (h < 17) return "afternoon";
  if (h < 22) return "evening";
  return "late_night";
}

const STRATEGY: Record<CravingWindow, string> = {
  morning: "front-load protein at breakfast to blunt the mid-morning dip",
  afternoon: "schedule a high-protein, high-fibre snack just before the window",
  evening: "shift more of the day's carbs into the evening meal for satiety",
  late_night: "leave a planned high-volume, low-calorie option for after dinner",
};

/**
 * Learn a member's craving windows from their check-ins. Returns only patterns
 * that recur (a single bad Tuesday isn't a pattern), strongest first.
 */
export function predictCravings(reports: CravingReport[]): CravingPattern[] {
  const relevant = reports.filter((r) => CRAVING_WORDS.test(r.text));
  if (relevant.length === 0) return [];

  const buckets = new Map<CravingWindow, { count: number; days: number[]; types: string[] }>();
  for (const r of relevant) {
    const w = windowFor(r.at);
    const b = buckets.get(w) ?? { count: 0, days: [], types: [] };
    b.count += 1;
    b.days.push(r.at.getDay());
    const type = CRAVING_TYPES.find((t) => t.re.test(r.text))?.label;
    if (type) b.types.push(type);
    buckets.set(w, b);
  }

  const out: CravingPattern[] = [];
  for (const [window, b] of buckets) {
    if (b.count < CRAVING_MIN_OCCURRENCES) continue;
    // Day-specific only when most reports land on the same weekday.
    const dayCounts = new Map<number, number>();
    for (const d of b.days) dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
    const [topDay, topDayCount] = [...dayCounts.entries()].sort((a, z) => z[1] - a[1])[0]!;
    const dayOfWeek = topDayCount / b.count >= 0.6 ? topDay : null;

    const typeCounts = new Map<string, number>();
    for (const t of b.types) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    const craving = [...typeCounts.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? "food";

    out.push({
      window,
      dayOfWeek,
      occurrences: b.count,
      share: Math.round((b.count / relevant.length) * 100) / 100,
      craving,
      strategy: STRATEGY[window],
    });
  }

  return out.sort((a, b) => b.occurrences - a.occurrences);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Human sentence for the coach-facing decision trace. */
export function describeCraving(p: CravingPattern): string {
  const when = p.dayOfWeek != null ? `${DAY_NAMES[p.dayOfWeek]} ${p.window}` : `${p.window}`;
  return `Craves ${p.craving} in the ${when.replace("_", " ")} (${p.occurrences}× logged) — ${p.strategy}.`;
}

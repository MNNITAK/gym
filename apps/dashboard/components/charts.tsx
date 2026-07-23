"use client";

/* ============================================================================
   KEYSTONE data visualisation — calendars and heatmaps.
   ----------------------------------------------------------------------------
   Consistency is the product's core promise, and a red-on-black intensity
   grid is its most honest picture: every cell is a day, and the red is
   earned. Both components are pure presentation — they take data, they never
   fetch it.
   ========================================================================= */

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/* ── Activity heatmap ──────────────────────────────────────────────────────
   GitHub-style: columns are weeks, rows are weekdays, intensity 0–3.
   0 = nothing, 1 = logged something, 2 = checked in, 3 = trained.           */

const HEAT_CELL: Record<number, string> = {
  0: "bg-neutral-100",
  1: "bg-primary/25",
  2: "bg-primary/55",
  3: "bg-primary",
};

export function Heatmap({
  values,
  weeks = 12,
  endDate = new Date(),
}: {
  /** dateKey → intensity 0–3 */
  values: Record<string, number>;
  weeks?: number;
  endDate?: Date;
}) {
  // Build columns back from the current week so "now" is the rightmost cell.
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const lastSaturday = new Date(end);
  lastSaturday.setDate(end.getDate() + (6 - end.getDay()));

  const cols: Array<Array<{ key: string; level: number; future: boolean }>> = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col: Array<{ key: string; level: number; future: boolean }> = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(lastSaturday);
      day.setDate(lastSaturday.getDate() - w * 7 - (6 - d));
      const key = dateKey(day);
      col.push({
        key,
        level: Math.max(0, Math.min(3, values[key] ?? 0)),
        future: day.getTime() > end.getTime(),
      });
    }
    cols.push(col);
  }

  const active = Object.values(values).filter((v) => v > 0).length;

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="img" aria-label={`Activity heatmap, ${active} active days in the last ${weeks} weeks`}>
        {/* Weekday guide */}
        <div className="mr-0.5 grid shrink-0 grid-rows-7 gap-1">
          {DAY_LETTERS.map((l, i) => (
            <span key={i} className="flex h-3 w-3 items-center justify-center font-mono text-[7px] text-neutral-400">
              {i % 2 === 1 ? l : ""}
            </span>
          ))}
        </div>
        {cols.map((col, i) => (
          <div key={i} className="grid shrink-0 grid-rows-7 gap-1">
            {col.map((c) => (
              <span
                key={c.key}
                title={c.key}
                className={`h-3 w-3 rounded-[3px] ${c.future ? "opacity-0" : HEAT_CELL[c.level]}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 font-mono text-[9px] text-neutral-400">
        Less
        {[0, 1, 2, 3].map((l) => (
          <span key={l} className={`h-2.5 w-2.5 rounded-[3px] ${HEAT_CELL[l]}`} />
        ))}
        More
      </div>
    </div>
  );
}

/* ── Week strip ────────────────────────────────────────────────────────────
   The current week as seven cells, today ringed in red. Give it `marked`
   date-keys (days already trained/logged) to fill the dots.                 */

export function WeekStrip({
  marked = {},
  today = new Date(),
}: {
  /** dateKey → true when the day has activity */
  marked?: Record<string, boolean | number>;
  today?: Date;
}) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const todayKey = dateKey(today);

  return (
    <div className="grid grid-cols-7 gap-1.5" role="img" aria-label="This week">
      {days.map((d) => {
        const key = dateKey(d);
        const isToday = key === todayKey;
        const done = !!marked[key];
        return (
          <div
            key={key}
            className={`flex flex-col items-center gap-0.5 rounded-lg border py-1.5 ${
              isToday
                ? "border-primary bg-primary-subtle"
                : "border-neutral-200 bg-surface"
            }`}
          >
            <span className="font-mono text-[8px] uppercase text-neutral-400">
              {DAY_LETTERS[d.getDay()]}
            </span>
            <span className={`text-xs font-extrabold tabular ${isToday ? "text-brand" : ""}`}>
              {d.getDate()}
            </span>
            <span
              className={`h-1 w-1 rounded-full ${
                done ? "bg-primary" : isToday ? "bg-primary/30" : "bg-neutral-200"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

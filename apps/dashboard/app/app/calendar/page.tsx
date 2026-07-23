"use client";

import { useCallback, useEffect, useState } from "react";
import { meApi } from "../../../lib/member-api";
import { MemberShell, MCard, MError, useMemberAuth } from "../../../components/member-ui";
import { Check, Dumbbell, Scale } from "lucide-react";

interface DayCell {
  checkedIn: boolean;
  trained: boolean;
  logged: boolean;
  weightKg: number | null;
}
interface CalendarData {
  month: string;
  monthLabel: string;
  firstWeekday: number;
  daysInMonth: number;
  monthsBack: number;
  days: Record<string, DayCell>;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function CalendarPage() {
  const ready = useMemberAuth();
  const [back, setBack] = useState(0);
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (b: number) => {
    try {
      setData(await meApi<CalendarData>(`/calendar?back=${b}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load(back);
  }, [ready, back, load]);

  if (!ready) return null;

  const cells: Array<{ day: number; key: string; cell?: DayCell } | null> = [];
  if (data) {
    for (let i = 0; i < data.firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= data.daysInMonth; d++) {
      const key = `${data.month}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, key, cell: data.days[key] });
    }
  }

  const activeDays = Object.values(data?.days ?? {}).filter((d) => d.checkedIn || d.logged).length;
  const trainedDays = Object.values(data?.days ?? {}).filter((d) => d.trained).length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const sel = selected ? data?.days[selected] : undefined;

  return (
    <MemberShell title="Calendar" subtitle="Every day you showed up.">
      <MError error={error} />

      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setBack((b) => Math.min(6, b + 1))}
          className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold"
        >
          ← Earlier
        </button>
        <p className="text-sm font-bold">{data?.monthLabel ?? "…"}</p>
        <button
          onClick={() => setBack((b) => Math.max(0, b - 1))}
          disabled={back === 0}
          className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          Later →
        </button>
      </div>

      <MCard>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="pb-1 text-center font-mono text-[9px] text-neutral-400">
              {w}
            </div>
          ))}
          {cells.map((c, i) =>
            c ? (
              <button
                key={c.key}
                onClick={() => setSelected(selected === c.key ? null : c.key)}
                className={`aspect-square rounded-lg text-xs font-semibold transition ${
                  c.cell?.trained
                    ? "bg-primary text-on-primary"
                    : c.cell?.checkedIn
                      ? "bg-primary/30 text-brand"
                      : c.cell?.logged
                        ? "bg-neutral-100 text-neutral-600"
                        : "text-neutral-300"
                } ${c.key === todayKey ? "ring-2 ring-ink" : ""} ${
                  selected === c.key ? "scale-95" : ""
                }`}
              >
                {c.day}
              </button>
            ) : (
              <div key={`pad-${i}`} />
            ),
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 border-t border-neutral-100 pt-3">
          <Legend className="bg-primary" label="Trained" />
          <Legend className="bg-primary/30" label="Checked in" />
          <Legend className="bg-neutral-200" label="Logged something" />
        </div>
      </MCard>

      {selected && (
        <MCard className="mt-3">
          <p className="text-sm font-bold">
            {new Date(selected).toDateString().slice(0, 15)}
          </p>
          {sel ? (
            <div className="mt-1 space-y-0.5 text-xs text-neutral-600">
              {sel.checkedIn && <p className="flex items-center gap-1"><Check size={12} className="text-diet" /> Checked in</p>}
              {sel.trained && <p className="flex items-center gap-1"><Dumbbell size={12} className="text-brand" /> Trained</p>}
              {sel.weightKg != null && <p className="flex items-center gap-1"><Scale size={12} className="text-neutral-400" /> Weighed {sel.weightKg}kg</p>}
              {!sel.checkedIn && !sel.trained && sel.logged && <p>Logged something</p>}
            </div>
          ) : (
            <p className="mt-1 text-xs text-neutral-400">Nothing recorded.</p>
          )}
        </MCard>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MCard>
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Active days
          </p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">{activeDays}</p>
        </MCard>
        <MCard>
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Sessions
          </p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-brand">{trainedDays}</p>
        </MCard>
      </div>
    </MemberShell>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
      <span className={`inline-block h-2.5 w-2.5 rounded ${className}`} />
      {label}
    </span>
  );
}

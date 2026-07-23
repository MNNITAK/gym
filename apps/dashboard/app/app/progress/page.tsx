"use client";

import { useCallback, useEffect, useState } from "react";
import { meApi } from "../../../lib/member-api";
import { MemberShell, MCard, MLabel, MError, useMemberAuth } from "../../../components/member-ui";
import { Check, Flame, Trophy } from "lucide-react";
import { Heatmap } from "../../../components/charts";

interface Progress {
  weightSeries: Array<{ date: string; weightKg: number }>;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  changeKg: number | null;
  milestones: Array<{ id: string; title: string; type: string; at: string }>;
  twin: { tdee: number; formulaTdee: number | null; usesRegression: boolean; confidence: number; sampleDays: number } | null;
  streak: { current: number; longest: number };
  tier: { current: string; perks: string[]; next: string | null; nextPerks: string[] };
  adherence14d: number;
  engagement: string | null;
}

interface CalMonth {
  days: Record<string, { checkedIn: boolean; trained: boolean; logged: boolean }>;
}

export default function ProgressPage() {
  const ready = useMemberAuth();
  const [d, setD] = useState<Progress | null>(null);
  const [heat, setHeat] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await meApi<Progress>("/progress"));
    } catch (e) {
      setError((e as Error).message);
    }
    // The heatmap reuses the calendar months — three fetches cover 12 weeks.
    // Best-effort: the page is complete without it.
    try {
      const months = await Promise.all(
        [0, 1, 2].map((b) => meApi<CalMonth>(`/calendar?back=${b}`)),
      );
      const merged: Record<string, number> = {};
      for (const m of months) {
        for (const [key, day] of Object.entries(m.days)) {
          merged[key] = day.trained ? 3 : day.checkedIn ? 2 : day.logged ? 1 : 0;
        }
      }
      setHeat(merged);
    } catch {
      /* heatmap is optional */
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return null;

  return (
    <MemberShell title="Your progress" subtitle="The numbers, honestly.">
      <MError error={error} />

      {/* Weight */}
      <MCard>
        <MLabel>Weight</MLabel>
        <div className="mt-1 flex items-baseline gap-3">
          <p className="text-4xl font-extrabold tracking-tight">
            {d?.currentWeightKg ?? "—"}
            <span className="ml-1 text-sm font-normal text-neutral-500">kg</span>
          </p>
          {d?.changeKg != null && d.changeKg !== 0 && (
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                d.changeKg < 0 ? "bg-diet/10 text-diet" : "bg-work/10 text-work"
              }`}
            >
              {d.changeKg > 0 ? "+" : ""}
              {d.changeKg}kg
            </span>
          )}
        </div>
        {d?.startWeightKg != null && (
          <p className="mt-1 text-xs text-neutral-500">Started at {d.startWeightKg}kg</p>
        )}
        <Sparkline points={d?.weightSeries ?? []} />
      </MCard>

      {/* Metabolic twin — the "this is yours, not a calculator" moment */}
      <MCard className="mt-3 border-diet/30 bg-diet/5">
        <MLabel>Your metabolism</MLabel>
        {d?.twin ? (
          <>
            <p className="mt-1 text-3xl font-extrabold tracking-tight">
              {d.twin.tdee}
              <span className="ml-1 text-sm font-normal text-neutral-500">kcal/day</span>
            </p>
            {d.twin.usesRegression ? (
              <p className="mt-1 text-xs text-neutral-600">
                Measured from <strong>your own</strong> logged data over {d.twin.sampleDays} days
                ({Math.round(d.twin.confidence * 100)}% confidence)
                {d.twin.formulaTdee ? (
                  <> — a generic calculator would have said {d.twin.formulaTdee}.</>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-xs text-neutral-600">
                Currently a population estimate. Log your weight and food daily for two weeks and
                this becomes <em>your</em> number.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-neutral-400">Not enough data yet — keep logging.</p>
        )}
      </MCard>

      {/* Consistency — every day, drawn. The red is earned. */}
      <MCard className="mt-3">
        <div className="flex items-baseline justify-between">
          <MLabel>Last 12 weeks</MLabel>
          <span className="font-mono text-[10px] text-neutral-400">
            {Object.values(heat).filter((v) => v > 0).length} active days
          </span>
        </div>
        <div className="mt-3">
          <Heatmap values={heat} weeks={12} />
        </div>
      </MCard>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <MCard>
          <MLabel>Streak</MLabel>
          <p className="mt-1 inline-flex items-center gap-1.5 text-3xl font-extrabold tracking-tight"><Flame size={24} className="text-brand" /> {d?.streak.current ?? 0}</p>
          <p className="text-xs text-neutral-500">Best: {d?.streak.longest ?? 0} days</p>
        </MCard>
        <MCard>
          <MLabel>Last 14 days</MLabel>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">{d?.adherence14d ?? 0}%</p>
          <p className="text-xs text-neutral-500">days you checked in</p>
        </MCard>
      </div>

      {/* Tier ladder */}
      <MCard className="mt-3">
        <MLabel>Your tier</MLabel>
        <p className="mt-1 text-xl font-extrabold tracking-tight">{d?.tier.current ?? "—"}</p>
        <ul className="mt-1 space-y-0.5">
          {(d?.tier.perks ?? []).map((p, i) => (
            <li key={i} className="flex items-start gap-1 text-xs text-neutral-600"><Check size={12} className="mt-0.5 shrink-0 text-diet" /> {p}</li>
          ))}
        </ul>
        {d?.tier.next && (
          <div className="mt-3 rounded-xl bg-neutral-50 p-3">
            <p className="text-xs font-bold">Next: {d.tier.next}</p>
            <ul className="mt-1 space-y-0.5">
              {d.tier.nextPerks.slice(0, 2).map((p, i) => (
                <li key={i} className="text-xs text-neutral-500">→ {p}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              Keep your streak and check-ins going to get there.
            </p>
          </div>
        )}
      </MCard>

      {/* Wins */}
      <section className="mt-5">
        <MLabel>Your wins</MLabel>
        <div className="mt-2 space-y-2">
          {(d?.milestones.length ?? 0) === 0 && (
            <p className="text-sm text-neutral-400">
              No milestones yet — they show up here as you hit them.
            </p>
          )}
          {d?.milestones.map((m) => (
            <MCard key={m.id}>
              <p className="inline-flex items-center gap-1.5 text-sm font-bold"><Trophy size={14} className="text-caution-text" /> {m.title}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                {m.type.replace(/_/g, " ")}
              </p>
            </MCard>
          ))}
        </div>
      </section>
    </MemberShell>
  );
}

/** Tiny inline weight trend — no chart library, just the shape of the journey. */
function Sparkline({ points }: { points: Array<{ date: string; weightKg: number }> }) {
  if (points.length < 2) return null;
  const w = 300;
  const h = 60;
  const vals = points.map((p) => p.weightKg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.weightKg - min) / span) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = points[points.length - 1]!;
  const lx = w;
  const ly = h - ((last.weightKg - min) / span) * (h - 8) - 4;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full overflow-visible" role="img" aria-label="Weight trend">
      {/* Soft glow under the line, then the line, then the lit endpoint. */}
      <path d={d} fill="none" className="stroke-[rgb(var(--ks-brand))]" opacity="0.25" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" className="stroke-[rgb(var(--ks-brand))]" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="4.5" className="fill-[rgb(var(--ks-brand))]" opacity="0.3" />
      <circle cx={lx} cy={ly} r="2.5" className="fill-[rgb(var(--ks-brand))]" />
    </svg>
  );
}

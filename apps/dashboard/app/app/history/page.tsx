"use client";

import { useCallback, useEffect, useState } from "react";
import { meApi } from "../../../lib/member-api";
import { Scale } from "lucide-react";
import {
  MemberShell,
  MCard,
  MLabel,
  MError,
  useMemberAuth,
} from "../../../components/member-ui";

interface PastPlan {
  id: string;
  type: "DIET" | "TRAINING";
  status: string;
  rationale: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
}
interface PastCheckin {
  forDay: string;
  summary: string | null;
  band: string;
  weightKg: number | null;
}

const BAND_TONE: Record<string, string> = {
  green: "bg-diet/10 text-diet",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-energy/10 text-energy",
};

export default function HistoryPage() {
  const ready = useMemberAuth();
  const [tab, setTab] = useState<"plans" | "checkins">("plans");
  const [plans, setPlans] = useState<PastPlan[]>([]);
  const [checkins, setCheckins] = useState<PastCheckin[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await meApi<{ plans: PastPlan[]; checkins: PastCheckin[] }>("/history");
      setPlans(res.plans);
      setCheckins(res.checkins);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return null;

  return (
    <MemberShell title="History" subtitle="Everything you've been given, and how you felt.">
      <MError error={error} />

      <div className="mb-4 flex gap-2">
        {(["plans", "checkins"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === t ? "bg-ink text-white" : "border border-neutral-300 text-neutral-600"
            }`}
          >
            {t === "plans" ? `Plans (${plans.length})` : `Check-ins (${checkins.length})`}
          </button>
        ))}
      </div>

      {tab === "plans" && (
        <div className="space-y-2">
          {plans.length === 0 && <p className="text-sm text-neutral-400">No plans yet.</p>}
          {plans.map((p) => (
            <MCard key={p.id}>
              <button
                onClick={() => setOpen(open === p.id ? null : p.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                      p.type === "DIET" ? "bg-diet/10 text-diet" : "bg-work/10 text-work"
                    }`}
                  >
                    {p.type}
                  </span>
                  <span className="font-mono text-[10px] text-neutral-400">
                    {new Date(p.createdAt).toDateString().slice(4, 10)} · {p.status}
                  </span>
                </div>
                {p.rationale && (
                  <p className="mt-1.5 text-sm text-neutral-700">{p.rationale}</p>
                )}
              </button>

              {open === p.id && <PlanBody plan={p} />}
            </MCard>
          ))}
        </div>
      )}

      {tab === "checkins" && (
        <div className="space-y-2">
          {checkins.length === 0 && (
            <p className="text-sm text-neutral-400">No check-ins recorded yet.</p>
          )}
          {checkins.map((c) => (
            <MCard key={c.forDay}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">
                  {new Date(c.forDay).toDateString().slice(0, 10)}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                    BAND_TONE[c.band] ?? ""
                  }`}
                >
                  {c.band.toUpperCase()}
                </span>
              </div>
              {c.summary && <p className="mt-1 text-xs text-neutral-600">{c.summary}</p>}
              {c.weightKg != null && (
                <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-neutral-400"><Scale size={10} /> {c.weightKg}kg</p>
              )}
            </MCard>
          ))}
        </div>
      )}
    </MemberShell>
  );
}

/** Reuses the same shapes the live Diet and Training screens render. */
function PlanBody({ plan }: { plan: PastPlan }) {
  if (plan.type === "DIET") {
    const t = plan.payload.dailyTargets as { kcal?: number; proteinG?: number } | undefined;
    const meals = (plan.payload.meals ?? []) as Array<{ name?: string; items?: unknown[] }>;
    return (
      <div className="mt-3 border-t border-neutral-100 pt-3">
        {t && (
          <p className="text-sm">
            <strong>{t.kcal}</strong> kcal · {t.proteinG}g protein
          </p>
        )}
        {meals.map((m, i) => (
          <div key={i} className="mt-2">
            <p className="text-xs font-bold">{m.name}</p>
            {(m.items ?? []).map((it, j) => (
              <p key={j} className="text-xs text-neutral-600">• {String(it)}</p>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const week = (plan.payload.week ?? []) as Array<{
    day?: string;
    focus?: string;
    exercises?: Array<{ name?: string; sets?: number; reps?: string }>;
  }>;
  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      {plan.payload.deload ? (
        <p className="mb-2 text-xs font-bold text-energy">Deload week</p>
      ) : null}
      {week.map((d, i) => (
        <div key={i} className="mt-2">
          <p className="text-xs font-bold">
            {d.day} — {d.focus}
          </p>
          {(d.exercises ?? []).map((e, j) => (
            <p key={j} className="text-xs text-neutral-600">
              • {e.name}: {e.sets}×{e.reps}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

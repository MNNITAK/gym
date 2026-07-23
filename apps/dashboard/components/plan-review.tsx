"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui";
import { WhyPanel, type EngineDecision } from "./why-panel";

export interface PlanRevision {
  role: "COACH" | "AI";
  text: string;
}

export interface ReviewablePlan {
  id: string;
  type: "DIET" | "TRAINING";
  version?: number;
  payload: Record<string, unknown>;
  revisions?: PlanRevision[] | null;
  stateSnapshot?: { decisions?: EngineDecision[] } | null;
}

/**
 * Coach review surface for a drafted plan: a readable render of what the member
 * would receive, plus a chat with the AI to revise it before it is approved.
 */
export function PlanReview({
  plan,
  onRevised,
}: {
  plan: ReviewablePlan;
  onRevised: () => void | Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const thread = plan.revisions ?? [];

  async function send() {
    const text = instruction.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/plans/${plan.id}/revise`, {
        method: "POST",
        body: JSON.stringify({ instruction: text }),
      });
      setInstruction("");
      await onRevised();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-neutral-100 pt-4">
      {plan.type === "DIET" ? (
        <DietRender payload={plan.payload} />
      ) : (
        <TrainingRender payload={plan.payload} />
      )}

      {/* The intelligence, made visible */}
      <div className="mt-4">
        <WhyPanel decisions={plan.stateSnapshot?.decisions} />
      </div>

      {/* Revision chat */}
      <div className="mt-5 rounded-xl bg-neutral-50 p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Revise with AI {plan.version && plan.version > 1 ? `· v${plan.version}` : ""}
        </p>

        {thread.length > 0 && (
          <div className="mt-3 space-y-2">
            {thread.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm ${
                  r.role === "COACH"
                    ? "ml-8 bg-ink text-white"
                    : "mr-8 bg-white text-neutral-700 ring-1 ring-neutral-200"
                }`}
              >
                <span className="font-mono text-[9px] uppercase tracking-widest opacity-60">
                  {r.role === "COACH" ? "You" : "AI"}
                </span>
                <p className="mt-0.5">{r.text}</p>
              </div>
            ))}
          </div>
        )}

        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
          rows={2}
          placeholder="e.g. drop the paneer, he's bored of it — swap in more variety at dinner"
          className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" tone="ink" busy={busy} onClick={send}>
            Send to AI
          </Button>
          <span className="text-[10px] text-neutral-400">⌘/Ctrl + Enter</span>
          <button
            onClick={() => setShowJson(!showJson)}
            className="ml-auto text-[10px] text-neutral-400 underline"
          >
            {showJson ? "hide" : "show"} raw
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-energy">{error}</p>}
        <p className="mt-2 text-[10px] text-neutral-400">
          Revising never sends. The plan stays awaiting your approval, and the safety
          rules re-apply after every change.
        </p>
      </div>

      {showJson && (
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-neutral-900 p-4 text-[11px] leading-relaxed text-neutral-100">
          {JSON.stringify(plan.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Readable renders (what the member would receive) ─────────────────────────

function DietRender({ payload }: { payload: Record<string, unknown> }) {
  const t = payload.dailyTargets as
    | { kcal?: number; proteinG?: number; carbsG?: number; fatG?: number }
    | undefined;
  const meals = (payload.meals ?? []) as Array<{ name?: string; items?: unknown[] }>;
  const grocery = (payload.groceryList ?? []) as string[];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-diet/10 px-2 py-0.5 font-mono text-[10px] text-diet">
          {String(payload.protocolSlug ?? "—")}
        </span>
        {payload.adjustment ? (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] text-neutral-600">
            {String(payload.adjustment)}
          </span>
        ) : null}
      </div>
      {t && (
        <p className="mt-2 text-sm">
          <span className="text-xl font-extrabold">{t.kcal}</span>
          <span className="text-neutral-500"> kcal · </span>
          <span className="font-semibold">P {t.proteinG}g</span>
          <span className="text-neutral-500"> · C {t.carbsG}g · F {t.fatG}g</span>
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {meals.map((m, i) => (
          <div key={i} className="rounded-lg bg-neutral-50 px-3 py-2">
            <p className="text-xs font-bold">{m.name}</p>
            <ul className="mt-1 space-y-0.5">
              {(m.items ?? []).map((it, j) => (
                <li key={j} className="text-xs text-neutral-600">
                  • {String(it)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <CoupledDays payload={payload} />

      {grocery.length > 0 && (
        <p className="mt-3 text-xs text-neutral-500">
          <span className="font-semibold text-neutral-600">Grocery:</span> {grocery.join(", ")}
        </p>
      )}
    </div>
  );
}

/** Cross-engine calorie coupling made visible: macros flexing with the training week. */
function CoupledDays({ payload }: { payload: Record<string, unknown> }) {
  const days = (payload.coupledDays ?? []) as Array<{
    day: string;
    intensity: string;
    focus?: string;
    kcal: number;
    carbsG: number;
    proteinG: number;
  }>;
  if (days.length === 0) return null;

  const tone: Record<string, string> = {
    high: "bg-energy/10 text-energy",
    moderate: "bg-work/10 text-work",
    low: "bg-neutral-100 text-neutral-600",
    rest: "bg-neutral-100 text-neutral-500",
  };

  return (
    <div className="mt-4 rounded-lg border border-work/20 bg-work/5 p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-work">
        🔗 Coupled to the training week
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {days.map((d, i) => (
          <div key={i} className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-neutral-200">
            <p className="text-[10px] font-bold">
              {d.day}{" "}
              <span className={`rounded-full px-1.5 py-px font-mono text-[9px] ${tone[d.intensity] ?? tone.low}`}>
                {d.intensity}
              </span>
            </p>
            <p className="mt-0.5 text-xs">
              <span className="font-bold">{d.kcal}</span>
              <span className="text-neutral-400"> kcal · C{d.carbsG}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-neutral-500">
        Protein stays constant; calories flex through carbs so hard days are fuelled and
        rest days aren&apos;t overfed.
      </p>
    </div>
  );
}

function TrainingRender({ payload }: { payload: Record<string, unknown> }) {
  const week = (payload.week ?? []) as Array<{
    day?: string;
    focus?: string;
    intensity?: string;
    exercises?: Array<{ name?: string; sets?: number; reps?: string; targetRpe?: number }>;
  }>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-work/10 px-2 py-0.5 font-mono text-[10px] text-work">
          {String(payload.protocolSlug ?? "—")}
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          {String(payload.daysPerWeek ?? "?")} days/week
        </span>
        {payload.deload ? (
          <span className="rounded-full bg-energy/10 px-2 py-0.5 font-mono text-[10px] font-bold text-energy">
            DELOAD ENFORCED
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {week.map((d, i) => (
          <div key={i} className="rounded-lg bg-neutral-50 px-3 py-2">
            <p className="text-xs font-bold">
              {d.day} — {d.focus}{" "}
              <span className="font-normal text-neutral-400">({d.intensity})</span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {(d.exercises ?? []).map((e, j) => (
                <li key={j} className="text-xs text-neutral-600">
                  • {e.name}: {e.sets}×{e.reps}
                  {e.targetRpe ? ` @RPE ${e.targetRpe}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

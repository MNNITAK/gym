"use client";

export interface EngineDecision {
  kind: string;
  label: string;
  detail: string;
  severity: "info" | "applied" | "enforced" | "blocked";
  source?: string;
}

const ICON: Record<string, string> = {
  protocol: "📚",
  metabolic: "🔬",
  adherence: "⚖️",
  safety: "🔒",
  memory: "🧠",
  injury: "🦵",
  fatigue: "😴",
  coupling: "🔗",
  progression: "📈",
  event: "📅",
  craving: "🍫",
  note: "📝",
};

const SEVERITY: Record<
  EngineDecision["severity"],
  { chip: string; label: string; row: string }
> = {
  blocked: { chip: "bg-energy text-white", label: "BLOCKED", row: "border-energy/30 bg-energy/5" },
  enforced: { chip: "bg-energy/15 text-energy", label: "ENFORCED", row: "border-energy/20 bg-energy/5" },
  applied: { chip: "bg-diet/15 text-diet", label: "APPLIED", row: "border-diet/20 bg-diet/5" },
  info: { chip: "bg-neutral-200 text-neutral-600", label: "CONTEXT", row: "border-neutral-200 bg-white" },
};

/**
 * "Why the AI did this" — the decision trace captured at generation time.
 * This is what separates the product from a generic chatbot in a demo: it shows
 * the deterministic rules that overrode the model, and the member facts applied.
 */
export function WhyPanel({ decisions }: { decisions?: EngineDecision[] | null }) {
  if (!decisions || decisions.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Why the AI did this
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          No decision trace on this plan — it was generated before reasoning capture was
          added. Regenerate to see it.
        </p>
      </div>
    );
  }

  const enforced = decisions.filter(
    (d) => d.severity === "enforced" || d.severity === "blocked",
  ).length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          🧠 Why the AI did this
        </p>
        {enforced > 0 && (
          <p className="font-mono text-[10px] text-energy">
            {enforced} rule{enforced === 1 ? "" : "s"} overrode the model
          </p>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {decisions.map((d, i) => {
          const s = SEVERITY[d.severity] ?? SEVERITY.info;
          return (
            <div key={i} className={`rounded-lg border px-3 py-2 ${s.row}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden>{ICON[d.kind] ?? "•"}</span>
                <span className="text-xs font-bold">{d.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold ${s.chip}`}>
                  {s.label}
                </span>
                {d.source && (
                  <span className="font-mono text-[9px] text-neutral-400">· {d.source}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-700">{d.detail}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-neutral-400">
        Captured at generation time. <span className="text-energy">Enforced</span> items are
        deterministic rules the model was not allowed to override.
      </p>
    </div>
  );
}

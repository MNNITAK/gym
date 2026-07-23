// ── Decision trace ───────────────────────────────────────────────────────────
// Every engine records WHY it produced what it produced. Without this the
// intelligence is invisible: a coach sees a meal plan and cannot tell it apart
// from a generic one. The trace is captured at generation time (never inferred
// later by the UI) and rendered as the "Why the AI did this" panel.

export type DecisionKind =
  | "protocol" // which protocol was selected, and why
  | "metabolic" // the calorie basis (twin vs formula)
  | "adherence" // the adherence gate's verdict
  | "safety" // a hard guardrail fired
  | "memory" // a durable member fact was applied
  | "injury" // an injured region was programmed around
  | "fatigue" // the Fatigue Guardian's verdict
  | "coupling" // diet ⇄ training macro coupling
  | "progression" // auto-progression from logged sets
  | "event" // a life event was planned around
  | "craving" // a predicted craving window was pre-empted
  | "note"; // a free-form note was applied

/**
 * `enforced` = a deterministic rule overrode the model (the strongest signal —
 * this is what proves the system isn't "just ChatGPT").
 * `blocked`  = something was refused outright.
 * `applied`  = personalization the member would notice.
 * `info`     = context worth showing.
 */
export type DecisionSeverity = "info" | "applied" | "enforced" | "blocked";

export interface EngineDecision {
  kind: DecisionKind;
  /** short headline, e.g. "Adherence gate" */
  label: string;
  /** one plain sentence a gym owner would understand */
  detail: string;
  severity: DecisionSeverity;
  /** where the fact came from, e.g. "member memory" or "14 days of logs" */
  source?: string;
}

/** Small builder so engines can accumulate a trace without ceremony. */
export class DecisionTrace {
  private readonly items: EngineDecision[] = [];

  add(d: EngineDecision): this {
    this.items.push(d);
    return this;
  }

  info(kind: DecisionKind, label: string, detail: string, source?: string): this {
    return this.add({ kind, label, detail, severity: "info", source });
  }
  applied(kind: DecisionKind, label: string, detail: string, source?: string): this {
    return this.add({ kind, label, detail, severity: "applied", source });
  }
  enforced(kind: DecisionKind, label: string, detail: string, source?: string): this {
    return this.add({ kind, label, detail, severity: "enforced", source });
  }
  blocked(kind: DecisionKind, label: string, detail: string, source?: string): this {
    return this.add({ kind, label, detail, severity: "blocked", source });
  }

  /** Enforced/blocked first — the overrides are the story worth telling. */
  toArray(): EngineDecision[] {
    const rank: Record<DecisionSeverity, number> = {
      blocked: 0,
      enforced: 1,
      applied: 2,
      info: 3,
    };
    return [...this.items].sort((a, b) => rank[a.severity] - rank[b.severity]);
  }
}

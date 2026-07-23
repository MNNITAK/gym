// ── Life-aware event handling (Diet INNOV 04) ────────────────────────────────
// Members quit plans they can't follow on real weekends. When a wedding, trip or
// holiday is coming, the plan flexes around it instead of pretending life is stable:
// extra activity beforehand, sensible ordering on the day, a return protocol after.

export type LifeEventType = "WEDDING" | "TRAVEL" | "HOLIDAY" | "COMPETITION" | "OTHER";

export interface LifeEvent {
  type: LifeEventType;
  /** the day the event happens */
  date: Date;
  label?: string;
}

export type EventPhase = "approach" | "event_day" | "recovery" | "clear";

export interface EventPlan {
  phase: EventPhase;
  daysAway: number;
  type: LifeEventType;
  /** headline the coach sees */
  headline: string;
  /** concrete instructions folded into the plan */
  guidance: string[];
}

/** How many days either side of an event the plan flexes. */
export const APPROACH_DAYS = 3;
export const RECOVERY_DAYS = 2;

const GUIDANCE: Record<LifeEventType, { approach: string[]; day: string[]; recovery: string[] }> = {
  WEDDING: {
    approach: [
      "Bank a small extra deficit over the next few days — not a crash, ~10% under target.",
      "Add 2,000 steps a day so the event day isn't a setback.",
      "Keep protein high to protect appetite control on the day.",
    ],
    day: [
      "Eat a high-protein meal before leaving so you arrive satisfied.",
      "Enjoy the meal — pick one plate, sit down, no grazing.",
      "Alternate every drink with water.",
    ],
    recovery: [
      "Return to normal targets immediately — no punishment day.",
      "Prioritise water, vegetables and sleep for 48 hours.",
    ],
  },
  TRAVEL: {
    approach: [
      "Pack portable protein (roasted chana, protein bars, curd).",
      "Pre-pick restaurant-safe orders for the trip.",
    ],
    day: [
      "Anchor two meals a day you control; be flexible on the third.",
      "Walk wherever the trip allows — steps replace the missed sessions.",
    ],
    recovery: ["Resume normal targets on the first full day back.", "Log weight after 3 days, not immediately."],
  },
  HOLIDAY: {
    approach: ["Slightly tighter targets in the run-up, without cutting protein."],
    day: ["Choose the two dishes you actually want; skip the ones you don't.", "Keep one protein source at every meal."],
    recovery: ["Straight back to plan — a festival is a day, not a phase."],
  },
  COMPETITION: {
    approach: ["Raise carbohydrates in the 48 hours before.", "Reduce fibre the day before to limit gut discomfort."],
    day: ["Familiar foods only — nothing new on competition day.", "Hydrate with electrolytes, not just water."],
    recovery: ["Refeed and sleep; resume structured training after 48 hours."],
  },
  OTHER: {
    approach: ["Slightly tighter targets in the run-up."],
    day: ["Prioritise protein, enjoy the occasion."],
    recovery: ["Return to normal targets the next day."],
  },
};

/**
 * Work out whether an event should bend this plan, and how. Returns `clear` when
 * the event is far enough away to ignore.
 */
export function planAroundEvent(event: LifeEvent, now: Date = new Date()): EventPlan {
  const day = (d: Date) => Math.floor(d.getTime() / 86_400_000);
  const daysAway = day(event.date) - day(now);
  const g = GUIDANCE[event.type] ?? GUIDANCE.OTHER;
  const name = event.label ?? event.type.toLowerCase();

  if (daysAway === 0) {
    return {
      phase: "event_day",
      daysAway,
      type: event.type,
      headline: `${name} is today — damage-control mode.`,
      guidance: g.day,
    };
  }
  if (daysAway > 0 && daysAway <= APPROACH_DAYS) {
    return {
      phase: "approach",
      daysAway,
      type: event.type,
      headline: `${name} in ${daysAway} day${daysAway === 1 ? "" : "s"} — banking headroom.`,
      guidance: g.approach,
    };
  }
  if (daysAway < 0 && Math.abs(daysAway) <= RECOVERY_DAYS) {
    return {
      phase: "recovery",
      daysAway,
      type: event.type,
      headline: `Back from ${name} — return protocol.`,
      guidance: g.recovery,
    };
  }
  return { phase: "clear", daysAway, type: event.type, headline: "", guidance: [] };
}

/** Pick the event that should shape today's plan, if any. */
export function activeEvent(events: LifeEvent[], now: Date = new Date()): EventPlan | null {
  const plans = events
    .map((e) => planAroundEvent(e, now))
    .filter((p) => p.phase !== "clear")
    .sort((a, b) => Math.abs(a.daysAway) - Math.abs(b.daysAway));
  return plans[0] ?? null;
}

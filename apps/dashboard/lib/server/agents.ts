import "./env";
import {
  updateStreak,
  resolveEngineId,
  engineIdAliases,
  ENGINES,
  type EngineId,
  type AgentAction,
} from "@keystone/core";
import { runEngineAgent, engineOpeners } from "@keystone/ai";
import { repos, type Member } from "@keystone/db";
import { llm, draftMessage } from "./clients";
import { buildAgentContext } from "./member";

// ── Agent orchestration ──────────────────────────────────────────────────────
// The model proposes actions; THIS file decides what actually happens. Every
// action is executed server-side with its own validation, so a hallucinated
// payload can't write nonsense into the member's record.

export interface AgentTurnResult {
  reply: string;
  actions: Array<{ type: string; label: string }>;
  suggestions: string[];
  escalated: boolean;
}

export async function chatWithAgent(
  member: Member,
  agentRaw: EngineId | string,
  message: string,
): Promise<AgentTurnResult> {
  const agent = resolveEngineId(agentRaw);
  const text = message.trim();
  if (!text) throw new Error("Say something first.");

  const [context, history] = await Promise.all([
    buildAgentContext(member),
    repos.conversationTurns.threadByAgent(member.id, engineIdAliases(agent), 12),
  ]);

  // Persist the member's turn before calling out, so nothing is lost on failure.
  await repos.conversationTurns.create({
    gymId: member.gymId,
    memberId: member.id,
    direction: "INBOUND",
    agent,
    text,
    providerMessageId: `app_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  });

  const reply = await runEngineAgent(llm(), {
    engine: agent,
    message: text,
    context,
    history: history.map((t) => ({
      role: t.direction === "INBOUND" ? ("member" as const) : ("coach" as const),
      text: t.text,
    })),
  });

  // Execute what the agent asked for.
  const executed: Array<{ type: string; label: string }> = [];
  for (const action of reply.actions) {
    const done = await executeAction(member, agent, action);
    if (done) executed.push({ type: action.type, label: done });
  }

  if (reply.escalate) {
    await draftMessage({
      gymId: member.gymId,
      memberId: member.id,
      body: `${member.name} needs you (via ${ENGINES[agent].name}): "${text}"${reply.escalateReason ? ` — ${reply.escalateReason}` : ""}`,
      requiresApproval: true,
    });
  }

  await repos.conversationTurns.create({
    gymId: member.gymId,
    memberId: member.id,
    direction: "OUTBOUND",
    agent,
    text: reply.reply,
    actions: executed,
    providerMessageId: `app_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  });

  return {
    reply: reply.reply,
    actions: executed,
    suggestions: reply.suggestions.slice(0, 3),
    escalated: reply.escalate,
  };
}

/**
 * Execute one agent action. Returns the confirmation label on success, or null
 * when the payload didn't hold up — a bad action is dropped, never guessed at.
 */
async function executeAction(
  member: Member,
  agent: EngineId,
  action: AgentAction,
): Promise<string | null> {
  const p = action.payload as Record<string, unknown>;
  const gymId = member.gymId;
  const memberId = member.id;
  const now = new Date();
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

  switch (action.type) {
    case "log_weight": {
      const weightKg = num(p.weightKg ?? p.weight);
      if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300) return null;
      await repos.logs.create({
        gymId, memberId, type: "WEIGHT", loggedFor: now,
        payload: { weightKg, source: "agent" },
      });
      await bumpStreak(member);
      return `Logged ${weightKg}kg`;
    }
    case "log_food": {
      const description = String(p.description ?? p.food ?? "").trim();
      if (!description) return null;
      const kcal = num(p.kcal);
      await repos.logs.create({
        gymId, memberId, type: "INTAKE", loggedFor: now,
        payload: { ...(Number.isFinite(kcal) ? { kcal } : {}), raw: description, source: "agent" },
      });
      await bumpStreak(member);
      return Number.isFinite(kcal) ? `Logged ${description} (~${kcal} kcal)` : `Logged ${description}`;
    }
    case "log_workout": {
      const rpe = num(p.rpe);
      await repos.logs.create({
        gymId, memberId, type: "WORKOUT", loggedFor: now,
        payload: {
          ...(Number.isFinite(rpe) ? { rpe } : {}),
          raw: String(p.notes ?? "session logged"),
          source: "agent",
        },
      });
      await bumpStreak(member);
      return Number.isFinite(rpe) ? `Session logged at RPE ${rpe}` : "Session logged";
    }
    case "log_sleep": {
      const hours = num(p.hours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) return null;
      await repos.logs.create({
        gymId, memberId, type: "SLEEP", loggedFor: now,
        payload: { hours, source: "agent" },
      });
      return `Logged ${hours}h sleep`;
    }
    case "log_checkin": {
      const soreness = num(p.soreness);
      await repos.logs.create({
        gymId, memberId, type: "CHECKIN", loggedFor: now,
        payload: {
          ...(Number.isFinite(soreness) ? { soreness } : {}),
          raw: String(p.mood ?? p.note ?? "check-in"),
          source: "agent",
        },
      });
      return "Check-in saved";
    }
    case "log_craving": {
      const craving = String(p.craving ?? p.what ?? "").trim();
      if (!craving) return null;
      // Stored as a check-in so craving-window prediction picks it up.
      await repos.logs.create({
        gymId, memberId, type: "CHECKIN", loggedFor: now,
        payload: { raw: `craving ${craving}`, source: "agent" },
      });
      return `Noted the ${craving} craving`;
    }
    case "flag_injury": {
      const region = String(p.region ?? "").trim();
      const detail = String(p.detail ?? p.what ?? region).trim();
      if (!detail) return null;
      await repos.memberMemories.upsertByKey({
        gymId, memberId,
        kind: "INJURY",
        key: `injury.${region.toLowerCase().replace(/\s+/g, "_") || "general"}`,
        value: detail,
        confidence: 0.9,
        active: true,
      });
      await repos.notes.create({ gymId, memberId, source: "MEMBER", text: `Injury reported: ${detail}` });
      // A human always hears about pain.
      await draftMessage({
        gymId, memberId,
        body: `⚠️ ${member.name} reported pain: "${detail}". Training has been adjusted around it — please check in.`,
        requiresApproval: true,
      });
      return `Flagged to your coach: ${detail}`;
    }
    case "add_note": {
      const noteText = String(p.text ?? p.note ?? "").trim();
      if (!noteText) return null;
      await repos.notes.create({ gymId, memberId, source: "MEMBER", text: noteText });
      return "Saved to your notes";
    }
    case "set_event": {
      const type = String(p.type ?? "other").toUpperCase();
      const date = resolveWhen(String(p.whenHint ?? p.when ?? ""));
      if (!date) return null;
      await repos.events.create({
        gymId, memberId,
        type: (["WEDDING", "TRAVEL", "HOLIDAY", "COMPETITION", "OTHER"].includes(type)
          ? type
          : "OTHER") as "WEDDING" | "TRAVEL" | "HOLIDAY" | "COMPETITION" | "OTHER",
        date,
        label: String(p.whenHint ?? ""),
        source: "MEMBER",
      });
      return `Added ${type.toLowerCase()} on ${date.toDateString().slice(0, 10)} to your plan`;
    }
    case "request_plan_change": {
      const what = String(p.what ?? p.change ?? "").trim();
      if (!what) return null;
      await repos.notes.create({
        gymId, memberId, source: "MEMBER",
        text: `Plan change requested (${agent}): ${what}`,
      });
      await draftMessage({
        gymId, memberId,
        body: `${member.name} asked for a plan change: "${what}"`,
        requiresApproval: true,
      });
      return "Sent to your coach";
    }
    case "ask_coach": {
      const question = String(p.question ?? "").trim();
      if (!question) return null;
      await draftMessage({
        gymId, memberId,
        body: `${member.name} asks: "${question}"`,
        requiresApproval: true,
      });
      return "Passed to your coach";
    }
    default:
      return null;
  }
}

/** Engagement extends the streak, same rule the WhatsApp path used. */
async function bumpStreak(member: Member): Promise<void> {
  const patch = updateStreak(
    { currentStreak: member.currentStreak, longestStreak: member.longestStreak },
    member.lastActiveAt,
    new Date(),
  );
  await repos.members.update(member.id, { ...patch, lastActiveAt: new Date() });
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function resolveWhen(hint: string): Date | null {
  if (!hint) return null;
  const h = hint.toLowerCase();
  const now = new Date();
  if (/today|tonight/.test(h)) return now;
  if (/tomorrow/.test(h)) return new Date(now.getTime() + 864e5);
  const wd = WEEKDAYS.findIndex((d) => h.includes(d));
  if (wd >= 0) return new Date(now.getTime() + ((wd - now.getDay() + 7) % 7 || 7) * 864e5);
  const inDays = h.match(/in\s+(\d{1,3})\s+days?/);
  if (inDays) return new Date(now.getTime() + Number(inDays[1]) * 864e5);
  if (/next week/.test(h)) return new Date(now.getTime() + 7 * 864e5);
  if (/next month/.test(h)) return new Date(now.getTime() + 30 * 864e5);
  const parsed = Date.parse(hint);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export { engineOpeners };

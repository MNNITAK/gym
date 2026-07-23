"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { meApi } from "../../../lib/member-api";
import { MemberShell, MError, useMemberAuth } from "../../../components/member-ui";

type AgentId = "hearth" | "forge" | "anchor";

// The three engines. Named products, not generic bots.
const AGENTS: Record<AgentId, { name: string; domain: string; emoji: string; tagline: string; accent: string }> = {
  hearth: { name: "Hearth", domain: "Nutrition", emoji: "🔥", tagline: "Meals, macros, cravings, eating out", accent: "bg-diet" },
  forge: { name: "Forge", domain: "Training", emoji: "⚒️", tagline: "Sessions, form, load, aches and pains", accent: "bg-work" },
  anchor: { name: "Anchor", domain: "Your coach", emoji: "⚓", tagline: "Motivation, habits, progress, membership", accent: "bg-crm" },
};

interface Turn {
  role: "member" | "coach";
  text: string;
  actions?: Array<{ type: string; label: string }>;
  pending?: boolean;
}

function CoachInner() {
  const ready = useMemberAuth();
  const params = useSearchParams();
  const router = useRouter();
  const initialAgent = (params.get("agent") as AgentId) || "anchor";
  const seeded = params.get("q");

  const [agent, setAgent] = useState<AgentId>(initialAgent);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [openers, setOpeners] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);

  const load = useCallback(async (a: AgentId) => {
    try {
      const res = await meApi<{ openers: string[]; turns: Turn[] }>(`/agent?agent=${a}`);
      setTurns(res.turns);
      setOpeners(res.openers);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load(agent);
  }, [ready, agent, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || busy) return;
      setBusy(true);
      setError(null);
      setInput("");
      setTurns((t) => [...t, { role: "member", text }, { role: "coach", text: "", pending: true }]);
      try {
        const res = await meApi<{
          reply: string;
          actions: Array<{ type: string; label: string }>;
          suggestions: string[];
          escalated: boolean;
        }>("/agent", { method: "POST", body: JSON.stringify({ agent, message: text }) });
        setTurns((t) => [
          ...t.slice(0, -1),
          { role: "coach", text: res.reply, actions: res.actions },
        ]);
        setOpeners(res.suggestions.length ? res.suggestions : openers);
      } catch (e) {
        setTurns((t) => t.slice(0, -1));
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [agent, busy, openers],
  );

  // A question passed in from another screen ("Craving SOS", "It hurts") sends itself.
  useEffect(() => {
    if (ready && seeded && !seededRef.current) {
      seededRef.current = true;
      void send(seeded);
      router.replace(`/app/coach?agent=${agent}`);
    }
  }, [ready, seeded, send, router, agent]);

  if (!ready) return null;
  const meta = AGENTS[agent];

  return (
    <MemberShell>
      {/* Agent switcher */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {(Object.keys(AGENTS) as AgentId[]).map((a) => (
          <button
            key={a}
            onClick={() => {
              setAgent(a);
              setTurns([]);
            }}
            className={`rounded-2xl border p-2.5 text-center transition ${
              agent === a ? "border-ink bg-white shadow-sm" : "border-neutral-200 bg-white/50 opacity-60"
            }`}
          >
            <p className="text-xl">{AGENTS[a].emoji}</p>
            <p className="mt-0.5 text-[11px] font-bold">{AGENTS[a].name}</p>
            <p className="text-[9px] text-neutral-400">{AGENTS[a].domain}</p>
          </button>
        ))}
      </div>
      <p className="mb-3 text-center text-[11px] text-neutral-500">{meta.tagline}</p>
      <MError error={error} />

      {/* Thread */}
      <div className="space-y-2.5">
        {turns.length === 0 && !busy && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
            <p className="text-3xl">{meta.emoji}</p>
            <p className="mt-2 text-sm font-bold">{meta.name} · {meta.domain}</p>
            <p className="mt-1 text-xs text-neutral-500">
              Knows your plan, your history and what you&apos;ve told it before. Ask anything.
            </p>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === "member" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                t.role === "member"
                  ? "bg-ink text-white"
                  : "border border-neutral-200 bg-white text-neutral-800"
              }`}
            >
              {t.pending ? (
                <span className="inline-flex gap-1">
                  <Dot /> <Dot /> <Dot />
                </span>
              ) : (
                <p className="whitespace-pre-wrap">{t.text}</p>
              )}
              {(t.actions?.length ?? 0) > 0 && (
                <div className="mt-2 space-y-1 border-t border-neutral-100 pt-2">
                  {t.actions!.map((a, j) => (
                    <p key={j} className="font-mono text-[10px] font-bold text-diet">
                      ✓ {a.label}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Suggestions */}
      {openers.length > 0 && !busy && (
        <div className="mt-4 flex flex-wrap gap-2">
          {openers.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 active:scale-95"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer — sits directly above the tab bar, clear of the home indicator */}
      <div
        className="fixed inset-x-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur"
        style={{ bottom: "calc(3.25rem + var(--safe-bottom))" }}
      >
        <div className="mx-auto flex max-w-2xl gap-2 px-4 py-2.5 sm:px-5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder={`Message ${meta.name}…`}
            className="min-w-0 flex-1 rounded-full border border-neutral-300 px-4 py-2.5 text-sm"
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${meta.accent}`}
          >
            Send
          </button>
        </div>
      </div>
      {/* Spacer so the last message isn't hidden behind the composer. */}
      <div className="h-14" />
    </MemberShell>
  );
}

function Dot() {
  return <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />;
}

export default function CoachPage() {
  return (
    <Suspense fallback={null}>
      <CoachInner />
    </Suspense>
  );
}

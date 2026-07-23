"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { meApi, getMemberName } from "../../../lib/member-api";
import { useMemberAuth } from "../../../components/member-ui";
import { CheckCircle2 } from "lucide-react";

interface Turn {
  role: "member" | "coach";
  text: string;
  pending?: boolean;
}
interface Progress {
  answered: number;
  total: number;
  percent: number;
  requiredRemaining: number;
}

/**
 * The first conversation a member has. Deliberately full-screen with no tab bar:
 * there is nothing else to do until the coach knows who they are.
 */
export default function OnboardingPage() {
  const ready = useMemberAuth();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await meApi<{ status: string; progress: Progress; turns: Turn[] }>("/onboarding");
      setTurns(res.turns);
      setProgress(res.progress);
      if (res.status === "COMPLETE") setDone(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    setSuggestions([]);
    setTurns((t) => [...t, { role: "member", text }, { role: "coach", text: "", pending: true }]);
    try {
      const res = await meApi<{
        reply: string;
        suggestions: string[];
        progress: Progress;
        complete: boolean;
      }>("/onboarding", { method: "POST", body: JSON.stringify({ message: text }) });
      setTurns((t) => [...t.slice(0, -1), { role: "coach", text: res.reply }]);
      setProgress(res.progress);
      setSuggestions(res.suggestions);
      if (res.complete) setDone(true);
    } catch (e) {
      setTurns((t) => t.slice(0, -1));
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;
  const first = (getMemberName().split(" ")[0] || "there").trim();

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Progress — the member can always see how much is left */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
              Getting to know you
            </p>
            <p className="font-mono text-[10px] text-neutral-500">
              {progress ? `${progress.answered} of ${progress.total}` : "…"}
            </p>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-diet transition-all duration-500"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-5">
        {error && (
          <p className="mb-3 rounded-xl bg-energy/10 px-4 py-2 text-sm text-energy">{error}</p>
        )}

        <div className="space-y-2.5">
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
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {suggestions.length > 0 && !busy && !done && (
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
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

        {done && (
          <div className="mt-6 rounded-2xl border border-diet/30 bg-diet/5 p-5 text-center">
            <CheckCircle2 size={30} strokeWidth={1.5} className="mx-auto text-diet" />
            <p className="mt-2 font-bold">All set, {first}</p>
            <p className="mt-1 text-sm text-neutral-600">
              Your coach has everything they need. Every plan you get from here on is built
              around what you just told me.
            </p>
            <button
              onClick={() => router.push("/app")}
              className="mt-4 w-full rounded-full bg-ink px-6 py-3 font-semibold text-white"
            >
              Go to my dashboard
            </button>
          </div>
        )}
      </main>

      {!done && (
        <div className="sticky bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div
            className="mx-auto flex max-w-2xl gap-2 px-5 py-3"
            style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Type your answer…"
              className="min-w-0 flex-1 rounded-full border border-neutral-300 px-4 py-2.5 text-sm"
              autoFocus
            />
            <button
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Dot() {
  return <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />;
}

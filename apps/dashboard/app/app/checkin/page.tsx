"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { meApi } from "../../../lib/member-api";
import { MCard, MLabel, MButton, MError, useMemberAuth } from "../../../components/member-ui";

interface Question {
  key: string;
  prompt: string;
  type: "scale" | "number" | "choice" | "text";
  labels?: string[];
  options?: string[];
  unit?: string;
}
type Answer = string | number;

/**
 * The day starts here. Two steps on purpose: the tap that records attendance is
 * separate from the questionnaire, so a member in a hurry still keeps their
 * streak. One question per screen — a 15-field form every morning gets abandoned.
 */
export default function CheckinPage() {
  const ready = useMemberAuth();
  const router = useRouter();
  const [state, setState] = useState<{
    checkedIn: boolean;
    complete: boolean;
    questions: Question[];
    streak: number;
  } | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCheckedIn, setJustCheckedIn] = useState<{ streak: number; isNewBest: boolean } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const res = await meApi<typeof state>("/checkin");
      setState(res);
      if (res?.complete) router.replace("/app");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [router]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function doCheckIn() {
    setBusy(true);
    setError(null);
    try {
      const res = await meApi<{ streak: number; isNewBest: boolean; alreadyCheckedIn: boolean }>(
        "/checkin",
        { method: "POST", body: JSON.stringify({ action: "start" }) },
      );
      setJustCheckedIn({ streak: res.streak, isNewBest: res.isNewBest });
      setState((s) => (s ? { ...s, checkedIn: true, streak: res.streak } : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function answer(key: string, value: Answer) {
    setAnswers((a) => ({ ...a, [key]: value }));
    // Auto-advance on tap answers; typed ones need an explicit Next.
    const q = state?.questions[step];
    if (q && (q.type === "scale" || q.type === "choice")) {
      setTimeout(() => setStep((s) => s + 1), 180);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await meApi("/checkin", {
        method: "POST",
        body: JSON.stringify({ action: "submit", answers }),
      });
      router.replace("/app");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!ready || !state) return null;

  // ── Step 1: attendance ──
  if (!state.checkedIn) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-5xl">👋</p>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Good to see you</h1>
          <p className="mt-2 max-w-xs text-sm text-neutral-600">
            Check in to record today, then tell your coach how you&apos;re doing. Takes about a
            minute.
          </p>
          <div className="mt-3 rounded-full bg-work/10 px-3 py-1 font-mono text-xs font-bold text-work">
            🔥 {state.streak} day streak
          </div>
          <div className="mt-8 w-full max-w-xs">
            <MButton full busy={busy} onClick={doCheckIn}>
              Check in for today
            </MButton>
          </div>
        </div>
        <MError error={error} />
      </Shell>
    );
  }

  // ── Between the two steps: the streak reward ──
  if (justCheckedIn && step === 0 && Object.keys(answers).length === 0) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-5xl">🔥</p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
            {justCheckedIn.streak} days
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {justCheckedIn.isNewBest ? "That's a new personal best." : "Streak intact. Nice work."}
          </p>
          <p className="mt-6 max-w-xs text-sm text-neutral-600">
            Now — {state.questions.length} quick questions so your coach knows what kind of day to
            give you.
          </p>
          <div className="mt-6 w-full max-w-xs">
            <MButton full onClick={() => setJustCheckedIn(null)}>
              Start
            </MButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Step 2: the questionnaire, one at a time ──
  const q = state.questions[step];
  const done = step >= state.questions.length;

  if (done) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-5xl">✅</p>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">That&apos;s everything</h1>
          <p className="mt-2 max-w-xs text-sm text-neutral-600">
            Your coach will use this to decide what today should look like.
          </p>
          <div className="mt-8 w-full max-w-xs space-y-2">
            <MButton full busy={busy} onClick={submit}>
              Send to my coach
            </MButton>
            <button
              onClick={() => setStep(0)}
              className="w-full py-2 text-xs text-neutral-500 underline"
            >
              Go back and change something
            </button>
          </div>
        </div>
        <MError error={error} />
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between">
          <MLabel>Daily check-in</MLabel>
          <span className="font-mono text-[10px] text-neutral-500">
            {step + 1} / {state.questions.length}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-work transition-all duration-300"
            style={{ width: `${((step + 1) / state.questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <h2 className="text-xl font-extrabold tracking-tight">{q!.prompt}</h2>

        {q!.type === "scale" && (
          <div className="mt-6 space-y-2">
            {(q!.labels ?? []).map((label, i) => {
              const value = i + 1;
              const selected = answers[q!.key] === value;
              return (
                <button
                  key={value}
                  onClick={() => answer(q!.key, value)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition ${
                    selected ? "border-ink bg-ink text-white" : "border-neutral-200 bg-white"
                  }`}
                >
                  <span className="text-sm font-semibold">{label}</span>
                  <span className={`font-mono text-xs ${selected ? "opacity-70" : "text-neutral-400"}`}>
                    {value}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {q!.type === "choice" && (
          <div className="mt-6 space-y-2">
            {(q!.options ?? []).map((opt) => {
              const selected = answers[q!.key] === opt;
              return (
                <button
                  key={opt}
                  onClick={() => answer(q!.key, opt)}
                  className={`w-full rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition ${
                    selected ? "border-ink bg-ink text-white" : "border-neutral-200 bg-white"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {q!.type === "number" && (
          <div className="mt-6">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                autoFocus
                value={String(answers[q!.key] ?? "")}
                onChange={(e) => setAnswers((a) => ({ ...a, [q!.key]: Number(e.target.value) }))}
                onKeyDown={(e) => e.key === "Enter" && setStep((s) => s + 1)}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3.5 text-2xl font-bold"
                placeholder="—"
              />
              {q!.unit && <span className="text-lg font-semibold text-neutral-400">{q!.unit}</span>}
            </div>
          </div>
        )}

        {q!.type === "text" && (
          <textarea
            autoFocus
            rows={4}
            value={String(answers[q!.key] ?? "")}
            onChange={(e) => setAnswers((a) => ({ ...a, [q!.key]: e.target.value }))}
            placeholder="Optional — anything at all"
            className="mt-6 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
          />
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="rounded-full border border-neutral-300 px-4 py-2.5 text-sm font-semibold"
          >
            Back
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setStep((s) => s + 1)}
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white"
        >
          {answers[q!.key] !== undefined ? "Next" : "Skip"}
        </button>
      </div>
      <MError error={error} />
    </Shell>
  );
}

/** Full-screen, no tab bar — the check-in is a task to finish, not a place to browse. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <main
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-6"
        style={{ paddingBottom: "calc(1.5rem + var(--safe-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}

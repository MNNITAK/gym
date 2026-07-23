"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { meApi } from "../../../lib/member-api";
import {
  MemberShell,
  MCard,
  MLabel,
  MButton,
  MError,
  useMemberAuth,
} from "../../../components/member-ui";

interface LibraryDetail {
  name: string;
  cues: string[];
  commonMistakes: string[];
  regression: string | null;
  progression: string | null;
  contraindicatedFor: string[];
}
interface Exercise {
  name: string;
  sets: number;
  reps: string;
  targetRpe?: number;
  loadKg?: number;
  regression?: string;
  progression?: string;
  library: LibraryDetail | null;
}
interface Day { day: string; focus: string; intensity: string; exercises: Exercise[] }
interface RehabStage { stage: number; focus: string; exercises: string[]; clearedWhen: string }
interface TrainingData {
  plan: { id: string; protocolSlug: string | null; daysPerWeek: number | null; deload: boolean; rationale?: string | null; week: Day[] } | null;
  today: (Day & { deload: boolean }) | null;
  rehab: Array<{ region: string; name: string; stages: RehabStage[]; redFlags: string[] }>;
}

export default function TrainingPage() {
  const ready = useMemberAuth();
  const router = useRouter();
  const [data, setData] = useState<TrainingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [rpe, setRpe] = useState("");
  const [showWeek, setShowWeek] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await meApi<TrainingData>("/training"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const ask = (q: string) => router.push(`/app/coach?agent=forge&q=${encodeURIComponent(q)}`);

  async function finishSession() {
    setBusy("finish");
    try {
      await meApi("/log", {
        method: "POST",
        body: JSON.stringify({
          type: "WORKOUT",
          payload: {
            ...(rpe ? { rpe: Number(rpe) } : {}),
            raw: `${data?.today?.focus ?? "Session"} completed`,
            completed: Object.values(done).filter(Boolean).length,
          },
        }),
      });
      setRpe("");
      setDone({});
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return null;
  const today = data?.today;
  const totalEx = today?.exercises.length ?? 0;
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <MemberShell
      title="Your training"
      subtitle={data?.plan?.protocolSlug ? `${data.plan.protocolSlug} · ${data.plan.daysPerWeek} days/week` : undefined}
    >
      <MError error={error} />

      {data?.plan?.deload && (
        <MCard className="border-energy/30 bg-energy/5">
          <p className="text-sm font-bold text-energy">⚠️ Deload week</p>
          <p className="mt-1 text-xs text-neutral-600">
            Your coach has pulled the intensity back on purpose — your recovery markers called
            for it. Train, but don&apos;t chase records this week.
          </p>
        </MCard>
      )}

      {/* Rehab, if any */}
      {(data?.rehab.length ?? 0) > 0 && (
        <MCard className="mt-3 border-work/30 bg-work/5">
          <MLabel>Rehab running alongside</MLabel>
          {data!.rehab.map((r) => (
            <div key={r.region} className="mt-2">
              <p className="text-sm font-bold">{r.name}</p>
              <p className="mt-1 text-xs text-neutral-600">
                Stage 1 — {r.stages[0]!.focus}: {r.stages[0]!.exercises.join(", ")}
              </p>
              <p className="mt-1 font-mono text-[10px] text-diet">
                cleared when: {r.stages[0]!.clearedWhen}
              </p>
              <p className="mt-1 text-[10px] text-energy">🚩 Stop and tell your coach: {r.redFlags.join(" · ")}</p>
            </div>
          ))}
        </MCard>
      )}

      {!today && (
        <MCard className="mt-3">
          <p className="text-sm font-bold">Rest day 😌</p>
          <p className="mt-1 text-xs text-neutral-600">
            Nothing programmed for today. Recovery is part of the plan.
          </p>
          <div className="mt-3 flex gap-2">
            <MButton size="sm" tone="ghost" onClick={() => setShowWeek(true)}>See the week</MButton>
            <MButton size="sm" tone="ghost" onClick={() => ask("I want to train today anyway — what should I do?")}>
              I want to train
            </MButton>
          </div>
        </MCard>
      )}

      {today && (
        <>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <p className="text-xl font-extrabold tracking-tight">{today.focus}</p>
              <p className="text-xs text-neutral-500">
                {today.day} · {today.intensity} intensity · {totalEx} exercises
              </p>
            </div>
            <p className="font-mono text-xs text-neutral-400">{doneCount}/{totalEx}</p>
          </div>

          <div className="mt-3 space-y-2">
            {today.exercises.map((ex, i) => {
              const key = `${i}-${ex.name}`;
              const isOpen = openEx === key;
              return (
                <MCard key={key} className={done[key] ? "opacity-60" : ""}>
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => setOpenEx(isOpen ? null : key)} className="min-w-0 flex-1 text-left">
                      <p className="text-sm font-bold">{ex.name}</p>
                      <p className="text-xs text-neutral-600">
                        {ex.sets} × {ex.reps}
                        {ex.loadKg ? ` @ ${ex.loadKg}kg` : ""}
                        {ex.targetRpe ? ` · RPE ${ex.targetRpe}` : ""}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold text-work">
                        {isOpen ? "Hide" : "How do I do this?"}
                      </p>
                    </button>
                    <button
                      onClick={() => setDone((s) => ({ ...s, [key]: !s[key] }))}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                        done[key] ? "bg-work text-white" : "border border-neutral-300"
                      }`}
                    >
                      {done[key] ? "✓" : "Done"}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                      {ex.library ? (
                        <>
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-widest text-diet">Cues</p>
                            {ex.library.cues.map((c, j) => (
                              <p key={j} className="text-xs text-neutral-600">✓ {c}</p>
                            ))}
                          </div>
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-widest text-energy">
                              Common mistakes
                            </p>
                            {ex.library.commonMistakes.map((c, j) => (
                              <p key={j} className="text-xs text-neutral-600">✗ {c}</p>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-neutral-400">
                          No library entry for this one — ask your coach below.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <MButton size="sm" tone="ghost" onClick={() => ask(`${ex.name} is too hard — give me an easier version`)}>
                          Too hard
                        </MButton>
                        <MButton size="sm" tone="ghost" onClick={() => ask(`${ex.name} felt easy — should I add load?`)}>
                          Too easy
                        </MButton>
                        <MButton size="sm" tone="energy" onClick={() => ask(`${ex.name} hurts when I do it`)}>
                          It hurts
                        </MButton>
                      </div>
                    </div>
                  )}
                </MCard>
              );
            })}
          </div>

          {/* Finish */}
          <MCard className="mt-4 border-work/30">
            <MLabel>Finish session</MLabel>
            <p className="mt-1 text-xs text-neutral-600">
              How hard was it overall? (RPE 1–10 — your coach uses this to set next week&apos;s load.)
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setRpe(String(n))}
                  className={`h-10 w-10 rounded-full text-sm font-bold ${
                    rpe === String(n) ? "bg-work text-white" : "border border-neutral-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <MButton tone="work" full busy={busy === "finish"} onClick={finishSession}>
                Log session
              </MButton>
            </div>
          </MCard>
        </>
      )}

      {/* Week view */}
      {(data?.plan?.week.length ?? 0) > 0 && (
        <section className="mt-5">
          <button onClick={() => setShowWeek(!showWeek)} className="text-xs font-semibold text-work underline">
            {showWeek ? "Hide" : "See"} the whole week
          </button>
          {showWeek && (
            <div className="mt-2 space-y-2">
              {data!.plan!.week.map((d, i) => (
                <MCard key={i}>
                  <p className="text-sm font-bold">
                    {d.day} — {d.focus}{" "}
                    <span className="font-mono text-[10px] font-normal text-neutral-400">
                      ({d.intensity})
                    </span>
                  </p>
                  {d.exercises.map((e, j) => (
                    <p key={j} className="text-xs text-neutral-600">
                      • {e.name}: {e.sets}×{e.reps}
                    </p>
                  ))}
                </MCard>
              ))}
            </div>
          )}
        </section>
      )}
    </MemberShell>
  );
}

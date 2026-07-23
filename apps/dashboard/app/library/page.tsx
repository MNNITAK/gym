"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Nav } from "../../components/nav";
import { Card, ErrorNote, SectionTitle, useRequireAuth } from "../../components/ui";

interface Movement {
  slug: string;
  name: string;
  pattern: string;
  equipment: string[];
  level: number;
  cues: string[];
  commonMistakes: string[];
  contraindicatedFor: string[];
  regression?: string;
  progression?: string;
}
interface RehabStage {
  stage: number;
  focus: string;
  exercises: string[];
  clearedWhen: string;
}
interface RehabProtocol {
  region: string;
  name: string;
  stages: RehabStage[];
  redFlags: string[];
}

const PATTERN_LABEL: Record<string, string> = {
  squat: "Squat",
  hinge: "Hinge",
  push_horizontal: "Horizontal push",
  push_vertical: "Vertical push",
  pull_horizontal: "Horizontal pull",
  pull_vertical: "Vertical pull",
  carry: "Carry",
  core: "Core",
  conditioning: "Conditioning",
};

export default function LibraryPage() {
  const ready = useRequireAuth();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [rehab, setRehab] = useState<RehabProtocol[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"movements" | "rehab">("movements");

  const load = useCallback(async () => {
    try {
      const res = await api<{ movements: Movement[]; rehab: RehabProtocol[] }>("/movements");
      setMovements(res.movements);
      setRehab(res.rehab);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return null;

  const byPattern = movements.reduce<Record<string, Movement[]>>((acc, m) => {
    (acc[m.pattern] ??= []).push(m);
    return acc;
  }, {});

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">Movement library</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Curated by a strength &amp; conditioning specialist — the AI selects from this, it
          never invents programming. Each movement carries coaching cues, the mistakes
          people actually make, and an &ldquo;if you can&rsquo;t do X, do Y&rdquo; ladder.
        </p>
        <ErrorNote error={error} />

        <div className="mt-5 flex gap-2">
          {(["movements", "rehab"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                tab === t ? "bg-ink text-white" : "border border-neutral-300 text-neutral-600"
              }`}
            >
              {t === "movements" ? `Movements (${movements.length})` : `Rehab protocols (${rehab.length})`}
            </button>
          ))}
        </div>

        {tab === "movements" &&
          Object.entries(byPattern).map(([pattern, list]) => (
            <section key={pattern} className="mt-8">
              <SectionTitle>{PATTERN_LABEL[pattern] ?? pattern} ladder</SectionTitle>
              <div className="mt-3 space-y-2">
                {list
                  .sort((a, b) => a.level - b.level)
                  .map((m) => (
                    <Card key={m.slug}>
                      <button
                        onClick={() => setOpen(open === m.slug ? null : m.slug)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <span className="font-semibold">{m.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {m.contraindicatedFor.length > 0 && (
                            <span className="rounded-full bg-energy/10 px-2 py-0.5 font-mono text-[9px] font-bold text-energy">
                              ⚠ {m.contraindicatedFor.join(", ").replace(/_/g, " ")}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-neutral-400">
                            L{m.level}
                          </span>
                        </span>
                      </button>

                      {open === m.slug && (
                        <div className="mt-3 grid gap-3 border-t border-neutral-100 pt-3 sm:grid-cols-2">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-widest text-diet">
                              Coaching cues
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {m.cues.map((c, i) => (
                                <li key={i} className="text-xs text-neutral-600">✓ {c}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-widest text-energy">
                              Common mistakes
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {m.commonMistakes.map((c, i) => (
                                <li key={i} className="text-xs text-neutral-600">✗ {c}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="sm:col-span-2">
                            <p className="font-mono text-[10px] uppercase tracking-widest text-work">
                              Ladder
                            </p>
                            <p className="mt-1 text-xs text-neutral-600">
                              {m.regression ? `⬇ easier: ${m.regression}` : "⬇ entry point"}
                              {"   ·   "}
                              {m.progression ? `⬆ harder: ${m.progression}` : "⬆ top of ladder"}
                            </p>
                            {m.equipment.length > 0 && (
                              <p className="mt-1 font-mono text-[10px] text-neutral-400">
                                equipment: {m.equipment.join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
              </div>
            </section>
          ))}

        {tab === "rehab" && (
          <div className="mt-8 space-y-3">
            <p className="text-xs text-neutral-500">
              When a member reports pain, the engine substitutes safe movements and can run
              one of these alongside their training. Every stage advances on coach sign-off —
              never automatically.
            </p>
            {rehab.map((r) => (
              <Card key={r.region}>
                <p className="font-semibold">{r.name}</p>
                <div className="mt-3 space-y-2">
                  {r.stages.map((s) => (
                    <div key={s.stage} className="rounded-lg bg-neutral-50 px-3 py-2">
                      <p className="text-xs font-bold">
                        Stage {s.stage} — {s.focus}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-600">
                        {s.exercises.join(" · ")}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-diet">
                        cleared when: {s.clearedWhen}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 rounded-lg bg-energy/5 px-3 py-2 text-xs text-energy">
                  🚩 Red flags — refer out: {r.redFlags.join(" · ")}
                </p>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

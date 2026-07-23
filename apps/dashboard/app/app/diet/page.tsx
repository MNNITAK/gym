"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { meApi } from "../../../lib/member-api";
import { Candy, Link2, UtensilsCrossed } from "lucide-react";
import {
  MemberShell,
  MCard,
  MLabel,
  MButton,
  MError,
  MacroBar,
  useMemberAuth,
} from "../../../components/member-ui";

interface Meal { name: string; items: string[] }
interface DietData {
  plan: {
    id: string;
    protocolSlug?: string;
    rationale?: string | null;
    targets: {
      kcal: number; proteinG: number; carbsG: number; fatG: number;
      coupled: boolean; intensity: string | null; meals: Meal[]; groceryList: string[];
    } | null;
    coupledDays: Array<{ day: string; intensity: string; kcal: number; carbsG: number }>;
  } | null;
  loggedToday: Array<{ at: string; kcal: number | null; text: string }>;
}

export default function DietPage() {
  const ready = useMemberAuth();
  const router = useRouter();
  const [data, setData] = useState<DietData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [food, setFood] = useState("");
  const [eaten, setEaten] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setData(await meApi<DietData>("/diet"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function logFood() {
    const text = food.trim();
    if (!text) return;
    setBusy("food");
    try {
      await meApi("/log", {
        method: "POST",
        body: JSON.stringify({ type: "INTAKE", payload: { raw: text } }),
      });
      setFood("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const ask = (q: string) => router.push(`/app/coach?agent=hearth&q=${encodeURIComponent(q)}`);

  if (!ready) return null;
  const t = data?.plan?.targets;
  const consumed = (data?.loggedToday ?? []).reduce((s, l) => s + (l.kcal ?? 0), 0);

  return (
    <MemberShell title="Your nutrition" subtitle={data?.plan?.protocolSlug ? `Protocol: ${data.plan.protocolSlug}` : undefined}>
      <MError error={error} />

      {!data?.plan && (
        <MCard>
          <p className="text-sm text-neutral-500">
            No active plan yet — your coach is preparing one. You can still ask the nutrition
            coach anything in the meantime.
          </p>
          <div className="mt-3">
            <MButton tone="diet" onClick={() => ask("What should I eat today?")}>
              Ask the nutrition coach
            </MButton>
          </div>
        </MCard>
      )}

      {t && (
        <>
          {/* Targets */}
          <MCard className="border-diet/30">
            <div className="flex items-baseline justify-between">
              <MLabel>Today&apos;s target</MLabel>
              {t.coupled && t.intensity && (
                <span className="rounded-full bg-work/10 px-2 py-0.5 font-mono text-[9px] font-bold text-work">
                  <Link2 size={10} className="mr-1 inline" />tuned for a {t.intensity} training day
                </span>
              )}
            </div>
            <p className="mt-1 text-4xl font-extrabold tracking-tight">
              {t.kcal}
              <span className="ml-1 text-sm font-normal text-neutral-500">kcal</span>
            </p>
            <div className="mt-4 space-y-2.5">
              <MacroBar label="Calories" value={consumed} target={t.kcal} tone="bg-diet" />
              <MacroBar label="Protein" value={0} target={t.proteinG} tone="bg-work" />
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">
              C {t.carbsG}g · F {t.fatG}g · logged {consumed || 0} kcal so far today
            </p>
          </MCard>

          {/* Craving SOS + quick help */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MCard onClick={() => ask("I'm craving something right now, help")} className="border-energy/30 bg-energy/5 text-center">
              <Candy size={22} strokeWidth={1.75} className="mx-auto text-energy" />
              <p className="mt-1 text-xs font-bold text-energy">Craving SOS</p>
            </MCard>
            <MCard onClick={() => ask("I'm eating out tonight — what should I order?")} className="text-center">
              <UtensilsCrossed size={22} strokeWidth={1.75} className="mx-auto text-neutral-500" />
              <p className="mt-1 text-xs font-bold">Eating out</p>
            </MCard>
          </div>

          {/* Meals */}
          <section className="mt-5">
            <MLabel>Today&apos;s meals</MLabel>
            <div className="mt-2 space-y-2">
              {t.meals.map((m, i) => {
                const key = `${i}-${m.name}`;
                const done = eaten[key];
                return (
                  <MCard key={key} className={done ? "opacity-60" : ""}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{m.name}</p>
                        <ul className="mt-1 space-y-0.5">
                          {m.items.map((it, j) => (
                            <li key={j} className="text-xs text-neutral-600">• {String(it)}</li>
                          ))}
                        </ul>
                      </div>
                      <button
                        onClick={() => setEaten((s) => ({ ...s, [key]: !s[key] }))}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                          done ? "bg-diet text-white" : "border border-neutral-300"
                        }`}
                      >
                        {done ? "Ate" : "Ate it"}
                      </button>
                    </div>
                    <button
                      onClick={() => ask(`Swap "${m.name}" for something else — same macros`)}
                      className="mt-2 text-[11px] font-semibold text-diet underline"
                    >
                      Swap this meal
                    </button>
                  </MCard>
                );
              })}
            </div>
          </section>

          {/* Week coupling */}
          {data.plan!.coupledDays.length > 0 && (
            <section className="mt-5">
              <MLabel>Your week</MLabel>
              <MCard className="mt-2">
                <div className="flex flex-wrap gap-2">
                  {data.plan!.coupledDays.map((d, i) => (
                    <div key={i} className="rounded-xl bg-neutral-50 px-2.5 py-1.5">
                      <p className="text-[10px] font-bold">{d.day}</p>
                      <p className="text-xs">{d.kcal}</p>
                      <p className="font-mono text-[9px] text-neutral-400">{d.intensity}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">
                  Calories flex with your training — more on hard days, less on rest days.
                  Protein stays the same.
                </p>
              </MCard>
            </section>
          )}

          {/* Grocery list */}
          {t.groceryList.length > 0 && (
            <section className="mt-5">
              <MLabel>Shopping list</MLabel>
              <MCard className="mt-2">
                <div className="flex flex-wrap gap-1.5">
                  {t.groceryList.map((g, i) => (
                    <span key={i} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs">
                      {g}
                    </span>
                  ))}
                </div>
              </MCard>
            </section>
          )}
        </>
      )}

      {/* Food log */}
      <section className="mt-5">
        <MLabel>Log what you ate</MLabel>
        <MCard className="mt-2">
          <div className="flex gap-2">
            <input
              value={food}
              onChange={(e) => setFood(e.target.value)}
              placeholder="e.g. 2 rotis, dal, salad"
              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
            />
            <MButton tone="diet" busy={busy === "food"} onClick={logFood} disabled={!food.trim()}>
              Log
            </MButton>
          </div>
          {(data?.loggedToday.length ?? 0) > 0 && (
            <div className="mt-3 space-y-1">
              {data!.loggedToday.map((l, i) => (
                <p key={i} className="text-xs text-neutral-600">
                  • {l.text} {l.kcal ? <span className="text-neutral-400">({l.kcal} kcal)</span> : null}
                </p>
              ))}
            </div>
          )}
        </MCard>
      </section>
    </MemberShell>
  );
}

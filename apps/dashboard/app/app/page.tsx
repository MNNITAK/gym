"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { meApi, getMemberName } from "../../lib/member-api";
import {
  MemberShell,
  MCard,
  MLabel,
  MButton,
  MError,
  useMemberAuth,
} from "../../components/member-ui";
import { WaitingState, type WarmupRoutine } from "../../components/waiting";
import { usePlanRequestLive } from "../../lib/realtime";

type Stage = "CHECKIN" | "REQUEST" | "WAITING" | "READY" | "RESTDAY";

interface Today {
  needsOnboarding?: boolean;
  stage: Stage;
  checkin: { complete: boolean; checkedIn: boolean; readiness: { band: string; summary: string } | null };
  request: { id: string; status: string; kinds: string[]; requestedAt: string; note?: string | null } | null;
  warmup: WarmupRoutine | null;
  member: {
    name: string;
    tier: string;
    currentStreak: number;
    longestStreak: number;
    renewalDate?: string | null;
  };
  gym: { name: string; classSchedule: Array<{ name: string; day: string; time: string }> };
  targets: { kcal: number; proteinG: number; coupled: boolean; intensity: string | null } | null;
  session: { day: string; focus: string; intensity: string; deload: boolean; exercises: unknown[] } | null;
  twin: { tdee: number; usesRegression: boolean } | null;
  rituals: Array<{ id: string; kind: string; prompt: string; done: boolean }>;
  loggedToday: { weight: boolean; food: number; workout: boolean; sleep: boolean };
  unreadMessages: number;
  hasPlans: { diet: boolean; training: boolean };
}

const GREETING = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function TodayPage() {
  const ready = useMemberAuth();
  const router = useRouter();
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [weight, setWeight] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await meApi<Today>("/today");
      if (res.needsOnboarding) {
        router.replace("/app/onboarding");
        return;
      }
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [router]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  // Live: the screen flips the instant the coach approves. Falls back to polling
  // on its own if the listener can't be established.
  const liveMode = usePlanRequestLive(
    data?.stage === "WAITING" ? data.request?.id : null,
    load,
  );

  async function logWeight() {
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) return;
    setBusy("weight");
    try {
      await meApi("/log", {
        method: "POST",
        body: JSON.stringify({ type: "WEIGHT", payload: { weightKg: w } }),
      });
      setWeight("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function requestPlan() {
    setBusy("request");
    try {
      await meApi("/plan-request", { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function completeRitual(id: string) {
    setBusy(id);
    try {
      await meApi("/rituals", { method: "POST", body: JSON.stringify({ ritualId: id }) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return null;
  const name = data?.member.name ?? getMemberName();
  const firstName = name.split(" ")[0] ?? name;

  return (
    <MemberShell>
      <div className="mb-5">
        <p className="text-sm text-neutral-500">{GREETING()},</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{firstName} 👋</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-work/10 px-2.5 py-1 font-mono text-[10px] font-bold text-work">
            🔥 {data?.member.currentStreak ?? 0} day streak
          </span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[10px] font-bold text-neutral-600">
            {data?.member.tier ?? "—"}
          </span>
          {(data?.unreadMessages ?? 0) > 0 && (
            <Link
              href="/app/inbox"
              className="rounded-full bg-energy px-2.5 py-1 font-mono text-[10px] font-bold text-white"
            >
              {data!.unreadMessages} new
            </Link>
          )}
        </div>
      </div>
      <MError error={error} />

      {/* Where the member is in the day. Until the coach has approved, the plan
          cards would be showing yesterday's work — so the stage takes over. */}
      {data?.stage === "CHECKIN" && (
        <MCard className="border-work/40 bg-work/5">
          <p className="text-sm font-bold">Start with your check-in</p>
          <p className="mt-1 text-xs text-neutral-600">
            A minute of questions so your coach knows what kind of day to give you.
          </p>
          <div className="mt-3">
            <MButton tone="work" onClick={() => router.push("/app/checkin")}>
              Check in for today
            </MButton>
          </div>
        </MCard>
      )}

      {data?.stage === "REQUEST" && (
        <MCard className="border-diet/40 bg-diet/5">
          <p className="text-sm font-bold">Check-in done ✓</p>
          {data.checkin.readiness && (
            <p className="mt-1 text-xs text-neutral-600">{data.checkin.readiness.summary}</p>
          )}
          <p className="mt-2 text-xs text-neutral-600">
            Ask your coach to put today&apos;s plan together.
          </p>
          <div className="mt-3">
            <MButton tone="diet" busy={busy === "request"} onClick={requestPlan}>
              Generate today&apos;s plan
            </MButton>
          </div>
        </MCard>
      )}

      {data?.stage === "WAITING" && (
        <WaitingState
          warmup={data.warmup}
          requestedAt={data.request?.requestedAt}
          kinds={data.request?.kinds}
          liveMode={liveMode}
        />
      )}

      {data?.stage === "RESTDAY" && (
        <MCard>
          <p className="text-sm font-bold">Your coach has called today a rest day 😌</p>
          <p className="mt-1 text-xs text-neutral-600">
            {data.request?.note ?? "Recovery is part of the plan. Back at it tomorrow."}
          </p>
        </MCard>
      )}

      {data?.stage === "READY" && (
        <p className="mb-3 rounded-xl bg-diet/10 px-4 py-2 text-sm text-diet">
          ✅ Your coach approved today&apos;s plan — it&apos;s below.
        </p>
      )}

      {/* Today's plan at a glance */}
      <div className="grid gap-3 sm:grid-cols-2">
        <MCard className="border-diet/30 bg-diet/5">
          <MLabel>Eat today</MLabel>
          {data?.targets ? (
            <>
              <p className="mt-1 text-3xl font-extrabold tracking-tight">
                {data.targets.kcal}
                <span className="ml-1 text-sm font-normal text-neutral-500">kcal</span>
              </p>
              <p className="text-xs text-neutral-600">
                {data.targets.proteinG}g protein
                {data.targets.coupled && data.targets.intensity
                  ? ` · tuned for a ${data.targets.intensity} day`
                  : ""}
              </p>
              <Link href="/app/diet" className="mt-3 inline-block text-xs font-semibold text-diet underline">
                See today&apos;s meals →
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">
              No plan yet — your coach is preparing it.
            </p>
          )}
        </MCard>

        <MCard className="border-work/30 bg-work/5">
          <MLabel>Train today</MLabel>
          {data?.session ? (
            <>
              <p className="mt-1 text-xl font-extrabold tracking-tight">{data.session.focus}</p>
              <p className="text-xs text-neutral-600">
                {data.session.exercises.length} exercises · {data.session.intensity}
                {data.session.deload ? " · deload week" : ""}
              </p>
              <Link
                href="/app/training"
                className="mt-3 inline-block text-xs font-semibold text-work underline"
              >
                Start session →
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">Rest day — or no plan yet.</p>
          )}
        </MCard>
      </div>

      {/* Daily rituals — two minutes, five taps */}
      {(data?.rituals.length ?? 0) > 0 && (
        <section className="mt-5">
          <MLabel>Today&apos;s check-ins</MLabel>
          <div className="mt-2 space-y-2">
            {data!.rituals.map((r) => (
              <MCard key={r.id} className={r.done ? "opacity-50" : ""}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">{r.prompt}</p>
                  {r.done ? (
                    <span className="shrink-0 text-diet">✓</span>
                  ) : (
                    <MButton size="sm" tone="ghost" busy={busy === r.id} onClick={() => completeRitual(r.id)}>
                      Done
                    </MButton>
                  )}
                </div>
              </MCard>
            ))}
          </div>
        </section>
      )}

      {/* Quick log — the tap-don't-type path */}
      <section className="mt-5">
        <MLabel>Quick log</MLabel>
        <MCard className="mt-2">
          <div className="flex gap-2">
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              placeholder={data?.loggedToday.weight ? "Weight logged today ✓" : "Today's weight (kg)"}
              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
            />
            <MButton busy={busy === "weight"} onClick={logWeight} disabled={!weight}>
              Log
            </MButton>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Chip on={data?.loggedToday.weight}>Weight</Chip>
            <Chip on={(data?.loggedToday.food ?? 0) > 0}>
              Food{(data?.loggedToday.food ?? 0) > 0 ? ` ×${data!.loggedToday.food}` : ""}
            </Chip>
            <Chip on={data?.loggedToday.workout}>Workout</Chip>
            <Chip on={data?.loggedToday.sleep}>Sleep</Chip>
          </div>
          <p className="mt-3 text-[11px] text-neutral-400">
            Easier: just tell Hearth — &ldquo;had dal and 2 rotis&rdquo; — and it gets logged for you.
          </p>
        </MCard>
      </section>

      {/* The three coaches */}
      <section className="mt-5">
        <MLabel>Your three coaches</MLabel>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { id: "hearth", emoji: "🔥", label: "Hearth", domain: "Nutrition" },
            { id: "forge", emoji: "⚒️", label: "Forge", domain: "Training" },
            { id: "anchor", emoji: "⚓", label: "Anchor", domain: "Everything" },
          ].map((a) => (
            <Link key={a.id} href={`/app/coach?agent=${a.id}`}>
              <MCard className="text-center active:scale-95">
                <p className="text-2xl">{a.emoji}</p>
                <p className="mt-1 text-xs font-bold">{a.label}</p>
                <p className="text-[9px] text-neutral-400">{a.domain}</p>
              </MCard>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-5 flex gap-2">
        <Link href="/app/gym" className="flex-1">
          <MCard className="text-center text-xs font-semibold">🏛️ Gym &amp; membership</MCard>
        </Link>
        <Link href="/app/inbox" className="flex-1">
          <MCard className="text-center text-xs font-semibold">
            ✉️ Messages{(data?.unreadMessages ?? 0) > 0 ? ` (${data!.unreadMessages})` : ""}
          </MCard>
        </Link>
      </div>
    </MemberShell>
  );
}

function Chip({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-mono font-bold ${
        on ? "bg-diet/10 text-diet" : "bg-neutral-100 text-neutral-400"
      }`}
    >
      {on ? "✓ " : "○ "}
      {children}
    </span>
  );
}

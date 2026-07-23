"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { api, getToken, idFromParam } from "../../../lib/api";
import { Nav } from "../../../components/nav";
import {
  Button,
  Card,
  ErrorNote,
  RiskBadge,
  SectionTitle,
  useRequireAuth,
} from "../../../components/ui";

interface Memory { id: string; kind: string; key: string; value: string; confidence: number }
interface Milestone { id: string; title: string; type: string; celebrated: boolean }
interface Plan { id: string; type: string; status: string; rationale?: string | null; createdAt: string }
interface MemberDetail {
  id: string;
  name: string;
  whatsappPhone: string;
  status: string;
  tier: string;
  goal?: string | null;
  currentStreak: number;
  longestStreak: number;
  startWeightKg?: number | null;
  memories: Memory[];
  milestones: Milestone[];
  plans: Plan[];
  metabolicTwin: { computedTdee: number; usesRegression: boolean; confidence: number } | null;
  churnScore: { score: number; risk: string; suggestion?: string | null } | null;
}

export default function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = idFromParam(rawId);
  const ready = useRequireAuth();
  const [m, setM] = useState<MemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setM(await api<MemberDetail>(`/members/${encodeURIComponent(id)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function generate(kind: "diet-plan" | "training-plan") {
    setBusy(kind);
    setError(null);
    setFlash(null);
    try {
      await api(`/members/${encodeURIComponent(id)}/${kind}/generate`, { method: "POST" });
      setFlash(
        `${kind === "diet-plan" ? "Diet" : "Training"} plan drafted — it's waiting in Approvals.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function scanWins() {
    setBusy("wins");
    setError(null);
    setFlash(null);
    try {
      const res = await api<{ newlyCelebrated: string[] }>(
        `/members/${encodeURIComponent(id)}/wins/scan`,
        { method: "POST" },
      );
      setFlash(
        res.newlyCelebrated.length
          ? `New win found: ${res.newlyCelebrated.join(", ")} — congrats drafted in Approvals.`
          : "No new milestones since the last scan.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return null;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link href="/members" className="text-sm text-neutral-500 hover:text-ink">
          ← Members
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">{m?.name ?? "…"}</h1>
          {m && (
            <>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-bold text-neutral-600">
                {m.tier}
              </span>
              <span className="font-mono text-xs text-work">🔥 {m.currentStreak} day streak</span>
              {m.churnScore && <RiskBadge risk={m.churnScore.risk} />}
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {m?.whatsappPhone} · {m?.goal ?? "no goal set"}
        </p>

        <ErrorNote error={error} />
        {flash && (
          <p className="mt-4 rounded-lg bg-diet/10 px-4 py-2 text-sm text-diet">{flash}</p>
        )}

        {/* Engine actions */}
        <Card className="mt-6">
          <SectionTitle>Generate with AI</SectionTitle>
          <p className="mt-2 text-sm text-neutral-600">
            Each draft conditions on this member&apos;s brain and lands at PENDING_REVIEW for you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => generate("diet-plan")} busy={busy === "diet-plan"} tone="diet">
              Draft diet plan
            </Button>
            <Button
              onClick={() => generate("training-plan")}
              busy={busy === "training-plan"}
              tone="work"
            >
              Draft training week
            </Button>
            <Button onClick={scanWins} busy={busy === "wins"} tone="ghost">
              Scan for wins
            </Button>
          </div>
        </Card>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Metabolic twin + churn */}
          <Card>
            <SectionTitle>Metabolic Twin</SectionTitle>
            {m?.metabolicTwin ? (
              <>
                <p className="mt-2 text-3xl font-extrabold tracking-tight">
                  {m.metabolicTwin.computedTdee}
                  <span className="ml-1 text-sm font-normal text-neutral-500">kcal/day</span>
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {m.metabolicTwin.usesRegression
                    ? `Individualized from this member's own logs (confidence ${(m.metabolicTwin.confidence * 100).toFixed(0)}%)`
                    : "Population formula — not enough logs yet for regression"}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-neutral-400">
                Not computed yet — run engine jobs from the Overview.
              </p>
            )}

            <div className="mt-5 border-t border-neutral-100 pt-4">
              <SectionTitle>Churn risk</SectionTitle>
              {m?.churnScore ? (
                <>
                  <p className="mt-2 flex items-center gap-2">
                    <span className="text-2xl font-extrabold">{m.churnScore.score}</span>
                    <RiskBadge risk={m.churnScore.risk} />
                  </p>
                  {m.churnScore.suggestion && (
                    <p className="mt-1 text-xs text-neutral-600">{m.churnScore.suggestion}</p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-neutral-400">Not scored yet.</p>
              )}
            </div>
          </Card>

          {/* Member memory — the switching cost */}
          <Card>
            <SectionTitle>Member memory ({m?.memories.length ?? 0})</SectionTitle>
            <p className="mt-1 text-xs text-neutral-500">
              Durable facts extracted from conversations. This is the switching cost.
            </p>
            <div className="mt-3 space-y-2">
              {(m?.memories.length ?? 0) === 0 && (
                <p className="text-sm text-neutral-400">
                  Nothing extracted yet — chat as a member, then run engine jobs.
                </p>
              )}
              {m?.memories.map((mem) => (
                <div key={mem.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-crm">
                    {mem.kind}
                  </p>
                  <p className="text-sm">
                    <span className="text-neutral-500">{mem.key}:</span> {mem.value}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Plans */}
          <Card>
            <SectionTitle>Plans ({m?.plans.length ?? 0})</SectionTitle>
            <div className="mt-3 space-y-2">
              {(m?.plans.length ?? 0) === 0 && (
                <p className="text-sm text-neutral-400">No plans yet.</p>
              )}
              {m?.plans.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {p.type}{" "}
                      <span className="font-mono text-[10px] font-normal text-neutral-500">
                        {p.status}
                      </span>
                    </p>
                    {p.rationale && (
                      <p className="truncate text-xs text-neutral-500">{p.rationale}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Milestones */}
          <Card>
            <SectionTitle>Milestones ({m?.milestones.length ?? 0})</SectionTitle>
            <div className="mt-3 space-y-2">
              {(m?.milestones.length ?? 0) === 0 && (
                <p className="text-sm text-neutral-400">No wins detected yet.</p>
              )}
              {m?.milestones.map((ms) => (
                <div key={ms.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                  <p className="text-sm font-semibold">🏆 {ms.title}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                    {ms.type}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}

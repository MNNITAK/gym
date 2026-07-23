"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Nav } from "../../components/nav";
import { Button, Card, ErrorNote, SectionTitle, RiskBadge, useRequireAuth } from "../../components/ui";
import { PlanReview, type PlanRevision } from "../../components/plan-review";
import type { EngineDecision } from "../../components/why-panel";

interface QueueItem {
  id: string;
  memberId: string;
  memberName: string;
  forDay: string;
  kinds: string[];
  status: string;
  aiSuggestion?: string | null;
  note?: string | null;
  requestedAt: string;
}

interface Detail {
  request: { id: string; status: string; kinds: string[]; aiSuggestion?: string | null; note?: string | null; forDay: string };
  member: { id: string; name: string; goal?: string | null; tier: string; currentStreak: number; longestStreak: number; startWeightKg?: number | null };
  checkin: {
    summary?: string | null;
    readiness: { score: number; band: string; flags: string[]; summary: string };
    answers: Array<{ label: string; value: string }>;
  } | null;
  twin: { tdee: number; usesRegression: boolean; confidence: number } | null;
  churn: { risk: string; score: number; suggestion?: string | null } | null;
  memories: Array<{ kind: string; key: string; value: string }>;
  weightSeries: Array<{ date: string; weightKg: number }>;
  recentCheckins: Array<{ forDay: string; summary?: string | null; readiness: string | null }>;
  previousPlans: Array<{ id: string; type: string; status: string; rationale?: string | null }>;
  draftedPlans: Array<{
    id: string; type: "DIET" | "TRAINING"; status: string;
    payload: Record<string, unknown>; rationale?: string | null;
    revisions?: PlanRevision[] | null;
    stateSnapshot?: { decisions?: EngineDecision[] } | null;
  }>;
}

const BAND: Record<string, string> = {
  green: "bg-diet/10 text-diet",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-energy/10 text-energy",
};

export default function RequestsPage() {
  const ready = useRequireAuth();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      setQueue(await api<QueueItem[]>("/requests"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api<Detail>(`/requests/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void loadQueue();
  }, [ready, loadQueue]);

  // New requests should appear without the coach reloading. Phase 4 swaps this
  // for a live listener; polling is the fallback that always works.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => void loadQueue(), 5000);
    return () => clearInterval(id);
  }, [ready, loadQueue]);

  useEffect(() => {
    if (openId) void loadDetail(openId);
    else setDetail(null);
  }, [openId, loadDetail]);

  async function act(action: string, body: Record<string, unknown> = {}) {
    if (!openId) return;
    setBusy(action);
    setError(null);
    try {
      await api(`/requests/${openId}`, {
        method: "POST",
        body: JSON.stringify({ action, ...body }),
      });
      await Promise.all([loadDetail(openId), loadQueue()]);
      if (action === "approve" || action === "decline") setOpenId(null);
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
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Plan requests</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Members who have checked in and are waiting on you.
            </p>
          </div>
          {queue.length > 0 && (
            <span className="rounded-full bg-energy px-2.5 py-1 font-mono text-[10px] font-bold text-white">
              {queue.length} waiting
            </span>
          )}
        </div>
        <ErrorNote error={error} />

        {queue.length === 0 && (
          <p className="mt-8 text-sm text-neutral-400">
            Nothing waiting. Requests appear here the moment a member asks.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {queue.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {r.memberName}{" "}
                    <span className="ml-1 rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-normal text-neutral-600">
                      {r.status}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {r.kinds.join(" + ")} · asked {timeAgo(r.requestedAt)}
                  </p>
                  {r.aiSuggestion && (
                    <p className="mt-1.5 text-sm text-neutral-700">{r.aiSuggestion}</p>
                  )}
                  {r.note && <p className="mt-1 text-xs italic text-neutral-500">“{r.note}”</p>}
                </div>
                <Button size="sm" tone={openId === r.id ? "ghost" : "ink"} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  {openId === r.id ? "Close" : "Review"}
                </Button>
              </div>

              {openId === r.id && detail && (
                <div className="mt-5 border-t border-neutral-100 pt-5">
                  {/* Readiness — the headline the coach acts on */}
                  {detail.checkin && (
                    <div className={`rounded-xl px-4 py-3 ${BAND[detail.checkin.readiness.band] ?? ""}`}>
                      <p className="text-sm font-bold">
                        {detail.checkin.readiness.band.toUpperCase()} ·{" "}
                        {Math.round(detail.checkin.readiness.score * 100)}% ready
                      </p>
                      <p className="mt-0.5 text-sm">{detail.checkin.readiness.summary}</p>
                      {detail.checkin.readiness.flags.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {detail.checkin.readiness.flags.map((f, i) => (
                            <li key={i} className="text-xs">• {f}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {/* Member context */}
                    <div>
                      <SectionTitle>Member</SectionTitle>
                      <p className="mt-1 text-sm">
                        {detail.member.goal ?? "no goal set"} · {detail.member.tier} · 🔥{" "}
                        {detail.member.currentStreak}
                      </p>
                      {detail.twin && (
                        <p className="mt-1 text-xs text-neutral-600">
                          Twin: <strong>{detail.twin.tdee} kcal</strong>{" "}
                          {detail.twin.usesRegression ? "(measured)" : "(formula)"}
                        </p>
                      )}
                      {detail.churn && (
                        <p className="mt-1 flex items-center gap-2 text-xs">
                          <RiskBadge risk={detail.churn.risk} />
                          <span className="text-neutral-500">{detail.churn.score}</span>
                        </p>
                      )}
                      {detail.weightSeries.length > 1 && (
                        <Sparkline points={detail.weightSeries} />
                      )}
                    </div>

                    {/* What the AI already knows */}
                    <div>
                      <SectionTitle>Remembered ({detail.memories.length})</SectionTitle>
                      <ul className="mt-1 space-y-1">
                        {detail.memories.slice(0, 5).map((m, i) => (
                          <li key={i} className="text-xs text-neutral-600">
                            <span className="font-mono text-[9px] uppercase text-crm">{m.kind}</span>{" "}
                            {m.value}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Today's answers */}
                  {detail.checkin && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-xs font-semibold text-work">
                        Today&apos;s check-in ({detail.checkin.answers.length} answers)
                      </summary>
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        {detail.checkin.answers.map((a, i) => (
                          <p key={i} className="text-xs text-neutral-600">
                            <span className="text-neutral-400">{a.label}:</span>{" "}
                            <strong>{a.value}</strong>
                          </p>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Generate */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button size="sm" tone="work" busy={busy === "generate"} onClick={() => act("generate", { kinds: ["TRAINING"] })}>
                      Generate workout
                    </Button>
                    <Button size="sm" tone="diet" busy={busy === "generate"} onClick={() => act("generate", { kinds: ["DIET"] })}>
                      Generate diet
                    </Button>
                    <Button size="sm" tone="ink" busy={busy === "generate"} onClick={() => act("generate", { kinds: ["TRAINING", "DIET"] })}>
                      Generate complete plan
                    </Button>
                  </div>

                  {/* Drafts — reviewed and revised with the existing panel */}
                  {detail.draftedPlans.map((p) => (
                    <div key={p.id} className="mt-4 rounded-xl border border-neutral-200 p-4">
                      <p className="text-sm font-bold">
                        {p.type}{" "}
                        <span className="font-mono text-[10px] font-normal text-neutral-500">
                          {p.status}
                        </span>
                      </p>
                      {p.rationale && <p className="mt-1 text-xs text-neutral-600">{p.rationale}</p>}
                      <PlanReview plan={p} onRevised={() => loadDetail(r.id)} />
                    </div>
                  ))}

                  {/* Decide */}
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
                    <Button
                      tone="diet"
                      busy={busy === "approve"}
                      disabled={detail.draftedPlans.length === 0}
                      onClick={() => act("approve")}
                    >
                      Approve &amp; send to member
                    </Button>
                    <Button
                      tone="ghost"
                      busy={busy === "decline"}
                      onClick={() =>
                        act("decline", {
                          note: "Your coach has reviewed today's check-in and recommends a rest day.",
                        })
                      }
                    >
                      Call it a rest day
                    </Button>
                  </div>
                  {detail.draftedPlans.length === 0 && (
                    <p className="mt-2 text-[11px] text-neutral-400">
                      Generate a plan before approving.
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)}h ago`;
}

/** Same shape as the member's progress chart — no library, just the trend. */
function Sparkline({ points }: { points: Array<{ date: string; weightKg: number }> }) {
  const w = 240;
  const h = 40;
  const vals = points.map((p) => p.weightKg);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.weightKg - min) / span) * (h - 6) - 3;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full" preserveAspectRatio="none" role="img" aria-label="Weight trend">
      <path d={d} fill="none" stroke="#12995A" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

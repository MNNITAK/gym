"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getToken } from "../../lib/api";
import { Nav } from "../../components/nav";
import { Button, Card, ErrorNote, SectionTitle, useRequireAuth } from "../../components/ui";
import { PlanReview, type PlanRevision } from "../../components/plan-review";
import type { EngineDecision } from "../../components/why-panel";

interface PendingMessage {
  id: string;
  body: string;
  member: { name: string; whatsappPhone: string } | null;
}
interface PendingPlan {
  id: string;
  type: "DIET" | "TRAINING";
  status: string;
  version?: number;
  rationale?: string | null;
  payload: Record<string, unknown>;
  revisions?: PlanRevision[] | null;
  stateSnapshot?: { decisions?: EngineDecision[] } | null;
  member: { name: string; whatsappPhone: string } | null;
}

export default function ApprovalsPage() {
  const ready = useRequireAuth();
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [plans, setPlans] = useState<PendingPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([
        api<PendingMessage[]>("/messages/pending"),
        api<PendingPlan[]>("/plans/pending"),
      ]);
      setMessages(m);
      setPlans(p);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function approveMessage(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/messages/${id}/approve`, { method: "POST" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** Approve then activate — activation is what delivers the plan to the member. */
  async function approvePlan(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/plans/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ to: "APPROVED" }),
      });
      await api(`/plans/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ to: "ACTIVE" }),
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rejectPlan(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/plans/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ to: "REJECTED", note: "Rejected by coach" }),
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return null;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Approvals</h1>
            <p className="mt-1 text-sm text-neutral-600">
              The coach gate. Nothing here has reached the member yet.
            </p>
          </div>
          <button onClick={load} className="text-sm text-work underline">
            Refresh
          </button>
        </div>
        <ErrorNote error={error} />

        <section className="mt-8">
          <SectionTitle>Plans awaiting approval ({plans.length})</SectionTitle>
          <div className="mt-3 space-y-3">
            {plans.length === 0 && <p className="text-sm text-neutral-400">Nothing pending.</p>}
            {plans.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {p.member?.name ?? "Unknown member"}{" "}
                      <span
                        className={`ml-1 rounded-full px-2 py-0.5 font-mono text-[10px] ${
                          p.type === "DIET" ? "bg-diet/10 text-diet" : "bg-work/10 text-work"
                        }`}
                      >
                        {p.type}
                      </span>
                    </p>
                    {p.rationale && (
                      <p className="mt-1 text-sm text-neutral-600">{p.rationale}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" tone="ghost" onClick={() => setOpen(open === p.id ? null : p.id)}>
                      {open === p.id ? "Hide" : "Review & revise"}
                    </Button>
                    <Button size="sm" tone="diet" busy={busy === p.id} onClick={() => approvePlan(p.id)}>
                      Approve &amp; send
                    </Button>
                    <Button size="sm" tone="ghost" busy={busy === p.id} onClick={() => rejectPlan(p.id)}>
                      Reject
                    </Button>
                  </div>
                </div>
                {open === p.id && <PlanReview plan={p} onRevised={load} />}
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <SectionTitle>Messages awaiting approval ({messages.length})</SectionTitle>
          <div className="mt-3 space-y-3">
            {messages.length === 0 && <p className="text-sm text-neutral-400">Nothing pending.</p>}
            {messages.map((m) => (
              <Card key={m.id}>
                <p className="text-xs text-neutral-500">
                  {m.member?.name} · {m.member?.whatsappPhone}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                <div className="mt-3">
                  <Button size="sm" tone="diet" busy={busy === m.id} onClick={() => approveMessage(m.id)}>
                    Approve &amp; send
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

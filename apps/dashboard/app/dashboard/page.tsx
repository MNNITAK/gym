"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Nav } from "../../components/nav";
import { Button, Card, ErrorNote, SectionTitle, Stat, useRequireAuth } from "../../components/ui";

interface Overview {
  members: number;
  activeMembers: number;
  atRiskMembers: number;
  tiers: Record<string, number>;
  avgCurrentStreak: number;
}

export default function DashboardPage() {
  const ready = useRequireAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<string | null>(null);

  // WhatsApp simulator
  const [simText, setSimText] = useState("what's my plan today?");
  const [simPhone, setSimPhone] = useState("+919000000001");
  const [simResult, setSimResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await api<Overview>("/analytics/overview"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function runJobs() {
    setBusy("jobs");
    setJobResult(null);
    setError(null);
    try {
      const res = await api<{ summary: Record<string, number> }>("/jobs/run", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setJobResult(
        Object.entries(res.summary)
          .map(([k, v]) => `${k}: ${v}`)
          .join("  ·  "),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function simulate() {
    setBusy("sim");
    setSimResult(null);
    setError(null);
    try {
      const res = await api<{ handled: boolean; intent?: string }>("/whatsapp/simulate", {
        method: "POST",
        body: JSON.stringify({ fromPhone: simPhone, text: simText }),
      });
      setSimResult(
        res.handled
          ? `Handled — classified as "${res.intent}". Check Approvals for anything coach-gated.`
          : "Ignored (duplicate message).",
      );
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
        <h1 className="text-2xl font-extrabold tracking-tight">Gym overview</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Three AI engines on one shared member brain. Nothing reaches a member without a coach.
        </p>
        <ErrorNote error={error} />

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Members" value={overview?.members ?? "—"} />
          <Stat label="Active" value={overview?.activeMembers ?? "—"} tone="text-diet" />
          <Stat
            label="At risk"
            value={overview?.atRiskMembers ?? "—"}
            tone={overview && overview.atRiskMembers > 0 ? "text-energy" : "text-ink"}
          />
          <Stat label="Avg streak" value={overview?.avgCurrentStreak ?? "—"} tone="text-work" />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <SectionTitle>Recurring engine work</SectionTitle>
            <p className="mt-2 text-sm text-neutral-600">
              Metabolic Twin recompute, churn scoring, memory extraction, ritual dispatch, win
              detection, and cross-gym pattern aggregation. Runs on a schedule in production —
              trigger it now for the demo.
            </p>
            <div className="mt-4">
              <Button onClick={runJobs} busy={busy === "jobs"} tone="ink">
                Run engine jobs
              </Button>
            </div>
            {jobResult && (
              <p className="mt-3 rounded-lg bg-diet/10 px-3 py-2 font-mono text-xs text-diet">
                {jobResult}
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle>WhatsApp simulator</SectionTitle>
            <p className="mt-2 text-sm text-neutral-600">
              Send a message as a member — the router classifies it, the concierge answers, and
              anything needing judgment lands in Approvals.
            </p>
            <input
              value={simPhone}
              onChange={(e) => setSimPhone(e.target.value)}
              className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="+919000000001"
            />
            <textarea
              value={simText}
              onChange={(e) => setSimText(e.target.value)}
              rows={2}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={simulate} busy={busy === "sim"} tone="work">
                Send as member
              </Button>
              {[
                "what's my plan today?",
                "weighed in at 81 kg today",
                "I have chest pain during squats",
              ].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setSimText(preset)}
                  className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                >
                  {preset.slice(0, 24)}…
                </button>
              ))}
            </div>
            {simResult && (
              <p className="mt-3 rounded-lg bg-work/10 px-3 py-2 text-xs text-work">{simResult}</p>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}

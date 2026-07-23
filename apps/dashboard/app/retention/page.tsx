"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Nav } from "../../components/nav";
import { Card, ErrorNote, RiskBadge, SectionTitle, useRequireAuth } from "../../components/ui";

interface AtRisk {
  memberId: string;
  name: string;
  whatsappPhone: string;
  tier: string;
  score: number;
  risk: string;
  suggestion?: string | null;
}
interface Pattern {
  id: string;
  cohort: string;
  cohortSize: number;
  successRate: number;
  observations: number;
}

export default function RetentionPage() {
  const ready = useRequireAuth();
  const [atRisk, setAtRisk] = useState<AtRisk[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        api<AtRisk[]>("/retention/at-risk"),
        api<Pattern[]>("/analytics/patterns"),
      ]);
      setAtRisk(r);
      setPatterns(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return null;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Retention</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Intervene at ~day 20 of a downward trend, not day 90.
        </p>
        <ErrorNote error={error} />

        <section className="mt-8">
          <SectionTitle>Reach out now ({atRisk.length})</SectionTitle>
          <div className="mt-3 space-y-3">
            {atRisk.length === 0 && (
              <p className="text-sm text-neutral-400">
                Nobody is at high risk. Run engine jobs from the Overview to refresh scores.
              </p>
            )}
            {atRisk.map((m) => (
              <Card key={m.memberId}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {m.name} <RiskBadge risk={m.risk} />
                      <span className="font-mono text-xs text-neutral-500">{m.score}</span>
                    </p>
                    <p className="text-xs text-neutral-500">{m.whatsappPhone}</p>
                  </div>
                  <Link
                    href={`/members/${encodeURIComponent(m.memberId)}`}
                    className="rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-semibold"
                  >
                    Open member
                  </Link>
                </div>
                {m.suggestion && (
                  <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                    {m.suggestion}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <SectionTitle>Cross-gym learning ({patterns.length})</SectionTitle>
          <p className="mt-1 text-xs text-neutral-500">
            Anonymized patterns aggregated across every gym — k-anonymized and PII-gated, so no
            member data ever crosses a tenant boundary. These become priors for every gym&apos;s AI.
          </p>
          <div className="mt-3 space-y-2">
            {patterns.length === 0 && (
              <p className="text-sm text-neutral-400">
                No cohort has reached the k-anonymity floor yet — patterns publish once at least 5
                distinct members share a cohort.
              </p>
            )}
            {patterns.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-anywhere font-mono text-xs">{p.cohort}</p>
                  <p className="text-sm">
                    <span className="font-bold text-diet">
                      {(p.successRate * 100).toFixed(0)}%
                    </span>
                    <span className="ml-2 text-xs text-neutral-500">
                      n={p.cohortSize} · {p.observations} obs
                    </span>
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

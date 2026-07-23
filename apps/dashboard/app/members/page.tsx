"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Nav } from "../../components/nav";
import { Card, ErrorNote, useRequireAuth } from "../../components/ui";

interface Member {
  id: string;
  name: string;
  whatsappPhone: string;
  status: string;
  tier: string;
  goal?: string | null;
  currentStreak: number;
}

export default function MembersPage() {
  const ready = useRequireAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await api<Member[]>("/members"));
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
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Members</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Open a member to see their brain and generate plans.
        </p>
        <ErrorNote error={error} />

        <div className="mt-6 space-y-3">
          {members.length === 0 && !error && (
            <p className="text-sm text-neutral-400">No members yet.</p>
          )}
          {members.map((m) => (
            <Link key={m.id} href={`/members/${encodeURIComponent(m.id)}`} className="block">
              <Card className="transition hover:border-ink">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-xs text-neutral-500">
                      {m.whatsappPhone} · {m.goal ?? "no goal set"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-bold text-neutral-600">
                      {m.tier}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-bold text-neutral-600">
                      {m.status}
                    </span>
                    <span className="font-mono text-xs text-work">🔥 {m.currentStreak}</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

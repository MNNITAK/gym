"use client";

import { useCallback, useEffect, useState } from "react";
import { meApi } from "../../../lib/member-api";
import {
  MemberShell,
  MCard,
  MLabel,
  MButton,
  MError,
  useMemberAuth,
} from "../../../components/member-ui";

interface Profile {
  member: {
    name: string; phone: string; goal?: string | null; sex?: string | null;
    heightCm?: number | null; startWeightKg?: number | null; joinedAt: string; tier: string;
  };
  memories: Array<{ id: string; kind: string; key: string; value: string }>;
  notes: Array<{ id: string; text: string; at: string; source: string }>;
  events: Array<{ id: string; type: string; date: string; label?: string | null }>;
  injuries: string[];
}

const KIND_LABEL: Record<string, string> = {
  PREFERENCE: "Preference",
  CONSTRAINT: "Must respect",
  INJURY: "Injury",
  LIFE_EVENT: "Life event",
  MOTIVATION: "What drives you",
  OTHER: "Other",
};

export default function MePage() {
  const ready = useMemberAuth();
  const [d, setD] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await meApi<Profile>("/profile"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function forget(id: string) {
    setBusy(id);
    try {
      await meApi(`/profile?memoryId=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return null;

  return (
    <MemberShell title="You" subtitle="Everything your coach knows — and you control.">
      <MError error={error} />

      <MCard>
        <p className="text-lg font-extrabold">{d?.member.name}</p>
        <p className="text-xs text-neutral-500">{d?.member.phone}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Fact label="Goal" value={d?.member.goal ?? "—"} />
          <Fact label="Tier" value={d?.member.tier ?? "—"} />
          <Fact label="Height" value={d?.member.heightCm ? `${d.member.heightCm} cm` : "—"} />
          <Fact label="Started at" value={d?.member.startWeightKg ? `${d.member.startWeightKg} kg` : "—"} />
          <Fact
            label="Member since"
            value={d?.member.joinedAt ? new Date(d.member.joinedAt).toDateString().slice(4) : "—"}
          />
        </div>
      </MCard>

      {/* The member brain, shown to the member */}
      <section className="mt-5">
        <MLabel>What your coach remembers</MLabel>
        <p className="mt-1 text-[11px] text-neutral-500">
          Picked up from your conversations. Every plan you get respects these. Remove anything
          that&apos;s wrong.
        </p>
        <div className="mt-2 space-y-2">
          {(d?.memories.length ?? 0) === 0 && (
            <p className="text-sm text-neutral-400">
              Nothing yet — tell a coach about your preferences and it&apos;ll remember.
            </p>
          )}
          {(d?.memories.length ?? 0) > 0 && (
            <MCard>
              <div className="space-y-3.5">
                {d!.memories.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      {/* The reference's list voice: a red dot, then the fact. */}
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{m.value}</p>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                          {KIND_LABEL[m.kind] ?? m.kind}
                        </p>
                      </div>
                    </div>
                    <MButton size="sm" tone="ghost" busy={busy === m.id} onClick={() => forget(m.id)}>
                      Forget
                    </MButton>
                  </div>
                ))}
              </div>
            </MCard>
          )}
        </div>
      </section>

      {/* Injuries */}
      {(d?.injuries.length ?? 0) > 0 && (
        <section className="mt-5">
          <MLabel>Programmed around</MLabel>
          <MCard className="mt-2 border-energy/30 bg-energy/5">
            <div className="flex flex-wrap gap-1.5">
              {d!.injuries.map((r) => (
                <span key={r} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-energy">
                  {r.replace(/_/g, " ")}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-600">
              Your training avoids loading these. Tell your training coach when they feel better.
            </p>
          </MCard>
        </section>
      )}

      {/* Upcoming life events */}
      {(d?.events.length ?? 0) > 0 && (
        <section className="mt-5">
          <MLabel>Coming up</MLabel>
          <div className="mt-2 space-y-2">
            {d!.events.map((e) => (
              <MCard key={e.id}>
                <p className="text-sm font-bold">
                  {e.type.charAt(0) + e.type.slice(1).toLowerCase()}
                  {e.label ? ` — ${e.label}` : ""}
                </p>
                <p className="text-xs text-neutral-500">
                  {new Date(e.date).toDateString().slice(4)} · your plan flexes around this
                </p>
              </MCard>
            ))}
          </div>
        </section>
      )}

      {/* Notes */}
      {(d?.notes.length ?? 0) > 0 && (
        <section className="mt-5">
          <MLabel>Your notes</MLabel>
          <div className="mt-2 space-y-2">
            {d!.notes.slice(0, 8).map((n) => (
              <MCard key={n.id}>
                <p className="text-sm text-neutral-700">{n.text}</p>
                <p className="mt-1 font-mono text-[10px] text-neutral-400">
                  {new Date(n.at).toDateString().slice(4)}
                </p>
              </MCard>
            ))}
          </div>
        </section>
      )}
    </MemberShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

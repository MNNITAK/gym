"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { meApi } from "../../../lib/member-api";
import {
  MemberShell,
  MCard,
  MLabel,
  MButton,
  MError,
  useMemberAuth,
} from "../../../components/member-ui";

interface GymData {
  gym: { name?: string; city?: string; timezone?: string };
  classSchedule: Array<{ name: string; day: string; time: string; coach?: string }>;
  policies: Record<string, string>;
  membership: { status: string; tier: string; joinedAt: string; renewalDate: string | null };
}

export default function GymPage() {
  const ready = useMemberAuth();
  const router = useRouter();
  const [d, setD] = useState<GymData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await meApi<GymData>("/gym"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const ask = (q: string) => router.push(`/app/coach?agent=anchor&q=${encodeURIComponent(q)}`);

  if (!ready) return null;
  const renewal = d?.membership.renewalDate ? new Date(d.membership.renewalDate) : null;
  const daysToRenewal = renewal
    ? Math.ceil((renewal.getTime() - Date.now()) / 864e5)
    : null;

  return (
    <MemberShell title={d?.gym.name ?? "Your gym"} subtitle={d?.gym.city ?? undefined}>
      <MError error={error} />

      {/* Membership */}
      <MCard>
        <MLabel>Membership</MLabel>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-lg font-extrabold">{d?.membership.tier}</span>
          <span className="rounded-full bg-diet/10 px-2 py-0.5 font-mono text-[10px] font-bold text-diet">
            {d?.membership.status}
          </span>
        </div>
        {renewal && (
          <p className="mt-2 text-sm text-neutral-600">
            Renews {renewal.toDateString().slice(4)}
            {daysToRenewal != null && daysToRenewal >= 0 ? ` · in ${daysToRenewal} days` : ""}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <MButton size="sm" tone="ghost" onClick={() => ask("When is my fee due?")}>
            Fees
          </MButton>
          <MButton size="sm" tone="ghost" onClick={() => ask("I need to pause my membership")}>
            Pause membership
          </MButton>
          <MButton size="sm" tone="ghost" onClick={() => ask("I have a question about my membership")}>
            Something else
          </MButton>
        </div>
        <p className="mt-2 text-[11px] text-neutral-400">
          Requests go to gym staff — a person handles anything that changes your membership.
        </p>
      </MCard>

      {/* Classes */}
      <section className="mt-5">
        <MLabel>Class timetable</MLabel>
        <div className="mt-2 space-y-2">
          {(d?.classSchedule.length ?? 0) === 0 && (
            <p className="text-sm text-neutral-400">No classes listed yet.</p>
          )}
          {d?.classSchedule.map((c, i) => (
            <MCard key={i}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{c.name}</p>
                  <p className="text-xs text-neutral-500">
                    {c.day} · {c.time}
                    {c.coach ? ` · ${c.coach}` : ""}
                  </p>
                </div>
                <MButton size="sm" tone="ghost" onClick={() => ask(`I'd like to book ${c.name} on ${c.day}`)}>
                  Book
                </MButton>
              </div>
            </MCard>
          ))}
        </div>
      </section>

      {/* Policies */}
      {Object.keys(d?.policies ?? {}).length > 0 && (
        <section className="mt-5">
          <MLabel>Good to know</MLabel>
          <div className="mt-2 space-y-2">
            {Object.entries(d!.policies).map(([k, v]) => (
              <MCard key={k}>
                <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  {k.replace(/([A-Z])/g, " $1")}
                </p>
                <p className="mt-1 text-sm text-neutral-700">{v}</p>
              </MCard>
            ))}
          </div>
        </section>
      )}
    </MemberShell>
  );
}

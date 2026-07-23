"use client";

import { useEffect, useState } from "react";
import { MCard, MLabel } from "./member-ui";

export interface WarmupRoutine {
  slug: string;
  name: string;
  totalMinutes: number;
  focus: string;
  steps: Array<{ name: string; duration: string; cue: string }>;
}

/**
 * Shown while the coach reviews today's data. An empty "please wait" screen is
 * the worst moment in the flow, so the wait is turned into warm-up work — the
 * member arrives at their session already prepared, and the delay reads as part
 * of the service rather than a failure.
 */
const MESSAGES = [
  "Your coach is reviewing today's check-in…",
  "Looking at your recovery and this week's training…",
  "Preparing today's personalised plan…",
  "Almost there — meanwhile, work through the warm-up below.",
];

export function WaitingState({
  warmup,
  requestedAt,
  kinds,
}: {
  warmup: WarmupRoutine | null;
  requestedAt?: string | Date | null;
  kinds?: string[];
}) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [done, setDone] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const id = setInterval(() => setMessageIndex((i) => (i + 1) % MESSAGES.length), 4000);
    return () => clearInterval(id);
  }, []);

  const waitingSince = requestedAt ? new Date(requestedAt) : null;
  const mins = waitingSince
    ? Math.max(0, Math.round((Date.now() - waitingSince.getTime()) / 60000))
    : null;

  const completed = Object.values(done).filter(Boolean).length;
  const total = warmup?.steps.length ?? 0;

  return (
    <>
      <MCard className="border-work/30 bg-work/5">
        <div className="flex items-start gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0 translate-y-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-work opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-work" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">With your coach now</p>
            <p className="mt-0.5 text-sm text-neutral-600 transition-opacity">
              {MESSAGES[messageIndex]}
            </p>
            <p className="mt-1.5 font-mono text-[10px] text-neutral-400">
              {kinds?.length ? `${kinds.join(" + ")} requested` : "Plan requested"}
              {mins !== null ? ` · ${mins === 0 ? "just now" : `${mins} min ago`}` : ""}
            </p>
          </div>
        </div>
      </MCard>

      {warmup && (
        <section className="mt-5">
          <div className="flex items-baseline justify-between">
            <MLabel>Warm up while you wait</MLabel>
            <span className="font-mono text-[10px] text-neutral-500">
              {completed}/{total}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {warmup.name} · {warmup.totalMinutes} min · {warmup.focus}
          </p>

          <div className="mt-3 space-y-2">
            {warmup.steps.map((s, i) => (
              <MCard key={i} className={done[i] ? "opacity-55" : ""}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">
                      {s.name}{" "}
                      <span className="font-mono text-[10px] font-normal text-neutral-400">
                        {s.duration}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600">{s.cue}</p>
                  </div>
                  <button
                    onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                      done[i] ? "bg-work text-white" : "border border-neutral-300"
                    }`}
                  >
                    {done[i] ? "✓" : "Done"}
                  </button>
                </div>
              </MCard>
            ))}
          </div>

          {completed === total && total > 0 && (
            <p className="mt-3 rounded-xl bg-diet/10 px-4 py-2.5 text-center text-sm text-diet">
              Warm-up complete — you&apos;re ready to go the moment your plan lands.
            </p>
          )}
        </section>
      )}
    </>
  );
}

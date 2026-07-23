"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { meApi, getMemberName } from "../../../lib/member-api";
import { MemberShell, MCard, MLabel, useMemberAuth } from "../../../components/member-ui";

interface Summary {
  member: { name: string; tier: string; currentStreak: number };
  unreadMessages: number;
}

/**
 * One predictable place for everything that isn't part of the daily loop.
 * The tab bar stays at five items; this absorbs the rest rather than scattering
 * links across other screens.
 */
const SECTIONS = [
  {
    title: "Progress",
    items: [
      { href: "/app/progress", icon: "📈", label: "Progress", hint: "Weight, metabolism, wins" },
      { href: "/app/measurements", icon: "📏", label: "Measurements", hint: "Waist, chest, arms" },
      { href: "/app/calendar", icon: "🗓️", label: "Calendar", hint: "Every day you showed up" },
      { href: "/app/history", icon: "🕘", label: "History", hint: "Past plans and check-ins" },
    ],
  },
  {
    title: "You",
    items: [
      { href: "/app/me", icon: "🧠", label: "What your coach knows", hint: "Facts, injuries, events" },
      { href: "/app/settings", icon: "⚙️", label: "Settings", hint: "Profile, training time, password" },
    ],
  },
  {
    title: "Your gym",
    items: [
      { href: "/app/gym", icon: "🏛️", label: "Gym & membership", hint: "Classes, fees, policies" },
      { href: "/app/inbox", icon: "✉️", label: "Messages", hint: "From your coach" },
    ],
  },
];

export default function MorePage() {
  const ready = useMemberAuth();
  const [data, setData] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await meApi<Summary>("/today"));
    } catch {
      /* the hub still works without the header numbers */
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (!ready) return null;
  const name = data?.member.name ?? getMemberName();

  return (
    <MemberShell>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">{name.split(" ")[0]}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-work/10 px-2.5 py-1 font-mono text-[10px] font-bold text-work">
            🔥 {data?.member.currentStreak ?? 0} day streak
          </span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[10px] font-bold text-neutral-600">
            {data?.member.tier ?? "—"}
          </span>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-5">
          <MLabel>{section.title}</MLabel>
          <div className="mt-2 space-y-2">
            {section.items.map((item) => (
              <Link key={item.href} href={item.href}>
                <MCard className="transition active:scale-[0.99]">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">
                        {item.label}
                        {item.href === "/app/inbox" && (data?.unreadMessages ?? 0) > 0 && (
                          <span className="ml-2 rounded-full bg-energy px-1.5 py-0.5 font-mono text-[9px] text-white">
                            {data!.unreadMessages}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-neutral-500">{item.hint}</p>
                    </div>
                    <span className="text-neutral-300">›</span>
                  </div>
                </MCard>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </MemberShell>
  );
}

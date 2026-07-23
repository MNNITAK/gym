"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Building2,
  CalendarDays,
  ChevronRight,
  Flame,
  History,
  Mail,
  Ruler,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
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
const SECTIONS: Array<{
  title: string;
  items: Array<{ href: string; Icon: LucideIcon; label: string; hint: string }>;
}> = [
  {
    title: "Progress",
    items: [
      { href: "/app/progress", Icon: TrendingUp, label: "Progress", hint: "Weight, metabolism, wins" },
      { href: "/app/measurements", Icon: Ruler, label: "Measurements", hint: "Waist, chest, arms" },
      { href: "/app/calendar", Icon: CalendarDays, label: "Calendar", hint: "Every day you showed up" },
      { href: "/app/history", Icon: History, label: "History", hint: "Past plans and check-ins" },
    ],
  },
  {
    title: "You",
    items: [
      { href: "/app/me", Icon: Brain, label: "What your coach knows", hint: "Facts, injuries, events" },
      { href: "/app/settings", Icon: Settings, label: "Settings", hint: "Profile, training time, password" },
    ],
  },
  {
    title: "Your gym",
    items: [
      { href: "/app/gym", Icon: Building2, label: "Gym & membership", hint: "Classes, fees, policies" },
      { href: "/app/inbox", Icon: Mail, label: "Messages", hint: "From your coach" },
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
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-subtle px-2.5 py-1 font-mono text-[10px] font-bold text-brand">
            <Flame size={11} /> {data?.member.currentStreak ?? 0} day streak
          </span>
          <span className="rounded-full border border-neutral-300 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            {data?.member.tier ?? "—"} tier
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
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                      <item.Icon size={17} strokeWidth={1.75} />
                    </span>
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
                    <ChevronRight size={16} className="text-neutral-300" />
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

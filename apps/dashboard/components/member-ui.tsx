"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearMemberSession, getMemberToken } from "../lib/member-api";

// ── Member panel chrome ──────────────────────────────────────────────────────
// Mobile-first: this is a phone app that happens to run in a browser, so the
// primary navigation is a thumb-reachable bottom bar.

const TABS = [
  { href: "/app", label: "Today", icon: "🏠" },
  { href: "/app/diet", label: "Diet", icon: "🥗" },
  { href: "/app/training", label: "Train", icon: "🏋️" },
  { href: "/app/coach", label: "Coach", icon: "💬" },
  { href: "/app/progress", label: "Progress", icon: "📈" },
];

export function useMemberAuth(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getMemberToken()) router.push("/app/login");
    else setReady(true);
  }, [router]);
  return ready;
}

export function MemberShell({
  children,
  title,
  subtitle,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-paper pb-24">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
          <Link href="/app" className="font-mono text-[10px] uppercase tracking-widest text-brand">
            KEYSTONE
          </Link>
          <div className="flex-1" />
          <Link href="/app/me" className="text-sm text-neutral-500 hover:text-ink">
            Me
          </Link>
          <button
            onClick={() => {
              clearMemberSession();
              router.push("/app/login");
            }}
            className="text-sm text-neutral-400 hover:text-ink"
          >
            Exit
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6">
        {(title || action) && (
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              {title && <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>}
              {subtitle && <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((t) => {
            const active = t.href === "/app" ? pathname === "/app" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${
                  active ? "text-ink" : "text-neutral-400"
                }`}
              >
                <span className={`text-lg ${active ? "" : "opacity-60"}`}>{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function MCard({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-neutral-200 bg-white p-4 ${onClick ? "cursor-pointer active:scale-[0.99]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function MLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">{children}</p>
  );
}

export function MButton({
  children,
  onClick,
  busy,
  disabled,
  tone = "ink",
  full,
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "ink" | "diet" | "work" | "energy" | "ghost";
  full?: boolean;
  size?: "sm" | "md";
}) {
  const tones: Record<string, string> = {
    ink: "bg-ink text-white",
    diet: "bg-diet text-white",
    work: "bg-work text-white",
    energy: "bg-energy text-white",
    ghost: "border border-neutral-300 text-ink bg-white",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`rounded-full font-semibold transition active:scale-95 disabled:opacity-50 ${tones[tone]} ${
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-5 py-3 text-sm"
      } ${full ? "w-full" : ""}`}
    >
      {busy ? "…" : children}
    </button>
  );
}

export function MError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-3 rounded-xl bg-energy/10 px-4 py-2 text-sm text-energy">{error}</p>;
}

export function MacroBar({
  label,
  value,
  target,
  tone,
}: {
  label: string;
  value: number;
  target: number;
  tone: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {label}
        </span>
        <span className="text-xs font-semibold">
          {Math.round(value)}
          <span className="font-normal text-neutral-400">/{Math.round(target)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

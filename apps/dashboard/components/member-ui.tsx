"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  UtensilsCrossed,
  Dumbbell,
  MessageCircle,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { clearMemberSession, getMemberToken } from "../lib/member-api";
import { Wordmark, ThemeToggle } from "./brand";

// ── Member panel chrome ──────────────────────────────────────────────────────
// Mobile-first: this is a phone app that happens to run in a browser, so the
// primary navigation is a thumb-reachable bottom bar. One icon language
// (Lucide) across the whole product; the active tab is the one place the
// bottom bar is allowed to spend red.

const TABS: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: "/app", label: "Today", Icon: Home },
  { href: "/app/diet", label: "Diet", Icon: UtensilsCrossed },
  { href: "/app/training", label: "Train", Icon: Dumbbell },
  { href: "/app/coach", label: "Coach", Icon: MessageCircle },
  // Progress, Calendar, History, Measurements, Settings, Gym and Messages all
  // live behind More — five thumb-sized targets is the practical limit.
  { href: "/app/more", label: "More", Icon: LayoutGrid },
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
    <div
      className="min-h-screen bg-paper"
      // Clear the fixed tab bar plus any home-indicator inset.
      style={{ paddingBottom: "calc(5.5rem + var(--safe-bottom))" }}
    >
      <header
        className="sticky top-0 border-b border-neutral-200 bg-white/90 backdrop-blur"
        style={{ zIndex: "var(--ks-z-nav)" as never }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-5">
          <Link href="/app" aria-label="Today">
            <Wordmark size={13} />
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
          <button
            onClick={() => {
              clearMemberSession();
              router.push("/app/login");
            }}
            className="text-sm text-neutral-400 transition hover:text-ink"
          >
            Exit
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 sm:px-5 sm:py-6">
        {(title || action) && (
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {title && (
                <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
              )}
              {subtitle && <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: "var(--safe-bottom)", zIndex: "var(--ks-z-nav)" as never }}
      >
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((t) => {
            const active = t.href === "/app" ? pathname === "/app" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[10px] font-semibold transition duration-fast ${
                  active ? "text-brand" : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                {/* Active indicator — a short bar above the icon, brand red. */}
                <span
                  className={`absolute top-0 h-0.5 w-8 rounded-full bg-primary transition-opacity duration-fast ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <t.Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
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
      className={`rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs transition-shadow duration-fast ${onClick ? "cursor-pointer active:scale-[0.99] hover:shadow-sm" : ""} ${className}`}
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
  // `ink` is the primary tone everywhere in the panel — it carries the brand
  // red. One loud action per screen; everything else is ghost or an engine hue.
  const tones: Record<string, string> = {
    ink: "bg-primary text-on-primary hover:bg-primary-hover shadow-brand",
    diet: "bg-diet text-white hover:opacity-90",
    work: "bg-work text-white hover:opacity-90",
    energy: "bg-energy text-white hover:opacity-90",
    ghost: "border border-neutral-300 text-ink bg-surface hover:border-neutral-400",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`rounded-lg font-bold uppercase tracking-wider transition duration-fast ease-standard active:scale-[0.98] disabled:opacity-50 disabled:shadow-none ${tones[tone]} ${
        size === "sm" ? "px-3 py-1.5 text-[11px]" : "px-5 py-3 text-xs"
      } ${full ? "w-full" : ""}`}
    >
      {busy ? "…" : children}
    </button>
  );
}

export function MError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-3 animate-rise rounded-xl border border-critical/15 bg-critical-subtle px-4 py-2 text-sm text-critical">
      {error}
    </p>
  );
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

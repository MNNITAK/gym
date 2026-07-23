"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import { Monogram } from "./brand";

/* ============================================================================
   KEYSTONE design system — component kit
   ----------------------------------------------------------------------------
   The reusable vocabulary for every future screen. The rules these encode:

   - Red is spent, not sprinkled: one primary action per view.
   - Nothing is ever blank: loading has skeletons, absence has EmptyState,
     failure has ErrorState with a retry — all three look designed.
   - Motion is composited-only and every entrance uses the same curve.
   - Every interactive element inherits the global focus-visible ring.

   The legacy primitives in ui.tsx (coach) and member-ui.tsx (member) remain
   the compatibility layer for existing screens; new screens compose from here.
   ========================================================================= */

/* ── Badge ─────────────────────────────────────────────────────────────── */

const BADGE_TONES = {
  neutral: "bg-neutral-100 text-neutral-600",
  primary: "bg-primary-subtle text-brand",
  positive: "bg-positive-subtle text-positive",
  caution: "bg-caution-subtle text-caution-text",
  critical: "bg-critical-subtle text-critical",
  hearth: "bg-hearth-subtle text-hearth-text",
  forge: "bg-forge/10 text-forge-text",
  anchor: "bg-anchor/10 text-anchor-text",
} as const;

export function Badge({
  children,
  tone = "neutral",
  dot,
}: {
  children: React.ReactNode;
  tone?: keyof typeof BADGE_TONES;
  /** A live indicator — the dot pulses. Use for realtime states only. */
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${BADGE_TONES[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ── Alert ─────────────────────────────────────────────────────────────── */

const ALERT_TONES: Record<
  string,
  { box: string; Icon: LucideIcon }
> = {
  info: { box: "bg-forge/10 text-forge-text border-forge/20", Icon: Info },
  positive: { box: "bg-positive-subtle text-positive border-positive/20", Icon: CheckCircle2 },
  caution: { box: "bg-caution-subtle text-caution-text border-caution/25", Icon: AlertTriangle },
  critical: { box: "bg-critical-subtle text-critical border-critical/20", Icon: AlertTriangle },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { box, Icon } = ALERT_TONES[tone]!;
  return (
    <div role="alert" className={`animate-rise rounded-xl border px-4 py-3 ${box}`}>
      <div className="flex gap-3">
        <Icon size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          {title && <p className="font-bold">{title}</p>}
          <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
        </div>
        {action}
      </div>
    </div>
  );
}

/* ── Loading: skeletons and the branded spinner ────────────────────────── */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`ks-skeleton ${className}`} />;
}

/** A card-shaped placeholder that matches the real card geometry. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`mt-2.5 h-4 ${i === lines - 1 ? "w-1/2" : "w-5/6"}`} />
      ))}
    </div>
  );
}

/** Full-section loading: a stack of skeleton cards, never a blank page. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** The branded spinner — the monogram breathing. For inline waits only;
    whole sections should use skeletons instead. */
export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-neutral-500">
      <span className="animate-pulse-dot">
        <Monogram size={size} />
      </span>
      {label}
    </span>
  );
}

/* ── Empty state ───────────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-rise rounded-2xl border border-dashed border-neutral-300 bg-surface-sunken px-6 py-10 text-center">
      {Icon && (
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <Icon size={22} strokeWidth={1.75} />
        </span>
      )}
      <p className="text-sm font-bold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-xs text-sm text-neutral-500">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ── Error state — calm, explains, always offers a way forward ─────────── */

export function ErrorState({
  title = "Something didn't load",
  detail,
  onRetry,
}: {
  title?: string;
  detail?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="animate-rise rounded-2xl border border-critical/20 bg-critical-subtle px-6 py-8 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-critical/10 text-critical">
        <AlertTriangle size={22} strokeWidth={1.75} />
      </span>
      <p className="text-sm font-bold text-ink">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-600">{detail}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95"
        >
          <RefreshCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}

/* ── Progress ──────────────────────────────────────────────────────────── */

export function ProgressBar({
  value,
  max = 100,
  tone = "bg-primary",
  className = "",
}: {
  value: number;
  max?: number;
  tone?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`h-1.5 overflow-hidden rounded-full bg-neutral-100 ${className}`}
    >
      <div
        className={`h-full rounded-full ${tone} transition-all duration-slow ease-standard`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A ring for single headline metrics — readiness, adherence, completion. */
export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 5,
  label,
}: {
  /** 0–1 */
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: React.ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={strokeWidth}
          className="fill-none stroke-neutral-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          className="fill-none stroke-[rgb(var(--ks-brand))] transition-all duration-deliberate ease-entrance"
        />
      </svg>
      {label && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-extrabold tabular">
          {label}
        </span>
      )}
    </span>
  );
}

/* ── Success moment — tasteful, brief, never confetti ──────────────────── */

export function SuccessMoment({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="animate-pop rounded-2xl border border-positive/20 bg-positive-subtle px-6 py-6 text-center">
      <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-positive text-white">
        <CheckCircle2 size={24} />
      </span>
      <p className="text-sm font-extrabold text-ink">{title}</p>
      {detail && <p className="mt-0.5 text-sm text-neutral-600">{detail}</p>}
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center"
      style={{ zIndex: "var(--ks-z-modal)" as never }}
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: `rgb(var(--ks-scrim) / var(--ks-scrim-opacity))` }}
        onClick={onClose}
      />
      <div className="relative m-0 w-full animate-rise rounded-t-2xl border border-neutral-200 bg-surface-raised p-5 shadow-xl sm:m-4 sm:max-w-lg sm:animate-scale-in sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          {title && <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>}
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-3">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────────── */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: React.ReactNode }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-full bg-neutral-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 rounded-full px-4 py-1.5 text-sm font-semibold transition duration-fast ${
            value === t.id ? "bg-surface text-ink shadow-xs" : "text-neutral-500 hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Form field ────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-neutral-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <span className="mt-1 block text-[11px] text-neutral-400">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] font-medium text-critical">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-neutral-300 bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-neutral-400 transition duration-fast focus:border-neutral-400";

/* ── Toast ─────────────────────────────────────────────────────────────── */

let notify: ((msg: string, tone?: "positive" | "critical" | "neutral") => void) | null = null;

/** Fire a toast from anywhere: `toast("Plan approved", "positive")`. A single
    <Toaster /> must be mounted in the shell. */
export function toast(msg: string, tone: "positive" | "critical" | "neutral" = "neutral") {
  notify?.(msg, tone);
}

export function Toaster() {
  const [items, setItems] = useState<Array<{ id: number; msg: string; tone: string }>>([]);

  useEffect(() => {
    notify = (msg, tone = "neutral") => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, msg, tone }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3500);
    };
    return () => {
      notify = null;
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4"
      style={{ zIndex: "var(--ks-z-toast)" as never, paddingBottom: "calc(1rem + var(--safe-bottom))" }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex animate-rise items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-lg ${
            t.tone === "positive"
              ? "border-positive/20 bg-surface-raised text-positive"
              : t.tone === "critical"
                ? "border-critical/20 bg-surface-raised text-critical"
                : "border-neutral-200 bg-surface-raised text-ink"
          }`}
        >
          {t.tone === "positive" && <CheckCircle2 size={15} />}
          {t.tone === "critical" && <AlertTriangle size={15} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

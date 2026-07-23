"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "../lib/api";

/** Redirect to /login unless a staff token is present. Returns false until checked. */
export function useRequireAuth(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken()) router.push("/login");
    else setReady(true);
  }, [router]);
  return ready;
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-shadow duration-fast hover:shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-xs uppercase tracking-widest text-neutral-500">{children}</h2>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <Card>
      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>
      <p className={`tabular mt-1 text-3xl font-extrabold tracking-tight ${tone ?? "text-ink"}`}>{value}</p>
    </Card>
  );
}

/**
 * Button tones, post-rebrand. `ink` is the de-facto primary throughout the
 * console, so it now carries Signal Red — one loud action per view, exactly
 * what the red is budgeted for. The engine/status tones fill with their own
 * hue; `ghost` is the always-safe secondary.
 */
export function Button({
  children,
  onClick,
  busy,
  disabled,
  tone = "ink",
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "ink" | "diet" | "work" | "energy" | "ghost";
  size?: "sm" | "md";
}) {
  const tones: Record<string, string> = {
    ink: "bg-primary text-on-primary hover:bg-primary-hover shadow-brand",
    diet: "bg-diet text-white hover:opacity-90",
    work: "bg-work text-white hover:opacity-90",
    energy: "bg-energy text-white hover:opacity-90",
    ghost: "border border-neutral-300 bg-surface text-ink hover:border-neutral-400",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`rounded-full font-semibold transition duration-fast ease-standard active:scale-[0.97] disabled:opacity-50 disabled:shadow-none ${tones[tone]} ${
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm"
      }`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const tone =
    risk === "CRITICAL"
      ? "bg-critical-subtle text-critical"
      : risk === "HIGH"
        ? "bg-hearth-subtle text-hearth-text"
        : risk === "MEDIUM"
          ? "bg-caution-subtle text-caution-text"
          : "bg-positive-subtle text-diet";
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${tone}`}>
      {risk}
    </span>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-4 animate-rise rounded-lg border border-critical/15 bg-critical-subtle px-4 py-2 text-sm text-critical">
      {error}
    </p>
  );
}

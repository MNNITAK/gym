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
    <div className={`rounded-xl border border-neutral-200 bg-white p-5 ${className}`}>
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
      <p className={`mt-1 text-3xl font-extrabold tracking-tight ${tone ?? "text-ink"}`}>{value}</p>
    </Card>
  );
}

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
    ink: "bg-ink text-white",
    diet: "bg-diet text-white",
    work: "bg-work text-white",
    energy: "bg-energy text-white",
    ghost: "border border-neutral-300 text-ink",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`rounded-full font-semibold transition disabled:opacity-50 ${tones[tone]} ${
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
      ? "bg-energy/10 text-energy"
      : risk === "HIGH"
        ? "bg-orange-100 text-orange-700"
        : risk === "MEDIUM"
          ? "bg-amber-100 text-amber-700"
          : "bg-diet/10 text-diet";
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${tone}`}>
      {risk}
    </span>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="mt-4 rounded-lg bg-energy/10 px-4 py-2 text-sm text-energy">{error}</p>
  );
}

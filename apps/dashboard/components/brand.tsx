"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/* ============================================================================
   KEYSTONE brand marks
   ----------------------------------------------------------------------------
   The monogram is a keystone — the wedge at the crown of an arch. Every other
   stone leans on it; remove it and the arch falls. That is the product's own
   claim (the system the gym runs on), drawn as a mark that survives at 16px.

   The wedge is cut with a horizontal slot: an arch's spring line, and at small
   sizes it reads as a barbell. One mark, one accent colour, no gradients.

   Usage:
     <Monogram />           — the wedge alone (app icon, favicon, avatars)
     <Wordmark />           — wedge + KEYSTONE lockup (headers, login, decks)
   ========================================================================= */

export function Monogram({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      {/* Keystone wedge — wider at the crown, tapering to the seat. */}
      <path
        d="M6.8 3.5 h18.4 a2.2 2.2 0 0 1 2.15 2.68 l-4.35 19.4 a3 3 0 0 1-2.93 2.34 h-8.14 a3 3 0 0 1-2.93-2.34 L4.65 6.18 A2.2 2.2 0 0 1 6.8 3.5 Z"
        className="fill-[rgb(var(--ks-brand))]"
      />
      {/* Spring-line slot — negative space, cuts through the wedge. */}
      <rect x="10.6" y="13.6" width="10.8" height="3.4" rx="1.7" className="fill-[rgb(var(--ks-canvas))]" />
    </svg>
  );
}

export function Wordmark({
  size = 18,
  className = "",
  sub,
}: {
  size?: number;
  className?: string;
  /** Optional surface label under the lockup, e.g. "Coach console". */
  sub?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Monogram size={size + 4} />
      <span className="leading-none">
        <span
          className="block font-extrabold uppercase tracking-[0.18em] text-ink"
          style={{ fontSize: size * 0.72 }}
        >
          Keystone
        </span>
        {sub && (
          <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-widest text-neutral-500">
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}

/* ============================================================================
   Theme toggle — light and dark are equal citizens; this is the switch.
   The pre-paint script in layout.tsx has already set data-theme, so the
   first render just reads it back.
   ========================================================================= */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ks-theme", next);
    } catch {
      /* private mode — the choice just won't persist */
    }
    setTheme(next);
  }, []);

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-ink ${className}`}
    >
      {/* Render both and let CSS pick — avoids a hydration flicker. */}
      <Sun size={16} className="hidden [html[data-theme=dark]_&]:block" />
      <Moon size={16} className="block [html[data-theme=dark]_&]:hidden" />
    </button>
  );
}

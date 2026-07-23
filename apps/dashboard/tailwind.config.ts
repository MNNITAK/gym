import type { Config } from "tailwindcss";

/**
 * KEYSTONE design system — Tailwind binding.
 *
 * Every colour here resolves through the token layer in styles/tokens.css.
 * That indirection is the whole trick: the 25 screens written before the
 * design system existed keep their markup (`bg-white`, `text-ink`,
 * `border-neutral-200`, `bg-diet`) and inherit the brand — including the
 * dark theme — because the *names they already use* now point at tokens.
 *
 * Rules of the palette:
 *  - `primary` (Signal Red) is the only colour allowed to demand attention.
 *    It marks primary actions, live states, progress and achievement.
 *  - `hearth` / `forge` / `anchor` code the three AI engines in data and
 *    plans; they are held at lower chroma than the red on purpose.
 *  - Everything structural is `neutral` / `surface` / `canvas`.
 */
const t = (name: string) => `rgb(var(--ks-${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /* ── Semantic surfaces & text ─────────────────────────────────── */
        canvas: t("canvas"),
        surface: {
          DEFAULT: t("surface"),
          sunken: t("surface-sunken"),
          raised: t("surface-raised"),
          inverse: t("surface-inverse"),
        },

        /* ── Brand ────────────────────────────────────────────────────── */
        primary: {
          DEFAULT: t("brand"),
          hover: t("brand-hover"),
          subtle: t("brand-subtle"),
        },
        "on-primary": t("on-brand"),

        /* ── Engine accents ───────────────────────────────────────────── */
        hearth: { DEFAULT: t("hearth"), text: t("hearth-text"), subtle: t("hearth-subtle") },
        forge: { DEFAULT: t("forge"), text: t("forge-text") },
        anchor: { DEFAULT: t("anchor"), text: t("anchor-text") },

        /* ── Status ───────────────────────────────────────────────────── */
        positive: { DEFAULT: t("positive"), subtle: t("positive-subtle") },
        caution: { DEFAULT: t("caution"), subtle: t("caution-subtle"), text: t("caution-text") },
        critical: { DEFAULT: t("critical"), subtle: t("critical-subtle") },
        info: t("info"),

        /* ── Legacy names, rebound ────────────────────────────────────── */
        /* Screens written before the system used these. They now resolve
           to tokens, which is what retrofits every existing screen. */
        ink: t("text"),
        paper: t("canvas"),
        brand: t("brand-text"),
        diet: t("positive"),
        work: t("forge"),
        energy: t("critical"),
        crm: t("info"),

        /* `bg-white` was always "card surface" in this codebase; binding it
           to the surface token is what makes cards theme themselves. */
        white: t("surface"),

        /* Warm graphite ramp, mirrored in dark mode by the token layer. */
        neutral: {
          "0": t("n-0"),
          "25": t("n-25"),
          "50": t("n-50"),
          "100": t("n-100"),
          "200": t("n-200"),
          "300": t("n-300"),
          "400": t("n-400"),
          "500": t("n-500"),
          "600": t("n-600"),
          "700": t("n-700"),
          "800": t("n-800"),
          "900": t("n-900"),
          "950": t("n-950"),
        },

        /* The few stock-palette badges that predate the system. */
        amber: { "100": t("caution-subtle"), "700": t("caution-text") },
        orange: { "100": t("hearth-subtle"), "700": t("hearth-text") },
      },

      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
        /* Mono is functional, not decorative: eyebrow labels, IDs, data. */
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },

      boxShadow: {
        xs: "var(--ks-shadow-xs)",
        sm: "var(--ks-shadow-sm)",
        md: "var(--ks-shadow-md)",
        lg: "var(--ks-shadow-lg)",
        xl: "var(--ks-shadow-xl)",
        brand: "var(--ks-shadow-brand)",
      },

      transitionTimingFunction: {
        standard: "var(--ks-ease-standard)",
        entrance: "var(--ks-ease-entrance)",
        exit: "var(--ks-ease-exit)",
        spring: "var(--ks-ease-spring)",
      },
      transitionDuration: {
        instant: "var(--ks-duration-instant)",
        fast: "var(--ks-duration-fast)",
        normal: "var(--ks-duration-normal)",
        slow: "var(--ks-duration-slow)",
        deliberate: "var(--ks-duration-deliberate)",
      },

      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "draw-line": {
          from: { strokeDashoffset: "1000" },
          to: { strokeDashoffset: "0" },
        },
      },
      animation: {
        rise: "rise var(--ks-duration-normal) var(--ks-ease-entrance) both",
        "fade-in": "fade-in var(--ks-duration-fast) var(--ks-ease-standard) both",
        "scale-in": "scale-in var(--ks-duration-normal) var(--ks-ease-entrance) both",
        shimmer: "shimmer 1.8s linear infinite",
        pop: "pop var(--ks-duration-slow) var(--ks-ease-spring) both",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "draw-line": "draw-line 1.2s var(--ks-ease-entrance) both",
      },
    },
  },
  plugins: [],
} satisfies Config;

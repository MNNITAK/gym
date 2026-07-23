# KEYSTONE — Design System & Brand Guidelines

> The wedge at the crown of an arch is the keystone. Every other stone leans on
> it; remove it and the arch falls. That is the product's claim — the system a
> gym runs on — and every design decision below exists to make software feel
> that load-bearing: calm, precise, strong.

This document is the written half of the system. The executable half lives in:

| Layer | File |
|---|---|
| Tokens (colour, space, shape, elevation, motion, z) | `apps/dashboard/styles/tokens.css` |
| Tailwind binding (how screens consume tokens) | `apps/dashboard/tailwind.config.ts` |
| Base styles, focus, skeletons, reduced-motion | `apps/dashboard/app/globals.css` |
| Brand marks + theme toggle | `apps/dashboard/components/brand.tsx` |
| Component kit (new screens) | `apps/dashboard/components/ds.tsx` |
| Legacy primitives (existing screens, restyled in place) | `components/ui.tsx`, `components/member-ui.tsx` |
| Living style guide (both themes, real components) | `/design` route |

**The one architectural rule:** no screen ever hard-codes a colour, shadow,
duration or z-index. Everything resolves through the token layer. That is what
guarantees any future screen automatically belongs.

---

## 1. Personality

Five words, in priority order: **Precise. Strong. Calm. Warm. Earned.**

- *Precise* — data is exact, aligned, tabular. Coaching is a craft of numbers.
- *Strong* — heavy type, confident blacks, one decisive red. Never fragile.
- *Calm* — whitespace does the talking. An enterprise buyer reads calm as maturity.
- *Warm* — warm greys, warm off-white, human copy. A gym is not a bank.
- *Earned* — celebration exists but is rationed. A streak badge means something
  because the interface doesn't hand out fireworks.

Anti-personality: neon gradients, glassmorphism, aggressive all-caps shouting,
confetti, mascots, "gamer" energy. If a screen would look at home in a crypto
dashboard, it's wrong.

## 2. Colour

### The three-colour rule

**Obsidian** `#121110` · **Bone** `#FBFAF9` · **Signal Red** `#C8102E`
carry the entire brand. Everything else is either structural neutral or a
quiet domain accent.

Red is a budget, not a paint. It may only mean one of four things:

1. **The primary action** on a view (one per view, never two)
2. **Live** — something happening right now (realtime dot, active tab)
3. **Progress** — the fill of a ring or bar the user is earning
4. **Achievement** — a milestone, a record, a streak

If red appears for any other reason, remove it. A screen with no primary
action has no red, and that is correct.

### Structural palette

Warm graphite neutrals (`neutral-0…950` in the token file) — deliberately a
few degrees warm so greys sit *with* the red rather than fighting it. Surfaces:
`canvas` (page), `surface` (card), `surface-sunken` (wells), `surface-raised`
(modals/toasts).

### Domain accents — the three engines

| Engine | Domain | Hue | Token |
|---|---|---|---|
| 🔥 Hearth | Nutrition | ember | `hearth` |
| ⚒️ Forge | Training | steel blue | `forge` |
| ⚓ Anchor | Retention | deep sea | `anchor` |

Held at *lower chroma than the red on purpose* — the eye must always find the
action before the categorisation. Engine hues code data and plans; they are
never chrome.

### Status

`positive` / `caution` / `critical` / `info`. Note `critical` is a *deeper,
separate* red from Signal Red in light mode — an error must not look like a
call to action.

### Dark theme

An equal citizen, not an inversion filter:

- Surfaces get **lighter** as they come forward (shadows do nothing on black).
- The neutral ramp is mirrored in the token layer, which is how thousands of
  existing `text-neutral-*` utilities theme themselves.
- Signal Red is **lifted** (`#DC2440`) because `#C8102E` fails contrast on
  near-black; text-red is lifted further.
- Never pure `#000` or pure `#FFF` anywhere, either theme.

**Black-and-red is the default presentation.** Light remains a first-class
choice via the toggle, persisted in `localStorage.ks-theme` and applied
pre-paint — no flash. Both themes are audited on `/design`.

## 3. Typography

**One family: Hanken Grotesk** (variable, self-hosted via `next/font` — zero
runtime requests, zero layout shift). It has real authority at 700–800 for
headlines and stat numbers, and disappears politely at 400–500 body sizes.

| Step | Size/weight | Use |
|---|---|---|
| Display | 36–48 · 800 · -2% tracking | login, landing, hero numbers |
| Title | 24 · 800 · -2% | screen titles |
| Heading | 18 · 700 | card titles |
| Body | 14 · 400–500 | everything |
| Caption | 12 · 500 | metadata |
| Eyebrow | 10 · mono · 700 · +12% caps | section labels — the product's signature |

Rules:

- Hierarchy comes from **weight and size, never colour**. Colour is meaning.
- All data numbers use `tabular-nums` (the `.tabular` utility) so columns align.
- The mono eyebrow (`ONBOARDING · 12/19`) is the one permitted second voice —
  it is functional (labels, IDs, data), never decorative.
- Body line length caps at ~65ch. Headlines use `text-wrap: balance`.

## 4. Space, shape, elevation

- **4px grid.** Every gap, pad and margin is a multiple. Card padding: 16
  (member) / 20 (console). Section rhythm: 20–24. Screen gutters: 16 → 24.
- **Shape family:** buttons are the classic athletic register — squared
  (`rounded-lg`), bold, uppercase, letter-spaced; pills are reserved for
  badges and chips. Inputs `rounded-xl` (12), cards `rounded-2xl` (16),
  modals one step larger. Nothing fully circular except avatars and dots.
- **Elevation is earned:** resting cards get `shadow-xs` + border; hover lifts
  one step; only overlays (modal, toast) reach `lg/xl`. The product should
  look *printed*, not extruded. On dark, elevation = surface lightness.
- **Max widths:** member surface 672px (it's a phone app that happens to run
  in a browser); console 1152px.

## 5. Iconography

**Lucide, exclusively.** 1.75px stroke at rest, 2.25 when active, sized 14–22.
Icons reinforce meaning next to a label; they never decorate. **Emoji are
banned from the UI** — every screen was swept (tab bars, engine marks, streaks,
decision traces, empty states); the streak is a Flame icon, the engines are
Flame/Hammer/Anchor. Never mix icon sets — a second style anywhere breaks the
spell for the whole product.

## 6. Motion

Three durations, three curves, all in tokens: `fast 150ms` (hover, press),
`normal 240ms` (entrances), `slow/deliberate 400–640ms` (progress, charts).
`ease-entrance` for things appearing, `ease-exit` for leaving, `ease-spring`
only for celebration.

- Composited properties only (opacity/transform) — 60fps is a constraint, not
  a goal.
- Entrances: `animate-rise` (8px lift + fade). Stagger siblings ≤60ms apart.
- Buttons press to 0.97 scale. Progress bars/rings animate to value.
- **`prefers-reduced-motion` kills everything, globally, in one media query.**
- Motion never gates a task: a user who ignores every animation loses nothing.

## 7. The four states — every screen, no exceptions

1. **Loading** — skeletons that match the real layout (`SkeletonList`,
   `SkeletonCard`, `.ks-skeleton` shimmer). The branded `Spinner` (breathing
   monogram) only for inline waits. Never a dead white page, never a bare
   "Loading…".
2. **Empty** — `EmptyState`: icon, one warm sentence, one next action.
   "No requests yet — when a member asks for a plan, it lands here." Never a
   blank region.
3. **Error** — `ErrorState` / `Alert tone="critical"`: what happened, that
   their work is safe, and a retry. Calm voice, no stack traces, no blame.
   ("Couldn't reach the database. This is temporary — nothing was lost.")
4. **Success** — `toast(...)` for routine saves; `SuccessMoment` for earned
   milestones (plan approved, streak record, PR). Tasteful pop, no confetti.

## 8. Voice

- Second person, present tense, coach-like: direct, warm, brief.
- Errors never blame the user and never expose internals.
- Numbers are heroes: "4kg down since starting" beats "great progress!".
- Celebrate specifics, not sentiment: "Longest streak yet — 12 days" not
  "Awesome!!!".

## 9. Data visualisation

- One data series per chart unless comparison *is* the point.
- The metric's domain colours the chart (weight trend = positive green when
  moving toward goal; training volume = forge; readiness ring = brand red as
  earned progress).
- Grid lines: `border-subtle` at most. No 3D, no gradients-for-decoration.
- Numbers on charts are tabular; charts draw in with `animate-draw-line`.
- **Consistency is drawn, not just counted:** the red-intensity `Heatmap`
  (components/charts.tsx) is the house chart for attendance — member progress,
  coach member detail — and `WeekStrip` anchors Today in the week. Intensity:
  trained (3) > checked in (2) > logged (1); the red is earned.
- Charts consume the same tokens as everything else (`className="stroke-diet"`,
  never `stroke="#12995A"`), so they theme with the rest of the product.

## 10. Accessibility (non-negotiable)

- Text contrast ≥ 4.5:1 both themes (the token text-variants exist precisely
  because fills that pass as backgrounds fail as text).
- One global `:focus-visible` ring (2px Signal Red, offset 2) — components
  never invent their own and never remove it.
- Touch targets ≥ 40px on coarse pointers; pinch-zoom never blocked.
- `aria-current` on active nav, `role="alert"` on errors, `role="status"` on
  loaders/toasts, `aria-modal` + Escape on dialogs.
- Colour never carries meaning alone — always paired with a label or icon.
- Reduced-motion honoured globally.

## 11. Imagery & illustration (for marketing surfaces and future screens)

- **Photography:** real training environments, available light, honest sweat;
  diverse bodies, ages and abilities; candid over posed. Duotone treatment
  (obsidian shadows, bone highlights, optional red accent) makes any photo
  instantly ours. No mirror-selfie aesthetics, no stock-photo grins, no
  intimidating "shredded" clichés.
- **Illustration:** geometric, drafted from the same wedge/arch geometry as
  the monogram, two neutrals + one accent, no faces. Used only where a
  photo can't work (empty states, onboarding education, certificates).
- The in-product default is neither: **typography and data are the imagery.**

## 12. Brand asset roadmap

Exists in code today: monogram + wordmark (`brand.tsx`), favicon/app icon
(`app/icon.svg`), themed browser chrome, login/landing surfaces, loading and
empty-state graphics (component kit), achievement moments (`SuccessMoment`).

To derive next (same tokens, no new decisions needed): pitch-deck template
(obsidian title slides, bone content slides, red accents only on the number
that matters), PDF report covers, email header/footer, social templates
(1:1 and 9:16 wedge-crop layouts), member certificates, in-gym display
loops (dark theme, display type, live data), merch (wedge embroiders cleanly
at one colour).

## 13. Governance — how it stays coherent

- New screen? Compose from `ds.tsx` + shell primitives. If a new pattern is
  needed, add it to the kit and `/design` **first**, then use it.
- New colour? It doesn't exist. Add a token or use a neutral.
- PR review checklist: no raw hex, no stock Tailwind palette words, no new
  z-indices, no second icon style, all four states present, both themes
  checked on `/design`.
- The style guide route (`/design`) renders the real components — it cannot
  lie, so it is the arbiter in any dispute.

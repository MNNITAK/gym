"use client";

import { useState } from "react";
import { Dumbbell, Inbox, Search } from "lucide-react";
import { Monogram, Wordmark, ThemeToggle } from "../../components/brand";
import {
  Alert,
  Badge,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  ProgressBar,
  ProgressRing,
  Skeleton,
  SkeletonList,
  Spinner,
  SuccessMoment,
  Tabs,
  Toaster,
  inputClass,
  toast,
} from "../../components/ds";
import { Button, RiskBadge } from "../../components/ui";

/* ============================================================================
   /design — the living style guide.
   Every token, type step and component, rendered from the real code so it can
   never drift from the product. Flip the theme toggle to audit dark mode.
   ========================================================================= */

const SWATCHES = [
  { name: "primary", cls: "bg-primary", note: "Signal Red — actions, live, progress" },
  { name: "ink", cls: "bg-ink", note: "primary text" },
  { name: "canvas", cls: "bg-paper border border-neutral-200", note: "page background" },
  { name: "surface", cls: "bg-white border border-neutral-200", note: "cards" },
  { name: "hearth", cls: "bg-hearth", note: "nutrition engine" },
  { name: "forge", cls: "bg-forge", note: "training engine" },
  { name: "anchor", cls: "bg-anchor", note: "retention engine" },
  { name: "positive", cls: "bg-positive", note: "success" },
  { name: "caution", cls: "bg-caution", note: "warnings" },
  { name: "critical", cls: "bg-critical", note: "errors" },
];

const TYPE_SCALE = [
  { label: "Display / 36 · 800", cls: "text-4xl font-extrabold tracking-tight" },
  { label: "Title / 24 · 800", cls: "text-2xl font-extrabold tracking-tight" },
  { label: "Heading / 18 · 700", cls: "text-lg font-bold tracking-tight" },
  { label: "Body / 14 · 400", cls: "text-sm" },
  { label: "Caption / 12 · 500", cls: "text-xs font-medium text-neutral-500" },
];

export default function DesignPage() {
  const [tab, setTab] = useState<"one" | "two">("one");
  const [modal, setModal] = useState(false);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Toaster />

      <div className="flex items-center justify-between">
        <Wordmark size={16} sub="Design system" />
        <ThemeToggle />
      </div>

      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
        One product. One language.
      </h1>
      <p className="mt-2 max-w-lg text-sm text-neutral-600">
        Rendered from the live components — this page can&apos;t drift from the product.
        Toggle the theme above; everything below must look deliberate in both.
      </p>

      {/* ── Brand ── */}
      <Section title="Brand marks">
        <div className="flex flex-wrap items-center gap-8">
          <Monogram size={56} />
          <Monogram size={32} />
          <Monogram size={16} />
          <Wordmark size={18} />
          <Wordmark size={14} sub="Coach console" />
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          The keystone: the wedge every other stone leans on. Survives at 16px, one
          colour, no gradients.
        </p>
      </Section>

      {/* ── Colour ── */}
      <Section title="Colour">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SWATCHES.map((s) => (
            <div key={s.name}>
              <div className={`h-14 rounded-xl ${s.cls}`} />
              <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-wider">{s.name}</p>
              <p className="text-[10px] text-neutral-500">{s.note}</p>
            </div>
          ))}
        </div>
        <Alert tone="info" title="The three-colour rule">
          Obsidian, Bone and Signal Red carry the brand. Red is spent, never sprinkled —
          if it appears, it means action, live, progress or achievement.
        </Alert>
      </Section>

      {/* ── Type ── */}
      <Section title="Typography — Hanken Grotesk">
        <div className="space-y-3">
          {TYPE_SCALE.map((t) => (
            <div key={t.label} className="flex flex-wrap items-baseline gap-4">
              <span className="w-40 shrink-0 font-mono text-[10px] text-neutral-400">{t.label}</span>
              <span className={t.cls}>Stronger every week</span>
            </div>
          ))}
          <div className="flex flex-wrap items-baseline gap-4">
            <span className="w-40 shrink-0 font-mono text-[10px] text-neutral-400">Eyebrow / mono</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Metabolic Twin · 2,140 kcal
            </span>
          </div>
          <p className="tabular text-2xl font-extrabold">
            80.4 <span className="text-sm font-normal text-neutral-500">kg</span> · 1,985{" "}
            <span className="text-sm font-normal text-neutral-500">kcal</span>
          </p>
        </div>
      </Section>

      {/* ── Buttons ── */}
      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary action</Button>
          <Button tone="ghost">Secondary</Button>
          <Button tone="diet">Approve</Button>
          <Button tone="work">Generate</Button>
          <Button tone="energy">Decline</Button>
          <Button busy>Working</Button>
          <Button disabled>Disabled</Button>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          One red button per view. Everything else is ghost or an engine hue.
        </p>
      </Section>

      {/* ── Badges ── */}
      <Section title="Badges & status">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary" dot>Live</Badge>
          <Badge tone="positive">Approved</Badge>
          <Badge tone="caution">Pending</Badge>
          <Badge tone="critical">At risk</Badge>
          <Badge tone="hearth">Hearth</Badge>
          <Badge tone="forge">Forge</Badge>
          <Badge tone="anchor">Anchor</Badge>
          <Badge>Neutral</Badge>
          <RiskBadge risk="CRITICAL" />
          <RiskBadge risk="HIGH" />
          <RiskBadge risk="MEDIUM" />
          <RiskBadge risk="LOW" />
        </div>
      </Section>

      {/* ── Feedback ── */}
      <Section title="Alerts & feedback">
        <div className="space-y-3">
          <Alert tone="positive" title="Plan approved">
            Aarav&apos;s training week is live. He&apos;ll see it instantly.
          </Alert>
          <Alert tone="caution" title="Check-in missed">
            Neha hasn&apos;t checked in for 12 days. Anchor has drafted a nudge.
          </Alert>
          <Alert tone="critical" title="Couldn't reach the database">
            This is temporary. Your work is safe — try again in a moment.
          </Alert>
          <div className="flex gap-2">
            <Button size="sm" tone="ghost" onClick={() => toast("Plan approved", "positive")}>
              Fire success toast
            </Button>
            <Button size="sm" tone="ghost" onClick={() => toast("That didn't save", "critical")}>
              Fire error toast
            </Button>
          </div>
        </div>
      </Section>

      {/* ── Loading ── */}
      <Section title="Loading — never a dead screen">
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonList count={2} />
          <div className="space-y-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Spinner label="Drafting with Forge…" />
          </div>
        </div>
      </Section>

      {/* ── Empty & error ── */}
      <Section title="Empty & error states">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState
            icon={Inbox}
            title="No requests yet"
            action={<Button size="sm">Invite members</Button>}
          >
            When a member asks for a plan, it lands here for your review.
          </EmptyState>
          <ErrorState
            detail="The database is temporarily unavailable. Nothing was lost."
            onRetry={() => toast("Retrying…")}
          />
        </div>
      </Section>

      {/* ── Progress & success ── */}
      <Section title="Progress & celebration">
        <div className="flex flex-wrap items-center gap-8">
          <ProgressRing value={0.72} label="72%" />
          <div className="w-56 space-y-3">
            <ProgressBar value={72} />
            <ProgressBar value={45} tone="bg-forge" />
            <ProgressBar value={90} tone="bg-positive" />
          </div>
          <div className="w-64">
            <SuccessMoment title="12-day streak 🔥" detail="Longest yet. Anchor noticed." />
          </div>
        </div>
      </Section>

      {/* ── Structure ── */}
      <Section title="Tabs, fields, modal">
        <div className="max-w-sm space-y-4">
          <Tabs
            tabs={[
              { id: "one", label: "This week" },
              { id: "two", label: "History" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Field label="Member name" hint="As it appears on their plan">
            <input className={inputClass} placeholder="Aarav Sharma" />
          </Field>
          <Field label="Search" error="No members match that.">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input className={`${inputClass} pl-8`} placeholder="Search members" />
            </div>
          </Field>
          <Button tone="ghost" onClick={() => setModal(true)}>
            Open modal
          </Button>
        </div>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Approve this plan?"
          footer={
            <>
              <Button tone="ghost" size="sm" onClick={() => setModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setModal(false);
                  toast("Plan approved", "positive");
                }}
              >
                Approve
              </Button>
            </>
          }
        >
          <p className="text-sm text-neutral-600">
            Aarav will see it immediately. You can revise it later from Approvals.
          </p>
        </Modal>
      </Section>

      {/* ── Icons ── */}
      <Section title="Iconography — Lucide, one library">
        <p className="flex items-center gap-3 text-neutral-500">
          <Dumbbell size={20} strokeWidth={1.75} />
          <Inbox size={20} strokeWidth={1.75} />
          <Search size={20} strokeWidth={1.75} />
          <span className="text-xs">1.75px stroke at rest, 2.25px when active. Icons inform; they never decorate.</span>
        </p>
      </Section>

      <p className="mt-16 border-t border-neutral-200 pt-5 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        Keystone design system · tokens in styles/tokens.css · rules in DESIGN.md
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-neutral-500">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

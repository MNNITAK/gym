import Link from "next/link";
import { ArrowRight, Flame, Hammer, Anchor as AnchorIcon } from "lucide-react";
import { Monogram, ThemeToggle } from "../components/brand";

// The front door — and for an enterprise buyer, the first impression.
// KEYSTONE has two surfaces and neither is the "main" one: a member and a
// coach are equally likely to land here, so both get a door.
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex items-start justify-between">
        <div className="animate-rise">
          <Monogram size={40} />
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.24em] text-brand">
            Keystone
          </p>
        </div>
        <ThemeToggle />
      </div>

      <h1 className="mt-3 animate-rise text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">
        The operating system for gyms that keep members for life.
      </h1>
      <p className="mt-4 max-w-xl animate-rise text-neutral-600 [animation-delay:60ms]">
        Three AI coaches — <strong>Hearth</strong>, <strong>Forge</strong> and{" "}
        <strong>Anchor</strong> — on one shared member brain, with a real coach in the
        loop. Nothing reaches a member without a human approving it.
      </p>

      {/* The three engines, as a quiet system statement. */}
      <div className="mt-8 flex animate-rise flex-wrap gap-2 [animation-delay:120ms]">
        {[
          { Icon: Flame, label: "Hearth · Nutrition", cls: "bg-hearth-subtle text-hearth-text" },
          { Icon: Hammer, label: "Forge · Training", cls: "bg-forge/10 text-forge-text" },
          { Icon: AnchorIcon, label: "Anchor · Retention", cls: "bg-anchor/10 text-anchor-text" },
        ].map(({ Icon, label, cls }) => (
          <span
            key={label}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider ${cls}`}
          >
            <Icon size={12} /> {label}
          </span>
        ))}
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {/* Member */}
        <Link href="/app" className="group animate-rise [animation-delay:180ms]">
          <div className="h-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs transition duration-fast ease-standard group-hover:-translate-y-0.5 group-hover:shadow-md">
            <h2 className="text-xl font-extrabold tracking-tight">I&apos;m a member</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Today&apos;s plan, your three coaches, progress, and everything your gym
              knows about you.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-brand transition group-hover:bg-primary-hover">
              Open my panel <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </p>
            <p className="mt-3 font-mono text-[10px] text-neutral-400">
              demo · 9000000001 / member-demo
            </p>
          </div>
        </Link>

        {/* Coach */}
        <Link href="/dashboard" className="group animate-rise [animation-delay:240ms]">
          <div className="h-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs transition duration-fast ease-standard group-hover:-translate-y-0.5 group-hover:shadow-md">
            <h2 className="text-xl font-extrabold tracking-tight">
              I&apos;m a coach or owner
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Review and approve AI-drafted plans, see who&apos;s at risk of leaving,
              and run the gym.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-surface px-5 py-2.5 text-sm font-semibold transition group-hover:border-neutral-400">
              Open the console <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </p>
            <p className="mt-3 font-mono text-[10px] text-neutral-400">
              demo · coach@demo.gym / keystone-demo
            </p>
          </div>
        </Link>
      </div>

      <p className="mt-12 border-t border-neutral-200 pt-5 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
        Built on one member brain · Coach-approved by design
      </p>
    </main>
  );
}

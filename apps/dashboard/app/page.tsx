import Link from "next/link";

// The front door. KEYSTONE has two surfaces and neither is the "main" one — a
// member and a coach are equally likely to land here, so both get a door.
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-brand">KEYSTONE</p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink">
        The operating system for gyms that keep members for life.
      </h1>
      <p className="mt-4 max-w-xl text-neutral-600">
        Three AI coaches — <strong>Hearth</strong>, <strong>Forge</strong> and{" "}
        <strong>Anchor</strong> — on one shared member brain, with a real coach in the
        loop. Nothing reaches a member without a human approving it.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {/* Member */}
        <Link href="/app" className="group">
          <div className="h-full rounded-2xl border border-neutral-200 bg-white p-6 transition group-hover:border-ink">
            <p className="text-3xl">📱</p>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight">I&apos;m a member</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Today&apos;s plan, your three coaches, progress, and everything your gym
              knows about you.
            </p>
            <p className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
              Open my panel →
            </p>
            <p className="mt-3 font-mono text-[10px] text-neutral-400">
              demo · 9000000001 / member-demo
            </p>
          </div>
        </Link>

        {/* Coach */}
        <Link href="/dashboard" className="group">
          <div className="h-full rounded-2xl border border-neutral-200 bg-white p-6 transition group-hover:border-ink">
            <p className="text-3xl">🏛️</p>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight">
              I&apos;m a coach or owner
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Review and approve AI-drafted plans, see who&apos;s at risk of leaving,
              and run the gym.
            </p>
            <p className="mt-4 inline-block rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold">
              Open the console →
            </p>
            <p className="mt-3 font-mono text-[10px] text-neutral-400">
              demo · coach@demo.gym / keystone-demo
            </p>
          </div>
        </Link>
      </div>
    </main>
  );
}

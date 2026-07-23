import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
        KEYSTONE · Coach Console
      </p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink">
        The operating system for gyms that keep members for life.
      </h1>
      <p className="mt-4 text-neutral-600">
        Review and approve AI-drafted plans and member messages. Nothing reaches a
        member without a coach in the loop.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-full bg-energy px-6 py-3 font-semibold text-white"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full border border-neutral-300 px-6 py-3 font-semibold"
        >
          Coach console
        </Link>
      </div>
      <p className="mt-6 font-mono text-xs text-neutral-400">
        Demo login — coach@demo.gym / keystone-demo
      </p>
    </main>
  );
}

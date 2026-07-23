"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { meApi, setMemberSession } from "../../../lib/member-api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    joinCode: "DEMO",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await meApi<{ token: string; member: { name: string } }>("/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setMemberSession(res.token, res.member.name);
      // Straight into onboarding — never the dashboard first.
      router.push("/app/onboarding");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <p className="font-mono text-[10px] uppercase tracking-widest text-brand">KEYSTONE</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Let&apos;s get you started.</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Your coach will get to know you first — it takes about two minutes, and it&apos;s what
        makes everything after it actually yours.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <input
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          value={form.name}
          onChange={set("name")}
          placeholder="Your name"
          autoComplete="name"
        />
        <input
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={set("phone")}
          placeholder="Mobile number"
          autoComplete="tel"
        />
        <input
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          type="password"
          value={form.password}
          onChange={set("password")}
          placeholder="Choose a password"
          autoComplete="new-password"
        />
        <input
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base uppercase"
          value={form.joinCode}
          onChange={set("joinCode")}
          placeholder="Gym join code"
        />
        {error && <p className="text-sm text-energy">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-ink px-6 py-3.5 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Creating your account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        Already a member?{" "}
        <Link href="/app/login" className="font-semibold text-ink underline">
          Sign in
        </Link>
      </p>
      <p className="mt-4 text-center font-mono text-[10px] text-neutral-400">
        Demo join code — DEMO
      </p>
    </main>
  );
}

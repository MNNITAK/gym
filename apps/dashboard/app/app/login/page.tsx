"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { meApi, setMemberSession } from "../../../lib/member-api";

export default function MemberLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("9000000001");
  const [password, setPassword] = useState("member-demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await meApi<{ token: string; member: { name: string } }>("/login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      });
      setMemberSession(res.token, res.member.name);
      router.push("/app");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <p className="font-mono text-[10px] uppercase tracking-widest text-brand">KEYSTONE</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Your training, your coach.</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Sign in with the mobile number your gym has on file.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <input
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Mobile number"
          autoComplete="tel"
        />
        <input
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-energy">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-ink px-6 py-3.5 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        New here?{" "}
        <a href="/app/register" className="font-semibold text-ink underline">
          Create an account
        </a>
      </p>
      <p className="mt-4 text-center font-mono text-[10px] text-neutral-400">
        Demo — 9000000001 / member-demo
      </p>
    </main>
  );
}

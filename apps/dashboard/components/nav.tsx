"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "../lib/api";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/members", label: "Members" },
  { href: "/approvals", label: "Approvals" },
  { href: "/retention", label: "Retention" },
  { href: "/library", label: "Library" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <Link href="/dashboard" className="font-mono text-xs uppercase tracking-widest text-brand">
          KEYSTONE
        </Link>
        <nav className="flex flex-1 gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active ? "bg-ink text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => {
            clearToken();
            router.push("/login");
          }}
          className="text-sm text-neutral-500 hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

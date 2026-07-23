"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "../lib/api";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/members", label: "Members" },
  { href: "/requests", label: "Requests" },
  { href: "/approvals", label: "Approvals" },
  { href: "/retention", label: "Retention" },
  { href: "/library", label: "Library" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="font-mono text-xs uppercase tracking-widest text-brand"
          >
            KEYSTONE
          </Link>
          <div className="flex-1" />
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

        {/* On a phone the tabs drop to their own row and scroll sideways rather
            than squashing or wrapping into an unusable pile. */}
        <nav className="-mx-4 mt-2 flex gap-1 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:mt-3 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition sm:px-4 ${
                  active ? "bg-ink text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

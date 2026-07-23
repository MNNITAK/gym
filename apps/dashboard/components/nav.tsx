"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { clearToken } from "../lib/api";
import { Wordmark, ThemeToggle } from "./brand";

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
    <header
      className="sticky top-0 border-b border-neutral-200 bg-white/95 backdrop-blur"
      style={{ zIndex: "var(--ks-z-nav)" as never }}
    >
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" aria-label="KEYSTONE overview">
            <Wordmark size={15} sub="Coach console" />
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
          <button
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
            className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition hover:text-ink"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

        {/* Mono links, red underline on the active one — the header voice of
            the reference. On a phone the row scrolls sideways rather than
            squashing or wrapping into an unusable pile. */}
        <nav className="-mx-4 mt-2 flex gap-5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:mt-3 sm:gap-6 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative shrink-0 pb-1.5 font-mono text-xs font-semibold tracking-wide transition duration-fast ease-standard ${
                  active ? "text-brand" : "text-neutral-500 hover:text-ink"
                }`}
              >
                {l.label}
                <span
                  className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary transition-opacity duration-fast ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

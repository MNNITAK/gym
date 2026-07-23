import { NextResponse } from "next/server";
import { TenantViolationError } from "@keystone/core";
import { HttpError } from "./auth";

/**
 * Wrap a route handler so domain errors become clean HTTP responses instead of
 * 500s — the single error boundary for every API route.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json((await fn()) ?? null);
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof TenantViolationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";

    // The LLM provider's daily/second quota is a normal operating condition, not
    // a crash — surface it as 429 with the retry hint so the console can say
    // something useful instead of showing a 500.
    if (/rate limit|429|too many requests|quota/i.test(message)) {
      const retry = message.match(/try again in ([\dhms.]+)/i)?.[1];
      return NextResponse.json(
        {
          error: retry
            ? `The AI provider is rate-limited — try again in ${retry}.`
            : "The AI provider is rate-limited — try again shortly.",
          rateLimited: true,
          detail: message,
        },
        { status: 429 },
      );
    }

    // eslint-disable-next-line no-console
    console.error("[api]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// NOTE: `export const dynamic = "force-dynamic"` must be declared literally in each
// route file — Next.js cannot follow it through a re-export and silently ignores it.

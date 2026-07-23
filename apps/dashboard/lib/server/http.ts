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

    // Classify by WHICH provider failed, not by the word "quota".
    //
    // Firestore exhaustion reads "8 RESOURCE_EXHAUSTED: Quota exceeded", which a
    // naive /quota/i test matched — so a dead database was reported as a dead AI,
    // on every screen including login. Check the datastore first and specifically.
    // Quota exhaustion is a hard stop that needs a human; a dropped connection or
    // a slow round trip is a blip that usually succeeds on retry. Reporting the
    // second as the first sends people hunting a billing problem they don't have.
    if (/RESOURCE_EXHAUSTED|Quota exceeded/i.test(message)) {
      // eslint-disable-next-line no-console
      console.error("[api] Firestore quota exhausted:", message);
      return NextResponse.json(
        {
          error:
            "The database has hit its daily quota. This is a Firebase limit, not the AI — it resets at midnight Pacific, or upgrade the project to remove the cap.",
          datastoreUnavailable: true,
          quotaExhausted: true,
          detail: message,
        },
        { status: 503 },
      );
    }

    if (/UNAVAILABLE|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT|socket hang up/i.test(message)) {
      // eslint-disable-next-line no-console
      console.warn("[api] transient datastore blip:", message.split("\n")[0]);
      return NextResponse.json(
        {
          error: "That took too long to reach the database. Please try again.",
          transient: true,
          detail: message,
        },
        { status: 503 },
      );
    }

    // The LLM provider's quota is a normal operating condition, not a crash.
    if (/rate limit|429|too many requests|tokens per (day|minute)/i.test(message)) {
      const retry = message.match(/try again in ([\dhms.]+)/i)?.[1];
      return NextResponse.json(
        {
          error: retry
            ? `The AI is busy — try again in ${retry}.`
            : "The AI is busy — try again shortly.",
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

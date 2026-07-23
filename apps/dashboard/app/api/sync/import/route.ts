import { handle } from "@/lib/server/http";
import { tenantFrom, HttpError } from "@/lib/server/auth";
import { CsvRosterAdapter, WebhookRosterAdapter, importRoster } from "@/lib/server/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // a full roster import

/**
 * Import the member roster from the gym's existing software.
 * Body: { csv: string } or { url: string, apiKey?: string }
 */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = tenantFrom(req);
    const body = (await req.json()) as { csv?: string; url?: string; apiKey?: string };

    const adapter = body.csv
      ? new CsvRosterAdapter(body.csv)
      : body.url
        ? new WebhookRosterAdapter(body.url, body.apiKey)
        : null;
    if (!adapter) throw new HttpError(400, "Provide either a `csv` payload or a `url` to sync from.");

    return importRoster(ctx.gymId, adapter);
  });
}

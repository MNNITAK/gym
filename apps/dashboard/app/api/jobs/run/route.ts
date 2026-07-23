import { handle } from "@/lib/server/http";
import { tenantFrom, HttpError } from "@/lib/server/auth";
import { runJobs, ALL_JOBS, type JobName } from "@/lib/server/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // fan-out across every active member

/**
 * Run the recurring engine work (what BullMQ/Redis used to schedule).
 * Authorized either by a staff bearer token (the console button) or by
 * CRON_SECRET (Vercel Cron). Body: { jobs?: JobName[] }
 */
export async function POST(req: Request) {
  return handle(async () => {
    authorize(req);
    let jobs: JobName[] = ALL_JOBS;
    try {
      const body = (await req.json()) as { jobs?: JobName[] };
      if (body?.jobs?.length) jobs = body.jobs;
    } catch {
      /* no body → run everything */
    }
    return { ran: jobs, summary: await runJobs(jobs) };
  });
}

/** Vercel Cron issues GETs. */
export async function GET(req: Request) {
  return handle(async () => {
    authorize(req);
    return { ran: ALL_JOBS, summary: await runJobs(ALL_JOBS) };
  });
}

function authorize(req: Request): void {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth === `Bearer ${secret}`) return; // Vercel Cron
  try {
    tenantFrom(req); // staff session
  } catch {
    throw new HttpError(401, "Unauthorized");
  }
}

import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "../../../.env") });
import { Worker } from "bullmq";
import {
  connection,
  QUEUE_NAMES,
  metabolicQueue,
  churnQueue,
  memoryQueue,
  ritualQueue,
  winsQueue,
  patternsQueue,
} from "./queues.js";
import { recomputeMetabolicTwin } from "./processors/metabolic.js";
import { scoreMemberChurn } from "./processors/churn.js";
import { extractMemberMemory } from "./processors/memory.js";
import { dispatchRitual } from "./processors/rituals.js";
import { scanMemberWins } from "./processors/milestones.js";
import { aggregateCrossGymPatterns } from "./processors/patterns.js";
import {
  fanOutChurn,
  fanOutMetabolic,
  fanOutMemory,
  fanOutRituals,
  fanOutWins,
} from "./scheduler.js";

// ── Per-member / per-job processors ──────────────────────────────────────────
const metabolicWorker = new Worker(
  QUEUE_NAMES.metabolic,
  async (job) => {
    if (job.name === "tick") return { enqueued: await fanOutMetabolic() };
    await recomputeMetabolicTwin(job.data.memberId as string);
    return { ok: true };
  },
  { connection, concurrency: 5 },
);

const churnWorker = new Worker(
  QUEUE_NAMES.churn,
  async (job) => {
    if (job.name === "tick") return { enqueued: await fanOutChurn() };
    await scoreMemberChurn(job.data.memberId as string);
    return { ok: true };
  },
  { connection, concurrency: 5 },
);

const memoryWorker = new Worker(
  QUEUE_NAMES.memory,
  async (job) => {
    if (job.name === "tick") return { enqueued: await fanOutMemory() };
    await extractMemberMemory(job.data.memberId as string);
    return { ok: true };
  },
  { connection, concurrency: 3 },
);

const ritualWorker = new Worker(
  QUEUE_NAMES.rituals,
  async (job) => {
    if (job.name === "tick") return { enqueued: await fanOutRituals() };
    const sent = await dispatchRitual(job.data.gymId as string, job.data.ritualId as string);
    return { sent };
  },
  { connection, concurrency: 3 },
);

const winsWorker = new Worker(
  QUEUE_NAMES.wins,
  async (job) => {
    if (job.name === "tick") return { enqueued: await fanOutWins() };
    await scanMemberWins(job.data.memberId as string);
    return { ok: true };
  },
  { connection, concurrency: 5 },
);

const patternsWorker = new Worker(
  QUEUE_NAMES.patterns,
  async (job) => {
    if (job.name === "tick") return { persisted: await aggregateCrossGymPatterns() };
    return { ok: true };
  },
  { connection, concurrency: 1 },
);

const workers = [
  metabolicWorker,
  churnWorker,
  memoryWorker,
  ritualWorker,
  winsWorker,
  patternsWorker,
];
for (const w of workers) {
  w.on("failed", (job, err) =>
    // eslint-disable-next-line no-console
    console.error(`[worker] ${w.name} job ${job?.id} failed:`, err.message),
  );
}

// ── Repeatable schedulers (the recurring moat work) ──────────────────────────
async function registerSchedules() {
  // Weekly Metabolic Twin recompute (Mondays 03:00).
  await metabolicQueue.add("tick", {}, { repeat: { pattern: "0 3 * * 1" }, jobId: "metabolic-weekly-tick" });
  // Daily churn scoring (04:00).
  await churnQueue.add("tick", {}, { repeat: { pattern: "0 4 * * *" }, jobId: "churn-daily-tick" });
  // Daily memory extraction (04:30).
  await memoryQueue.add("tick", {}, { repeat: { pattern: "30 4 * * *" }, jobId: "memory-daily-tick" });
  // Daily ritual dispatch (06:00 — the morning weigh-in / intention prompt).
  await ritualQueue.add("tick", {}, { repeat: { pattern: "0 6 * * *" }, jobId: "ritual-daily-tick" });
  // Daily win detection (05:00) → coach-gated congratulations.
  await winsQueue.add("tick", {}, { repeat: { pattern: "0 5 * * *" }, jobId: "wins-daily-tick" });
  // Weekly cross-gym pattern aggregation (Sundays 02:00) — the flywheel.
  await patternsQueue.add("tick", {}, { repeat: { pattern: "0 2 * * 0" }, jobId: "patterns-weekly-tick" });
}

registerSchedules()
  .then(() =>
    // eslint-disable-next-line no-console
    console.log("[keystone/worker] processors + schedules registered (metabolic, churn, memory, rituals, wins, patterns)"),
  )
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[keystone/worker] failed to register schedules", e);
  });

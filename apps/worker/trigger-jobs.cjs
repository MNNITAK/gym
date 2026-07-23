// Dev utility: fire the recurring engine jobs NOW instead of waiting for their
// cron schedules. Usage: pnpm jobs:trigger [queue...]
// With no args it triggers every queue's "tick" (the per-member fan-out).
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const QUEUES = {
  metabolic: "metabolic-recompute",
  churn: "churn-score",
  memory: "memory-extraction",
  rituals: "ritual-dispatch",
  wins: "win-detection",
  patterns: "cross-gym-patterns",
};

async function main() {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(QUEUES);

  const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  for (const name of names) {
    const queueName = QUEUES[name];
    if (!queueName) {
      console.error(`unknown queue "${name}" — one of: ${Object.keys(QUEUES).join(", ")}`);
      continue;
    }
    const q = new Queue(queueName, { connection });
    // Unique jobId so a manual trigger is never deduped against the cron tick.
    await q.add("tick", {}, { jobId: `manual:${name}:${Date.now()}` });
    console.log(`triggered ${name} (${queueName})`);
    await q.close();
  }

  await connection.quit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

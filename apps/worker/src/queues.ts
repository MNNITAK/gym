import IORedis from "ioredis";
import { Queue } from "bullmq";

// Shared Redis connection for BullMQ (must have maxRetriesPerRequest=null).
export const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

// The recurring work that IS the moat.
export const QUEUE_NAMES = {
  metabolic: "metabolic-recompute", // weekly per active member
  churn: "churn-score", // daily per active member
  memory: "memory-extraction", // daily per active member
  rituals: "ritual-dispatch", // daily micro-rituals
  wins: "win-detection", // daily milestone scan → coach-gated congrats
  patterns: "cross-gym-patterns", // weekly anonymized aggregation (flywheel)
} as const;

export const metabolicQueue = new Queue(QUEUE_NAMES.metabolic, { connection });
export const churnQueue = new Queue(QUEUE_NAMES.churn, { connection });
export const memoryQueue = new Queue(QUEUE_NAMES.memory, { connection });
export const ritualQueue = new Queue(QUEUE_NAMES.rituals, { connection });
export const winsQueue = new Queue(QUEUE_NAMES.wins, { connection });
export const patternsQueue = new Queue(QUEUE_NAMES.patterns, { connection });

export const allQueues = [
  metabolicQueue,
  churnQueue,
  memoryQueue,
  ritualQueue,
  winsQueue,
  patternsQueue,
];

import { repos } from "@keystone/db";
import {
  churnQueue,
  metabolicQueue,
  memoryQueue,
  ritualQueue,
  winsQueue,
} from "./queues.js";

/**
 * Fan out per-member jobs for the recurring engines. Called by repeatable
 * "tick" jobs; each tick enqueues one job per active member.
 */
export async function fanOutMetabolic(): Promise<number> {
  const members = await repos.members.listActive();
  await metabolicQueue.addBulk(
    members.map((m) => ({
      name: "recompute",
      data: { memberId: m.id },
      opts: { jobId: `metabolic:${m.id}:${weekKey()}` },
    })),
  );
  return members.length;
}

export async function fanOutChurn(): Promise<number> {
  const members = await repos.members.listActive();
  await churnQueue.addBulk(
    members.map((m) => ({
      name: "score",
      data: { memberId: m.id },
      opts: { jobId: `churn:${m.id}:${dayKey()}` },
    })),
  );
  return members.length;
}

export async function fanOutMemory(): Promise<number> {
  const members = await repos.members.listActive();
  await memoryQueue.addBulk(
    members.map((m) => ({
      name: "extract",
      data: { memberId: m.id },
      opts: { jobId: `memory:${m.id}:${dayKey()}` },
    })),
  );
  return members.length;
}

export async function fanOutWins(): Promise<number> {
  const members = await repos.members.listActive();
  await winsQueue.addBulk(
    members.map((m) => ({
      name: "scan",
      data: { memberId: m.id },
      opts: { jobId: `wins:${m.id}:${dayKey()}` },
    })),
  );
  return members.length;
}

/**
 * Fan out ritual dispatch: one job per (gym, active ritual). Members are resolved
 * inside the processor so the fan-out stays small.
 */
export async function fanOutRituals(): Promise<number> {
  const members = await repos.members.listActive();
  const gymIds = [...new Set(members.map((m) => m.gymId))];
  let jobs = 0;
  for (const gymId of gymIds) {
    const rituals = await repos.rituals.listActiveByGym(gymId);
    if (rituals.length === 0) continue;
    await ritualQueue.addBulk(
      rituals.map((r) => ({
        name: "dispatch",
        data: { gymId, ritualId: r.id },
        opts: { jobId: `ritual:${r.id}:${dayKey()}` },
      })),
    );
    jobs += rituals.length;
  }
  return jobs;
}

function weekKey(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((d.getTime() - onejan.getTime()) / 864e5 + onejan.getDay() + 1) / 7,
  );
  return `${d.getFullYear()}-W${week}`;
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

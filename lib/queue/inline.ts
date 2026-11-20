import "server-only";

import { CronExpressionParser } from "cron-parser";
import { deliverOutboxBatch } from "@/lib/outbox";
import { OUTBOX_SCHEDULER_HEARTBEAT_KEY, recordHeartbeatAlive } from "@/lib/operationalHeartbeat";
import { getRedisClient } from "@/lib/rateLimit";
import type { JobDefinition } from "./definitions";
import { SCHEDULED_JOBS } from "./registry";

const MINUTE = 60_000;
/** Outbox rows delivered per call: five batches of 20 keeps a call well inside a minute. */
const OUTBOX_BATCHES = 5;

type Claim = (area: string, occurrence: number, ttlMs: number) => Promise<boolean>;

/** The start of the schedule period `now` falls in. */
export function occurrenceOf(schedule: NonNullable<JobDefinition["schedule"]>, now: number) {
  if ("every" in schedule) return Math.floor(now / schedule.every) * schedule.every;
  return CronExpressionParser.parse(schedule.pattern, { currentDate: new Date(now + 1), tz: schedule.tz ?? "UTC" }).prev().getTime();
}

/**
 * Each occurrence runs once, even when calls overlap or arrive twice in a minute: Redis `SET NX` claims it. Without
 * Redis (local development only; production requires it), an occurrence runs only in its own first minute.
 */
export const redisClaim: Claim = async (area, occurrence, ttlMs) => {
  const redis = getRedisClient();
  if (!redis) return Date.now() - occurrence < MINUTE;
  return (await redis.set(`swo:inline-jobs:${area}:${occurrence}`, "1", "PX", Math.max(ttlMs, MINUTE), "NX")) === "OK";
};

/** Delivers due outbox rows in this request instead of queueing them for a worker. */
async function deliverOutboxInline() {
  const total = { sent: 0, failed: 0 };
  for (let batch = 0; batch < OUTBOX_BATCHES; batch++) {
    const result = await deliverOutboxBatch();
    total.sent += result.sent;
    total.failed += result.failed;
    if (result.sent + result.failed < 20) break;
  }
  await recordHeartbeatAlive(OUTBOX_SCHEDULER_HEARTBEAT_KEY).catch(() => undefined);
  return total;
}

/**
 * Runs the scheduled jobs that are due, in this process, for hosts with no worker or beat (an online cron calls
 * `POST /api/internal/run-jobs` once a minute). The outbox relay delivers here rather than queueing. A failing job
 * is reported and never stops the others; it runs again at its next occurrence.
 */
export async function runDueJobsInline(now = new Date(), registry: readonly JobDefinition[] = SCHEDULED_JOBS, claim: Claim = redisClaim) {
  const ran: string[] = [];
  const failed: string[] = [];
  let outbox = { sent: 0, failed: 0 };
  for (const job of registry) {
    if (!job.schedule) continue;
    const occurrence = occurrenceOf(job.schedule, now.getTime());
    const ttl = "every" in job.schedule ? job.schedule.every : 24 * 60 * MINUTE;
    if (!(await claim(job.area, occurrence, ttl))) continue;
    try {
      if (job.area === "outbox-relay") outbox = await deliverOutboxInline();
      else await job.run(now);
      ran.push(job.area);
    } catch {
      console.error(`[inline jobs] ${job.area} failed`);
      failed.push(job.area);
    }
  }
  return { ran, failed, outbox };
}

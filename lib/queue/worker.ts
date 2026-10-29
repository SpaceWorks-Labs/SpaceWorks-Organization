import "server-only";

import { DelayedError, UnrecoverableError, Worker, type Job, type Processor } from "bullmq";
import { prisma } from "@/lib/db";
import { deliverOutboxBatch } from "@/lib/outbox";
import { recordOutboxSchedulerFailure, recordOutboxSchedulerSuccess } from "@/lib/operationalHeartbeat";
import { describeOperationalError } from "@/lib/redactSensitiveText";
import { queueConnection } from "./client";
import { QUEUE_NAMES, queueConcurrency, type JobDefinition, type QueueJob } from "./definitions";
import { SCHEDULED_JOBS } from "./registry";

/** Run one queued job: a registry entry by area, or one outbox row by id. */
export async function processQueueJob(job: Job<QueueJob>, token?: string, registry: readonly JobDefinition[] = SCHEDULED_JOBS) {
  const data = job.data;
  if (data.kind === "registered") {
    const definition = registry.find((item) => item.area === data.area);
    if (!definition) throw new UnrecoverableError("Job registration removed. Remove this job.");
    await definition.run(new Date());
    return;
  }
  if (data.kind !== "outbox" || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.outboxId)) throw new UnrecoverableError("Invalid job definition.");
  const result = await deliverOutboxBatch(1, { ids: [data.outboxId] });
  const row = await prisma.outboxMessage.findUnique({ where: { id: data.outboxId }, select: { status: true, availableAt: true, lockedAt: true, lastError: true } });
  if (!row || row.status === "SENT") {
    await recordOutboxSchedulerSuccess(result).catch(() => undefined);
    return;
  }
  if (row.status === "FAILED") {
    await recordOutboxSchedulerFailure(new Error(row.lastError ?? "Delivery failed")).catch(() => undefined);
    throw new UnrecoverableError(row.lastError || "Delivery failed. Check the email outbox.");
  }
  const due = row.status === "PROCESSING" ? (row.lockedAt?.getTime() ?? Date.now()) + 15 * 60_000 : row.availableAt.getTime();
  // SQL owns delivery retry timing. Never complete a pending delivery.
  if (due > Date.now()) {
    await job.moveToDelayed(due, token);
    throw new DelayedError();
  }
  throw new Error("Delivery pending. Retrying.");
}

export function createWorkers(options: { prefix?: string; redisUrl?: string; processor?: Processor<QueueJob> } = {}) {
  const workers = QUEUE_NAMES.map((name) => {
    const worker = new Worker<QueueJob>(name, async (job, token) => {
      try { return await (options.processor ?? processQueueJob)(job, token); }
      catch (error) {
        if (error instanceof DelayedError) throw error;
        // BullMQ stores thrown messages. Strip provider responses, URLs, bodies and credentials.
        if (error instanceof UnrecoverableError) throw new UnrecoverableError(describeOperationalError(error));
        throw new Error(describeOperationalError(error));
      }
    }, { connection: queueConnection(true, options.redisUrl), prefix: options.prefix ?? process.env.JOBS_QUEUE_PREFIX ?? "swo:jobs", concurrency: queueConcurrency(name), maxStalledCount: 2 });
    worker.on("error", () => console.error(`[queue] ${name} worker error`));
    worker.on("failed", () => console.error(`[queue] ${name} job failed`));
    return worker;
  });
  return {
    workers,
    ready: () => Promise.all(workers.map((worker) => worker.waitUntilReady())),
    // close() stops new claims and waits for running handlers, including their final SQL updates.
    close: () => Promise.all(workers.map((worker) => worker.close())),
  };
}

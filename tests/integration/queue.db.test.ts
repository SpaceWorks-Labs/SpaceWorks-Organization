import { afterAll, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

// BullMQ against a real Redis and the SQL outbox. Skipped unless TEST_QUEUE_REDIS_URL names a disposable Redis.
const redisUrl = process.env.TEST_QUEUE_REDIS_URL?.trim();
const mail = vi.hoisted(() => ({ sent: [] as string[], failFor: "queue-fail@example.test" }));
vi.mock("@/lib/email/passwordReset", () => ({
  sendPasswordResetEmail: async ({ to }: { to: string }) => {
    if (to === mail.failFor) throw new Error("SMTP 421 try later");
    mail.sent.push(to);
  },
}));

const { prisma } = await import("@/lib/db");
const { createQueues, closeQueues, queueConnection } = await import("@/lib/queue/client");
const { enqueueDueOutbox } = await import("@/lib/queue/enqueue");
const { syncSchedules } = await import("@/lib/queue/beat");
const { SCHEDULED_JOBS } = await import("@/lib/queue/registry");
const { createWorkers, processQueueJob } = await import("@/lib/queue/worker");
type QueueJob = import("@/lib/queue/definitions").QueueJob;

const prefix = `swo-test:${process.pid}:${Date.now()}`;
const cleanups: Array<() => Promise<unknown>> = [];
const until = async (check: () => Promise<boolean>, ms = 15_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((resolve) => setTimeout(resolve, 100))) if (await check()) return;
  throw new Error("Timed out waiting for the queue.");
};
function testQueues(name: string) {
  const queues = createQueues(`${prefix}:${name}`, queueConnection(true, redisUrl));
  cleanups.push(async () => {
    for (const queue of Object.values(queues)) await queue.obliterate({ force: true });
    await closeQueues(queues);
  });
  return queues;
}
function workers(name: string, processor: (job: Job<QueueJob>, token?: string) => Promise<unknown>) {
  const running = createWorkers({ prefix: `${prefix}:${name}`, redisUrl, processor });
  cleanups.unshift(running.close);
  return running;
}

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup().catch(() => undefined);
  vi.unstubAllEnvs();
});

describe.skipIf(!redisUrl)("BullMQ worker and beat", () => {
  it("runs outbox jobs at most QUEUE_OUTBOX_CONCURRENCY at a time and retries a failed job", async () => {
    vi.stubEnv("QUEUE_OUTBOX_CONCURRENCY", "2");
    const queues = testQueues("concurrency");
    let active = 0;
    let peak = 0;
    const seen = new Map<string, number>();
    const running = workers("concurrency", async (job) => {
      const id = job.data.kind === "outbox" ? job.data.outboxId : job.data.area;
      seen.set(id, (seen.get(id) ?? 0) + 1);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active -= 1;
      if (id === "flaky" && seen.get(id) === 1) throw new Error("smtp://user:secret@mail.test refused");
    });
    await running.ready();
    const retry = { attempts: 3, backoff: { type: "fixed", delay: 10 } };
    await queues.outbox.addBulk([...Array.from({ length: 8 }, (_, i) => `row-${i}`), "flaky"].map((outboxId) => ({ name: "deliver", data: { kind: "outbox" as const, outboxId }, opts: retry })));
    await until(async () => (await queues.outbox.getCompletedCount()) === 9);
    expect(peak).toBe(2);
    expect(seen.get("flaky")).toBe(2);
  }, 30_000);

  it("delivers due SQL outbox rows by id and leaves a failed send to the outbox's own retry time", async () => {
    vi.stubEnv("QUEUE_OUTBOX_CONCURRENCY", "4");
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const recipients = ["queue-1@example.test", "queue-2@example.test", "queue-3@example.test", mail.failFor];
    // Oldest first, so they lead the relay's batch whatever else the shared test database holds.
    const rows = await Promise.all(recipients.map((to, i) => prisma.outboxMessage.create({
      data: { kind: "password-reset", payload: { to, resetUrl: "https://members.test/reset/token", expiresAt }, createdAt: new Date(i + 1) },
    })));
    const ids = new Set(rows.map((row) => row.id));
    cleanups.push(() => prisma.outboxMessage.deleteMany({ where: { id: { in: [...ids] } } }));
    const queues = testQueues("outbox");
    // Rows other suites left behind are queued too; only ours are delivered.
    const running = workers("outbox", async (job, token) => job.data.kind === "outbox" && ids.has(job.data.outboxId) ? processQueueJob(job, token) : undefined);
    await running.ready();

    const { enqueued } = await enqueueDueOutbox(queues);
    expect(enqueued).toBeGreaterThanOrEqual(4);
    const failed = rows[3].id;
    await until(async () => (await prisma.outboxMessage.count({ where: { id: { in: [...ids] } } })) === 1 && (await queues.outbox.getDelayedCount()) === 1);
    expect(mail.sent.sort()).toEqual(recipients.slice(0, 3));
    const row = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: failed } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(row.availableAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    const [delayed] = await queues.outbox.getDelayed();
    expect(delayed.data).toEqual({ kind: "outbox", outboxId: failed });
    // Redis carries the id only: never the address or the link.
    expect(JSON.stringify(delayed.data)).not.toContain("example.test");
  }, 30_000);

  it("keeps one repeatable schedule per registered job however often beat starts", async () => {
    const queues = testQueues("beat");
    await syncSchedules(queues);
    await syncSchedules(queues);
    const keys = [...(await queues.outbox.getJobSchedulers(0, -1)), ...(await queues.scheduled.getJobSchedulers(0, -1))].map((item) => item.key);
    expect(keys.sort()).toEqual(SCHEDULED_JOBS.map((job) => `registry-${job.area}`).sort());
    await syncSchedules(queues, SCHEDULED_JOBS.filter((job) => job.area !== "storage-cleanup"));
    expect((await queues.scheduled.getJobSchedulers(0, -1)).map((item) => item.key)).not.toContain("registry-storage-cleanup");
  }, 30_000);
});

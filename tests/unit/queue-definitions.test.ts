import { beforeEach, describe, expect, it, vi } from "vitest";
import { DelayedError, UnrecoverableError, type Job } from "bullmq";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  deliver: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  alive: vi.fn(),
  reconcile: vi.fn(),
  digest: vi.fn(),
  photoSweep: vi.fn(),
  getQueues: vi.fn(),
}));
vi.mock("@/lib/queue/client", () => ({ getQueues: mocks.getQueues, queueConnection: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { outboxMessage: { findUnique: mocks.findUnique, findMany: mocks.findMany } } }));
vi.mock("@/lib/outbox", () => ({ deliverOutboxBatch: mocks.deliver }));
vi.mock("@/lib/retention", () => ({ purgeExpiredOperationalData: vi.fn() }));
vi.mock("@/lib/membership/sweep", () => ({ runMembershipSweep: vi.fn() }));
vi.mock("@/lib/payments/reconcile", () => ({ reconcileGatewayPayments: mocks.reconcile }));
vi.mock("@/lib/payments/reconcileRefunds", () => ({ reconcileGatewayRefunds: vi.fn() }));
vi.mock("@/lib/reports/digest", () => ({ queueMonthlyDigests: mocks.digest }));
vi.mock("@/lib/reports/rollupBackfill", () => ({ runExpiredBackfill: vi.fn() }));
vi.mock("@/lib/storage/cleanup", () => ({ runStorageCleanup: vi.fn() }));
vi.mock("@/lib/operationalHeartbeat", () => ({
  recordHeartbeatSuccess: vi.fn(),
  recordHeartbeatAlive: mocks.alive,
  recordOutboxSchedulerSuccess: mocks.success,
  recordOutboxSchedulerFailure: mocks.failure,
  OUTBOX_SCHEDULER_HEARTBEAT_KEY: "outbox-scheduler",
  WORKER_HEARTBEAT_KEY: "worker",
}));

vi.mock("@/lib/storage/photoSweep", () => ({ runMemberPhotoSweep: mocks.photoSweep }));

import { jobId, queueConcurrency, scheduleDefinitions, type JobDefinition, type QueueJob } from "@/lib/queue/definitions";
import type { Queues } from "@/lib/queue/client";
import { enqueueDueOutbox, enqueueScheduledTick } from "@/lib/queue/enqueue";
import { syncSchedules } from "@/lib/queue/beat";
import { SCHEDULED_JOBS } from "@/lib/queue/registry";
import { processQueueJob } from "@/lib/queue/worker";

const job = (data: QueueJob) => ({ data, moveToDelayed: vi.fn() }) as unknown as Job<QueueJob> & { moveToDelayed: ReturnType<typeof vi.fn> };

function fakeQueues(existing: string[] = []) {
  const queue = () => ({
    add: vi.fn(), addBulk: vi.fn(), upsertJobScheduler: vi.fn(), removeJobScheduler: vi.fn(),
    getJobSchedulers: vi.fn(async () => existing.map((key) => ({ key }))),
  });
  return { outbox: queue(), scheduled: queue() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deliver.mockResolvedValue({ sent: 1, failed: 0 });
  mocks.success.mockResolvedValue(undefined);
  mocks.failure.mockResolvedValue(undefined);
  mocks.alive.mockResolvedValue(undefined);
});

describe("job queue definitions", () => {
  it("schedules every periodic job once, at its own cadence", () => {
    const definitions = scheduleDefinitions(SCHEDULED_JOBS);
    expect(definitions.map((item) => item.id)).toEqual(SCHEDULED_JOBS.map((entry) => `registry-${entry.area}`));
    const find = (area: string) => definitions.find((item) => item.id === `registry-${area}`);
    expect(find("outbox-relay")).toMatchObject({ queue: "outbox", schedule: { every: 60_000 } });
    for (const area of ["membership-sweep", "expired-backfill", "storage-cleanup", "operational-retention"]) {
      expect(find(area)).toMatchObject({ queue: "scheduled", schedule: { every: 60_000 } });
    }
    expect(find("payment-reconcile")).toMatchObject({ schedule: { every: 300_000 } });
    expect(find("refund-reconcile")).toMatchObject({ schedule: { every: 300_000 } });
    expect(find("member-photo-sweep")).toMatchObject({ schedule: { every: 3_600_000 } });
    expect(find("monthly-digest")).toMatchObject({ schedule: { every: 3_600_000 } });
  });

  it("lets the schedule, not the in-process throttle, set the cadence", async () => {
    const now = new Date("2026-10-01T00:00:00Z");
    await SCHEDULED_JOBS.find((entry) => entry.area === "payment-reconcile")!.run(now);
    await SCHEDULED_JOBS.find((entry) => entry.area === "monthly-digest")!.run(now);
    expect(mocks.reconcile).toHaveBeenCalledWith(now, true);
    expect(mocks.digest).toHaveBeenCalledWith(now, true);
    await SCHEDULED_JOBS.find((entry) => entry.area === "member-photo-sweep")!.run(now);
    expect(mocks.photoSweep).toHaveBeenCalledWith(now);
  });

  it("refuses duplicate areas and intervals under a second", () => {
    const run = async () => undefined;
    expect(() => scheduleDefinitions([{ area: "a", run }, { area: "a", run }])).toThrow("Duplicate job area.");
    expect(() => scheduleDefinitions([{ area: "a", schedule: { every: 10 }, run }])).toThrow("Invalid job interval.");
  });

  it("derives stable, opaque job ids", () => {
    expect(jobId("outbox", "row_1")).toBe(jobId("outbox", "row_1"));
    expect(jobId("outbox", "row_1")).not.toContain("row_1");
  });

  it("reads concurrency from the environment within bounds", () => {
    expect(queueConcurrency("outbox", {})).toBe(5);
    expect(queueConcurrency("scheduled", {})).toBe(2);
    expect(queueConcurrency("outbox", { QUEUE_OUTBOX_CONCURRENCY: "8" })).toBe(8);
    expect(() => queueConcurrency("outbox", { QUEUE_OUTBOX_CONCURRENCY: "0" })).toThrow();
    expect(() => queueConcurrency("scheduled", { QUEUE_SCHEDULED_CONCURRENCY: "65" })).toThrow();
  });
});

describe("queue worker", () => {
  it("runs a registered job by area and refuses removed ones", async () => {
    const run = vi.fn(async () => undefined);
    const registry: JobDefinition[] = [{ area: "membership-sweep", run }];
    await processQueueJob(job({ kind: "registered", area: "membership-sweep" }), undefined, registry);
    expect(run).toHaveBeenCalledOnce();
    await expect(processQueueJob(job({ kind: "registered", area: "gone" }), undefined, registry)).rejects.toThrow("Job registration removed");
    await expect(processQueueJob(job({ kind: "outbox", outboxId: "bad id!" }), undefined, registry)).rejects.toThrow("Invalid job definition");
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("delivers one outbox row by id and completes once it is sent or gone", async () => {
    mocks.findUnique.mockResolvedValueOnce({ status: "SENT" }).mockResolvedValueOnce(null);
    await processQueueJob(job({ kind: "outbox", outboxId: "row_1" }));
    await processQueueJob(job({ kind: "outbox", outboxId: "row_2" }));
    expect(mocks.deliver).toHaveBeenNthCalledWith(1, 1, { ids: ["row_1"] });
    expect(mocks.success).toHaveBeenCalledTimes(2);
  });

  it("leaves retry timing to SQL: a failed send is delayed until the row is due again", async () => {
    const availableAt = new Date(Date.now() + 120_000);
    mocks.deliver.mockResolvedValue({ sent: 0, failed: 1 });
    mocks.findUnique.mockResolvedValue({ status: "PENDING", availableAt, lockedAt: null, lastError: "SMTP 421" });
    const queued = job({ kind: "outbox", outboxId: "row_1" });
    await expect(processQueueJob(queued, "token")).rejects.toBeInstanceOf(DelayedError);
    expect(queued.moveToDelayed).toHaveBeenCalledWith(availableAt.getTime(), "token");

    mocks.findUnique.mockResolvedValue({ status: "PENDING", availableAt: new Date(Date.now() - 1_000), lockedAt: null, lastError: null });
    await expect(processQueueJob(job({ kind: "outbox", outboxId: "row_1" }))).rejects.toThrow("Delivery pending");
  });

  it("stops retrying a row the outbox marked FAILED and records it", async () => {
    mocks.findUnique.mockResolvedValue({ status: "FAILED", availableAt: new Date(), lockedAt: null, lastError: "Rejected" });
    await expect(processQueueJob(job({ kind: "outbox", outboxId: "row_1" }))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.failure).toHaveBeenCalledOnce();
  });
});

describe("enqueue and beat", () => {
  it("hands due and stale rows to the outbox queue by id only", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row_1" }, { id: "row_2" }]);
    const queues = fakeQueues();
    await expect(enqueueDueOutbox(queues as unknown as Queues)).resolves.toEqual({ enqueued: 2 });
    const [jobs] = queues.outbox.addBulk.mock.calls[0];
    expect(jobs.map((entry: { data: QueueJob }) => entry.data)).toEqual([{ kind: "outbox", outboxId: "row_1" }, { kind: "outbox", outboxId: "row_2" }]);
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ take: 100, orderBy: { createdAt: "asc" } });
  });

  it("queues each external-cron tick once per time bucket", async () => {
    const run = async () => undefined;
    const registry: JobDefinition[] = [{ area: "every-minute", run }, { area: "every-five", schedule: { every: 300_000 }, run }];
    const queues = fakeQueues();
    const now = Date.UTC(2026, 9, 1, 0, 1, 10);
    await enqueueScheduledTick(registry, queues as unknown as Queues, now);
    await enqueueScheduledTick(registry, queues as unknown as Queues, now + 20_000);
    const ids = queues.scheduled.add.mock.calls.map((call) => call[2].jobId);
    expect(ids[0]).toBe(ids[2]);
    expect(ids[1]).toBe(ids[3]);
  });

  it("upserts every schedule and drops registry schedules that are gone", async () => {
    const queues = fakeQueues(["registry-removed", "registry-outbox-relay", "someone-else"]);
    await expect(syncSchedules(queues as unknown as Queues)).resolves.toEqual({ schedules: SCHEDULED_JOBS.length });
    const upserted = [...queues.outbox.upsertJobScheduler.mock.calls, ...queues.scheduled.upsertJobScheduler.mock.calls].map((call) => call[0]);
    expect(upserted.sort()).toEqual(SCHEDULED_JOBS.map((entry) => `registry-${entry.area}`).sort());
    expect(queues.scheduled.removeJobScheduler.mock.calls.map((call) => call[0])).toEqual(["registry-removed", "registry-outbox-relay"]);
    expect(queues.outbox.removeJobScheduler.mock.calls.map((call) => call[0])).toEqual(["registry-removed"]);
  });

  it("marks the outbox relay alive on every run, even with nothing due", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.getQueues.mockReturnValue(fakeQueues());
    await SCHEDULED_JOBS.find((entry) => entry.area === "outbox-relay")!.run(new Date());
    expect(mocks.alive).toHaveBeenCalledWith("outbox-scheduler");
  });
});

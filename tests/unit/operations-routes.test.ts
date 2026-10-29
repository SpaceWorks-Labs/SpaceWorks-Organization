import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scheduler: vi.fn(), tick: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/queue/enqueue", () => ({ enqueueDueOutbox: mocks.scheduler, enqueueScheduledTick: mocks.tick }));
vi.mock("@/lib/queue/registry", () => ({ SCHEDULED_JOBS: [] }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.query } }));
vi.mock("@/lib/apiMonitor", () => ({ withApiMonitoring: (_route: string, handler: unknown) => handler }));

import { POST as runOutbox } from "@/app/api/internal/outbox/route";
import { POST as runJobs } from "@/app/api/internal/jobs/route";
import { GET as checkDatabase } from "@/app/api/health/db/route";

const previousCron = process.env.CRON_SECRET;
const previousHealth = process.env.HEALTHCHECK_SECRET;
const cronSecret = "c".repeat(32);
const healthSecret = "h".repeat(32);

describe("protected operational routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = cronSecret;
    process.env.HEALTHCHECK_SECRET = healthSecret;
    mocks.scheduler.mockResolvedValue({ enqueued: 1 });
    mocks.tick.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([{ "?column?": 1 }]);
  });

  afterEach(() => {
    if (previousCron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previousCron;
    if (previousHealth === undefined) delete process.env.HEALTHCHECK_SECRET; else process.env.HEALTHCHECK_SECRET = previousHealth;
  });

  it("returns the same non-cacheable not-found response for missing and malformed authorization", async () => {
    for (const authorization of [undefined, cronSecret, `Basic ${cronSecret}`, `Bearer ${cronSecret} extra`]) {
      const response = await runOutbox(new Request("https://members.test/api/internal/outbox", {
        method: "POST",
        ...(authorization ? { headers: { authorization } } : {}),
      }));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.scheduler).not.toHaveBeenCalled();
  });

  it("queues due outbox rows with an exact bearer and returns a generic failure", async () => {
    const request = () => new Request("https://members.test/api/internal/outbox", { method: "POST", headers: { authorization: `Bearer ${cronSecret}` } });
    const success = await runOutbox(request());
    expect(success.status).toBe(200);
    expect(success.headers.get("cache-control")).toBe("private, no-store");

    expect(await success.json()).toEqual({ ok: true, enqueued: 1 });

    mocks.scheduler.mockRejectedValue(new Error("redis://user:password@private-host"));
    const failure = await runOutbox(request());
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ ok: false, error: "Jobs could not be queued. Try again." });
  });

  it("enqueues one scheduled tick for external crons, behind the same bearer", async () => {
    const denied = await runJobs(new Request("https://members.test/api/internal/jobs", { method: "POST" }));
    expect(denied.status).toBe(404);
    expect(mocks.tick).not.toHaveBeenCalled();
    const allowed = await runJobs(new Request("https://members.test/api/internal/jobs", { method: "POST", headers: { authorization: `Bearer ${cronSecret}` } }));
    expect(allowed.status).toBe(204);
    expect(mocks.tick).toHaveBeenCalledOnce();
  });

  it("does not touch PostgreSQL until the readiness bearer is valid", async () => {
    const denied = await checkDatabase(new Request("https://members.test/api/health/db", { headers: { authorization: healthSecret } }));
    expect(denied.status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();

    const allowed = await checkDatabase(new Request("https://members.test/api/health/db", { headers: { authorization: `Bearer ${healthSecret}` } }));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});

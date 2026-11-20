import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deliver: vi.fn(), alive: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/outbox", () => ({ deliverOutboxBatch: mocks.deliver }));
vi.mock("@/lib/operationalHeartbeat", () => ({ recordHeartbeatAlive: mocks.alive, OUTBOX_SCHEDULER_HEARTBEAT_KEY: "outbox-scheduler" }));
vi.mock("@/lib/rateLimit", () => ({ getRedisClient: () => null }));
vi.mock("@/lib/queue/registry", () => ({ SCHEDULED_JOBS: [] }));

import type { JobDefinition } from "@/lib/queue/definitions";
import { occurrenceOf, runDueJobsInline } from "@/lib/queue/inline";

const MINUTE = 60_000;
const now = new Date(Date.UTC(2026, 10, 20, 9, 30, 15));

/** An in-memory claim store with the same once-per-occurrence rule as Redis SET NX. */
function memoryClaim() {
  const taken = new Set<string>();
  return async (area: string, occurrence: number) => {
    const key = `${area}:${occurrence}`;
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deliver.mockResolvedValue({ sent: 0, failed: 0 });
  mocks.alive.mockResolvedValue(undefined);
});

describe("occurrenceOf", () => {
  it("starts an interval at its boundary and a cron pattern at its last match", () => {
    expect(occurrenceOf({ every: 60 * MINUTE }, now.getTime())).toBe(Date.UTC(2026, 10, 20, 9, 0));
    expect(occurrenceOf({ pattern: "0 9 * * *" }, now.getTime())).toBe(Date.UTC(2026, 10, 20, 9, 0));
  });
});

describe("runDueJobsInline", () => {
  it("runs each due job once per occurrence, even when called twice", async () => {
    const minute = vi.fn(), hourly = vi.fn();
    const registry: JobDefinition[] = [
      { area: "minute", schedule: { every: MINUTE }, run: minute },
      { area: "hourly", schedule: { every: 60 * MINUTE }, run: hourly },
      { area: "unscheduled", run: vi.fn() },
    ];
    const claim = memoryClaim();
    expect((await runDueJobsInline(now, registry, claim)).ran).toEqual(["minute", "hourly"]);
    expect((await runDueJobsInline(now, registry, claim)).ran).toEqual([]);
    const next = await runDueJobsInline(new Date(now.getTime() + MINUTE), registry, claim);
    expect(next.ran).toEqual(["minute"]);
    expect(minute).toHaveBeenCalledTimes(2);
    expect(hourly).toHaveBeenCalledTimes(1);
  });

  it("delivers the outbox in the request instead of queueing it, in batches until it runs dry", async () => {
    mocks.deliver.mockResolvedValueOnce({ sent: 20, failed: 0 }).mockResolvedValueOnce({ sent: 3, failed: 1 });
    const queue = vi.fn();
    const result = await runDueJobsInline(now, [{ area: "outbox-relay", schedule: { every: MINUTE }, run: queue }], memoryClaim());
    expect(queue).not.toHaveBeenCalled();
    expect(mocks.deliver).toHaveBeenCalledTimes(2);
    expect(result.outbox).toEqual({ sent: 23, failed: 1 });
    expect(mocks.alive).toHaveBeenCalledWith("outbox-scheduler");
  });

  it("reports a failing job and still runs the rest", async () => {
    const after = vi.fn();
    const registry: JobDefinition[] = [
      { area: "broken", schedule: { every: MINUTE }, run: () => Promise.reject(new Error("boom")) },
      { area: "after", schedule: { every: MINUTE }, run: after },
    ];
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await runDueJobsInline(now, registry, memoryClaim());
    expect(result).toMatchObject({ ran: ["after"], failed: ["broken"] });
    expect(after).toHaveBeenCalled();
    error.mockRestore();
  });

  it("without Redis runs an occurrence only in its first minute", async () => {
    const hourly = vi.fn();
    const registry: JobDefinition[] = [{ area: "hourly", schedule: { every: 60 * MINUTE }, run: hourly }];
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 20, 9, 0, 20) });
    expect((await runDueJobsInline(new Date(), registry)).ran).toEqual(["hourly"]);
    vi.setSystemTime(Date.UTC(2026, 10, 20, 9, 30));
    expect((await runDueJobsInline(new Date(), registry)).ran).toEqual([]);
    vi.useRealTimers();
  });
});

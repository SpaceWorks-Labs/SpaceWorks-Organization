import "server-only";

import { deliverOutboxBatch } from "@/lib/outbox";
import {
  recordOutboxSchedulerFailure,
  recordOutboxSchedulerStarted,
  recordOutboxSchedulerSuccess,
} from "@/lib/operationalHeartbeat";
import { purgeExpiredOperationalData } from "@/lib/retention";
import { runMembershipSweep } from "@/lib/membership/sweep";
import { reconcileGatewayPayments } from "@/lib/payments/reconcile";
import { reconcileGatewayRefunds } from "@/lib/payments/reconcileRefunds";
import { queueMonthlyDigests } from "@/lib/reports/digest";
import { runExpiredBackfill } from "@/lib/reports/rollupBackfill";
import { runStorageCleanup } from "@/lib/storage/cleanup";

const OUTBOX_WORKER_INTERVAL_MS = 60_000;

type OutboxWorkerState = {
  started?: boolean;
  running?: boolean;
  timer?: ReturnType<typeof setInterval>;
};

function workerState() {
  return globalThis as typeof globalThis & { __sweOutboxWorker?: OutboxWorkerState };
}

/**
 * One pass of every periodic job without Redis. Production runs the BullMQ `worker` and `beat` roles instead
 * (lib/queue, where the same jobs are registered); this exists only for local development
 * (JOBS_INPROCESS=true with no REDIS_URL).
 */
export async function runOutboxScheduler() {
  // Heartbeat persistence is observability, not part of the delivery commit.
  // A heartbeat-table issue must not stop otherwise healthy queue processing.
  await recordOutboxSchedulerStarted().catch(() => undefined);
  try {
    // Membership changes first, so reminders and notices they queue go out in the same pass.
    await runMembershipSweep().catch(() => console.error("[membership sweep] run failed"));
    await reconcileGatewayPayments().catch(() => console.error("[payments reconcile] run failed"));
    await reconcileGatewayRefunds().catch(() => console.error("[refunds reconcile] run failed"));
    await queueMonthlyDigests().catch(() => console.error("[report digest] run failed"));
    const result = await deliverOutboxBatch();
    await runExpiredBackfill().catch(() => console.error("[report rollup] expired backfill failed"));
    // One-off 0.7 clean-ups in small chunks: stored card exports deleted, member photos moved per member.
    await runStorageCleanup().catch(() => console.error("[storage cleanup] run failed"));
    const purged = await purgeExpiredOperationalData();
    await recordOutboxSchedulerSuccess(result).catch(() => undefined);
    return { ...result, purged };
  } catch (error) {
    await recordOutboxSchedulerFailure(error).catch(() => undefined);
    throw error;
  }
}

/** A one-minute timer in this process. Queue row claims make several processes safe; the guard stops HMR duplicates. */
export function startOutboxWorker() {
  const runtime = workerState();
  if (runtime.__sweOutboxWorker?.started) return;

  const state: OutboxWorkerState = { started: true, running: false };
  runtime.__sweOutboxWorker = state;

  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      await runOutboxScheduler();
    } catch {
      // Failure metadata is persisted separately without exception text.
      console.error("[outbox worker] in-process run failed");
    } finally {
      state.running = false;
    }
  };

  void tick();
  state.timer = setInterval(() => {
    void tick();
  }, OUTBOX_WORKER_INTERVAL_MS);
  state.timer.unref?.();
}

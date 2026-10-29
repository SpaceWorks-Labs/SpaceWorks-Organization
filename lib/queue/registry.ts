import "server-only";

import { OUTBOX_SCHEDULER_HEARTBEAT_KEY, recordHeartbeatAlive, recordHeartbeatSuccess, WORKER_HEARTBEAT_KEY } from "@/lib/operationalHeartbeat";
import { purgeExpiredOperationalData } from "@/lib/retention";
import { runMembershipSweep } from "@/lib/membership/sweep";
import { reconcileGatewayPayments } from "@/lib/payments/reconcile";
import { reconcileGatewayRefunds } from "@/lib/payments/reconcileRefunds";
import { queueMonthlyDigests } from "@/lib/reports/digest";
import { runExpiredBackfill } from "@/lib/reports/rollupBackfill";
import { runStorageCleanup } from "@/lib/storage/cleanup";
import type { JobDefinition } from "./definitions";
import { enqueueDueOutbox } from "./enqueue";

const MINUTE = 60_000;

/**
 * Periodic work. Beat turns every entry into a repeatable BullMQ job; the worker runs it by `area`. New
 * periodic work is an entry here and nowhere else. A failing entry is retried by BullMQ and never stops the
 * others. The schedule is the cadence, so the reconciles and the digest skip their own in-process throttle.
 */
export const SCHEDULED_JOBS: ReadonlyArray<JobDefinition> = [
  { area: "outbox-relay", queue: "outbox", schedule: { every: MINUTE }, run: async () => {
    const result = await enqueueDueOutbox();
    // The operations page reads this row: the relay ran, even when nothing was due.
    await recordHeartbeatAlive(OUTBOX_SCHEDULER_HEARTBEAT_KEY).catch(() => undefined);
    return result;
  } },
  { area: "membership-sweep", schedule: { every: MINUTE }, run: (now) => runMembershipSweep(now) },
  { area: "payment-reconcile", schedule: { every: 5 * MINUTE }, run: (now) => reconcileGatewayPayments(now, true) },
  { area: "refund-reconcile", schedule: { every: 5 * MINUTE }, run: (now) => reconcileGatewayRefunds(now, true) },
  { area: "monthly-digest", schedule: { every: 60 * MINUTE }, run: (now) => queueMonthlyDigests(now, true) },
  { area: "expired-backfill", schedule: { every: MINUTE }, run: (now) => runExpiredBackfill(now) },
  { area: "storage-cleanup", schedule: { every: MINUTE }, run: () => runStorageCleanup() },
  { area: "operational-retention", schedule: { every: MINUTE }, run: (now) => purgeExpiredOperationalData(now) },
  { area: "worker-heartbeat", schedule: { every: MINUTE }, run: () => recordHeartbeatSuccess(WORKER_HEARTBEAT_KEY, { sent: 0, failed: 0 }) },
];

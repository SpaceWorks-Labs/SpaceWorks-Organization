import "server-only";

import { prisma } from "@/lib/db";
import { describeOperationalError } from "@/lib/redactSensitiveText";

/** Heartbeat rows: the outbox delivery ("outbox-scheduler") and the queue worker's own pulse ("worker"). */
export const OUTBOX_SCHEDULER_HEARTBEAT_KEY = "outbox-scheduler";
export const WORKER_HEARTBEAT_KEY = "worker";

// During a rolling deployment (or a Turbopack restart after a migration), an
// older generated Prisma client can briefly be alive without this delegate.
// Do not block mail delivery merely because its optional observability row
// cannot be written yet.
type OperationalHeartbeatDelegate = Pick<typeof prisma.operationalHeartbeat, "upsert">;

function getHeartbeatDelegate(): OperationalHeartbeatDelegate | undefined {
  return (prisma as unknown as { operationalHeartbeat?: OperationalHeartbeatDelegate })
    .operationalHeartbeat;
}

export async function recordHeartbeatStarted(key: string) {
  const heartbeat = getHeartbeatDelegate();
  if (!heartbeat) return;
  await heartbeat.upsert({ where: { key }, create: { key, lastStartedAt: new Date() }, update: { lastStartedAt: new Date() } });
}

export async function recordHeartbeatSuccess(key: string, result: { sent: number; failed: number }) {
  const heartbeat = getHeartbeatDelegate();
  if (!heartbeat) return;
  const now = new Date();
  await heartbeat.upsert({
    where: { key },
    create: { key, lastStartedAt: now, lastSucceededAt: now, lastSent: result.sent, lastFailed: result.failed },
    update: { lastSucceededAt: now, lastSent: result.sent, lastFailed: result.failed, lastError: null },
  });
}

/** A pass ran, with no delivery counts to report: keeps the last batch figures and error as they were. */
export async function recordHeartbeatAlive(key: string) {
  const heartbeat = getHeartbeatDelegate();
  if (!heartbeat) return;
  const now = new Date();
  await heartbeat.upsert({ where: { key }, create: { key, lastStartedAt: now, lastSucceededAt: now }, update: { lastStartedAt: now, lastSucceededAt: now } });
}

export async function recordHeartbeatFailure(key: string, error: unknown) {
  const heartbeat = getHeartbeatDelegate();
  if (!heartbeat) return;
  const message = describeOperationalError(error);
  await heartbeat.upsert({ where: { key }, create: { key, lastStartedAt: new Date(), lastError: message }, update: { lastError: message } });
}

export const recordOutboxSchedulerStarted = () => recordHeartbeatStarted(OUTBOX_SCHEDULER_HEARTBEAT_KEY);
export const recordOutboxSchedulerSuccess = (result: { sent: number; failed: number }) => recordHeartbeatSuccess(OUTBOX_SCHEDULER_HEARTBEAT_KEY, result);
export const recordOutboxSchedulerFailure = (error: unknown) => recordHeartbeatFailure(OUTBOX_SCHEDULER_HEARTBEAT_KEY, error);

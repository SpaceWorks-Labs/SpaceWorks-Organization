import "server-only";

import { prisma } from "@/lib/db";
import { fromColumn, recomputeOrgDays } from "./rollup";

/** Heartbeat row for the one-off `expired` backfill: set `lastSucceededAt` once every old day is rewritten. */
export const EXPIRED_BACKFILL_KEY = "report-rollup-expired-backfill";
const ORGS_PER_RUN = 10;
const DAYS_PER_ORG = 60;
/** The last organisation this process worked on, so one that keeps failing never holds up the ones after it. */
const STATE = Symbol.for("swo.expiredBackfill");
type StateHolder = typeof globalThis & { [STATE]?: { cursor: string | null } };

/**
 * Fill `OrgDailyStats.expired` (H6) for days rolled up before the column existed, from the scheduler pass.
 * Idempotent and resumable: a day is done once any rewrite after the backfill began (this pass or the normal
 * rollup) replaced its rows, since both recompute whole days. Each run takes a few organisations and a chunk of
 * days for each, newest first, walking the organisations by id from a cursor kept in the process. A run that finds
 * nothing after the cursor ends the pass and the next starts again from the first organisation, so one that failed
 * is retried then. When a pass from the start finds no older rows the heartbeat is marked done and later runs stop
 * after one read.
 */
export async function runExpiredBackfill(now = new Date()) {
  const key = EXPIRED_BACKFILL_KEY;
  const state = await prisma.operationalHeartbeat.findUnique({ where: { key }, select: { lastStartedAt: true, lastSucceededAt: true } });
  if (state?.lastSucceededAt) return { backfilledDays: 0, done: true };
  // Wall-clock time: `computedAt` is written with the real clock, whatever `now` the caller passes.
  let since = state?.lastStartedAt ?? null;
  if (!since) {
    since = new Date();
    await prisma.operationalHeartbeat.upsert({ where: { key }, create: { key, lastStartedAt: since }, update: { lastStartedAt: since } });
  }
  const progress = ((globalThis as StateHolder)[STATE] ??= { cursor: null });
  const after = progress.cursor;
  const pending = await prisma.orgDailyStats.groupBy({
    by: ["organisationId"],
    where: { computedAt: { lt: since }, ...(after ? { organisationId: { gt: after } } : {}) },
    orderBy: { organisationId: "asc" },
    take: ORGS_PER_RUN,
  });
  progress.cursor = pending.at(-1)?.organisationId ?? null;
  if (!pending.length && after) return { backfilledDays: 0, done: false };
  if (!pending.length) {
    const done = new Date();
    await prisma.operationalHeartbeat.update({ where: { key }, data: { lastSucceededAt: done, lastSent: 0, lastFailed: 0, lastError: null } });
    return { backfilledDays: 0, done: true };
  }
  let days = 0;
  let failed = 0;
  for (const { organisationId } of pending) {
    const stale = await prisma.orgDailyStats.groupBy({ by: ["day"], where: { organisationId, computedAt: { lt: since } }, orderBy: { day: "desc" }, take: DAYS_PER_ORG });
    try {
      await recomputeOrgDays(organisationId, stale.map((row) => fromColumn(row.day)), now);
      days += stale.length;
    } catch {
      // One organisation's bad data must not hold up the others; it is retried on the next pass.
      failed += 1;
    }
  }
  await prisma.operationalHeartbeat.update({ where: { key }, data: { lastSent: days, lastFailed: failed, lastError: failed ? `${failed} organisation(s) failed` : null } });
  return { backfilledDays: days, done: false };
}

import "server-only";

import { prisma } from "@/lib/db";
import { addDays, localDate, type CalendarDate } from "@/lib/membership/periods";
import { dayKey } from "./period";
import { dateColumn, fromColumn, recomputeOrgDays } from "./rollup";

/** Heartbeat row for the one-off `expired` backfill: set `lastSucceededAt` once every old day is rewritten. */
export const EXPIRED_BACKFILL_KEY = "report-rollup-expired-backfill";
const ORGS_PER_RUN = 10;
const DAYS_PER_ORG = 60;
/** The last organisation this process worked on, so one that keeps failing never holds up the ones after it. */
const STATE = Symbol.for("swo.expiredBackfill");
type StateHolder = typeof globalThis & { [STATE]?: { cursor: string | null } };

/**
 * Fill `OrgDailyStats.expired` (H6) for days rolled up before the column existed, from the scheduler pass.
 * Each organisation's whole calendar is rebuilt, from the local day the backfill began (it may hold rows from
 * before) back to its earliest stored day, including days with no rows: the old rollup wrote nothing for an all-zero
 * day, which may now hold expired stock. Later days are kept current by the normal rollup. An all-zero day still writes no rows, so progress is
 * kept per organisation in heartbeat `<key>:<organisationId>` (`lastStartedAt` is the oldest day rebuilt,
 * `lastSucceededAt` set once the earliest stored day is reached). Each run takes a few organisations and a chunk of
 * days for each, newest first, walking the organisations by id from a cursor kept in the process. A run that finds
 * nothing after the cursor ends the pass and the next starts again from the first organisation, so one that failed
 * is retried then. When a pass from the start finds no organisation unfinished the heartbeat is marked done, the
 * per-organisation rows are deleted (they mean nothing afterwards) and later runs stop after one read.
 */
export async function runExpiredBackfill(now = new Date()) {
  const key = EXPIRED_BACKFILL_KEY;
  const state = await prisma.operationalHeartbeat.findUnique({ where: { key }, select: { lastStartedAt: true, lastSucceededAt: true } });
  if (state?.lastSucceededAt) return { backfilledDays: 0, done: true };
  let since = state?.lastStartedAt ?? null;
  if (!since) {
    since = new Date();
    await prisma.operationalHeartbeat.upsert({ where: { key }, create: { key, lastStartedAt: since }, update: { lastStartedAt: since } });
  }
  const orgKey = (organisationId: string) => `${key}:${organisationId}`;
  const finished = await prisma.operationalHeartbeat.findMany({ where: { key: { startsWith: `${key}:` }, lastSucceededAt: { not: null } }, select: { key: true } });
  const progress = ((globalThis as StateHolder)[STATE] ??= { cursor: null });
  const after = progress.cursor;
  const pending = await prisma.orgDailyStats.groupBy({
    by: ["organisationId"],
    where: { organisationId: { notIn: finished.map((row) => row.key.slice(key.length + 1)), ...(after ? { gt: after } : {}) } },
    _min: { day: true },
    orderBy: { organisationId: "asc" },
    take: ORGS_PER_RUN,
  });
  progress.cursor = pending.at(-1)?.organisationId ?? null;
  if (!pending.length && after) return { backfilledDays: 0, done: false };
  if (!pending.length) {
    const done = new Date();
    await prisma.$transaction([
      prisma.operationalHeartbeat.update({ where: { key }, data: { lastSucceededAt: done, lastSent: 0, lastFailed: 0, lastError: null } }),
      prisma.operationalHeartbeat.deleteMany({ where: { key: { startsWith: `${key}:` } } }),
    ]);
    return { backfilledDays: 0, done: true };
  }
  const ids = pending.map((row) => row.organisationId);
  const [orgs, marks] = await Promise.all([
    prisma.organisation.findMany({ where: { id: { in: ids } }, select: { id: true, timezone: true } }),
    prisma.operationalHeartbeat.findMany({ where: { key: { in: ids.map(orgKey) } }, select: { key: true, lastStartedAt: true } }),
  ]);
  let days = 0;
  let failed = 0;
  for (const { organisationId, _min } of pending) {
    const org = orgs.find((row) => row.id === organisationId);
    if (!org || !_min.day) continue;
    const earliest = dayKey(fromColumn(_min.day));
    const mark = marks.find((row) => row.key === orgKey(organisationId))?.lastStartedAt;
    let day = mark ? addDays(fromColumn(mark), -1) : localDate(since, org.timezone);
    const chunk: CalendarDate[] = [];
    for (; chunk.length < DAYS_PER_ORG && dayKey(day) >= earliest; day = addDays(day, -1)) chunk.push(day);
    try {
      await recomputeOrgDays(organisationId, chunk, now);
      days += chunk.length;
      // The oldest day rebuilt, whether or not it wrote rows; the earliest stored day reached means done.
      const oldest = dateColumn(chunk.at(-1) ?? addDays(day, 1));
      const finishedAt = dayKey(day) < earliest ? new Date() : null;
      const id = orgKey(organisationId);
      await prisma.operationalHeartbeat.upsert({ where: { key: id }, create: { key: id, lastStartedAt: oldest, lastSucceededAt: finishedAt }, update: { lastStartedAt: oldest, lastSucceededAt: finishedAt } });
    } catch {
      // One organisation's bad data must not hold up the others; it is retried on the next pass.
      failed += 1;
    }
  }
  await prisma.operationalHeartbeat.update({ where: { key }, data: { lastSent: days, lastFailed: failed, lastError: failed ? `${failed} organisation(s) failed` : null } });
  return { backfilledDays: days, done: false };
}

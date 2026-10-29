import "server-only";

import type { Prisma } from "@prisma/client";
import { invalidateOrg } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { addDays, localDate, startOfLocalDay, type CalendarDate } from "@/lib/membership/periods";
import { dayKey } from "./period";
import { computeDayStats } from "./rollupCompute";
import { loadDataset } from "./source";

/** How far back a new organisation's history is rebuilt, and how many days one sweep may compute per organisation. */
const ROLLUP_HISTORY_DAYS = 730;
const DAYS_PER_RUN = 120;
/** Today's row is refreshed at most this often; finished days only when something marks them dirty. */
const REFRESH_MS = 15 * 60_000;

type Client = Prisma.TransactionClient | typeof prisma;

/** A calendar day as the `@db.Date` value Prisma stores. */
export function dateColumn(day: CalendarDate): Date {
  return new Date(Date.UTC(day.year, day.month - 1, day.day));
}

export function fromColumn(value: Date): CalendarDate {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

/**
 * Mark days for rebuilding because something backdated touched them: a late capture, an offline payment
 * recorded for an earlier date, a refund, or a membership correction. Pass the earliest affected instant;
 * every day from then to today is marked. P7 calls this inside its payment transactions.
 */
export async function markStatsDirty(client: Client, organisationId: string, since: Date, now = new Date()) {
  const org = await client.organisation.findUnique({ where: { id: organisationId }, select: { timezone: true } });
  if (!org) return 0;
  const today = localDate(now, org.timezone);
  let day = localDate(since > now ? now : since, org.timezone);
  const days: Date[] = [];
  for (let guard = 0; guard <= ROLLUP_HISTORY_DAYS && dayKey(day) <= dayKey(today); guard += 1) {
    days.push(dateColumn(day));
    day = addDays(day, 1);
  }
  if (!days.length) return 0;
  await client.orgStatsDirtyDay.createMany({ data: days.map((value) => ({ organisationId, day: value })), skipDuplicates: true });
  return days.length;
}

/** Rebuild whole days for one organisation from source rows: delete its rows for each day, then write them again. */
export async function recomputeOrgDays(organisationId: string, days: CalendarDate[], now = new Date()) {
  if (!days.length) return 0;
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, timezone: true } });
  if (!org) return 0;
  const data = await loadDataset({ organisationId, unitPath: null, unitId: null, planId: null, scoped: false });
  const started = new Date();
  let written = 0;
  for (const day of days) {
    const from = startOfLocalDay(day, org.timezone);
    const to = startOfLocalDay(addDays(day, 1), org.timezone);
    // A day still under way stops at now, so "active at the end of today" means active now.
    const rows = computeDayStats(data, from, to > now ? new Date(now.getTime() + 1) : to);
    await prisma.$transaction([
      prisma.orgDailyStats.deleteMany({ where: { organisationId, day: dateColumn(day) } }),
      prisma.orgDailyStats.createMany({ data: rows.map((row) => ({ organisationId, day: dateColumn(day), computedAt: started, ...row })) }),
      prisma.orgStatsDirtyDay.deleteMany({ where: { organisationId, day: dateColumn(day), markedAt: { lte: started } } }),
    ]);
    written += rows.length;
  }
  // Charts and leagues read these rows: drop the organisation's cached analytics (every unit scope).
  await invalidateOrg(organisationId, "analytics");
  return written;
}

/** Which days one organisation needs this run: dirty days, days touched by backdated changes, today, and missing history. */
export async function daysToRecompute(org: { id: string; timezone: string; createdAt: Date }, now: Date): Promise<CalendarDate[]> {
  const today = localDate(now, org.timezone);
  const [latest, earliest, dirty] = await Promise.all([
    prisma.orgDailyStats.findFirst({ where: { organisationId: org.id }, orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.orgDailyStats.findFirst({ where: { organisationId: org.id }, orderBy: { day: "asc" }, select: { day: true } }),
    prisma.orgStatsDirtyDay.findMany({ where: { organisationId: org.id }, orderBy: { day: "desc" }, take: DAYS_PER_RUN, select: { day: true } }),
  ]);
  const wanted = new Map<string, CalendarDate>();
  const add = (day: CalendarDate) => wanted.size < DAYS_PER_RUN && wanted.set(dayKey(day), day);
  for (const row of dirty) add(fromColumn(row.day));
  if (latest) {
    // Status changes recorded since the last run with an earlier domain time (backdated renewals, extensions).
    const backdated = await prisma.termStatusEvent.findFirst({
      where: { organisationId: org.id, recordedAt: { gt: latest.computedAt }, effectiveAt: { lt: startOfLocalDay(today, org.timezone) } },
      orderBy: { effectiveAt: "asc" },
      select: { effectiveAt: true },
    });
    if (backdated) await markStatsDirty(prisma, org.id, backdated.effectiveAt, now);
    if (backdated) for (const row of await prisma.orgStatsDirtyDay.findMany({ where: { organisationId: org.id }, orderBy: { day: "desc" }, take: DAYS_PER_RUN, select: { day: true } })) add(fromColumn(row.day));
    const yesterday = addDays(today, -1);
    if (latest.computedAt < startOfLocalDay(today, org.timezone)) add(yesterday);
    if (now.getTime() - latest.computedAt.getTime() >= REFRESH_MS || wanted.size) add(today);
  } else add(today);
  // Missing history: walk back from the oldest stored day towards the organisation's first day.
  const floor = localDate(new Date(Math.max(org.createdAt.getTime() - 366 * 86_400_000, now.getTime() - ROLLUP_HISTORY_DAYS * 86_400_000)), org.timezone);
  let cursor = earliest ? addDays(fromColumn(earliest.day), -1) : addDays(today, -1);
  while (wanted.size < DAYS_PER_RUN && dayKey(cursor) >= dayKey(floor)) {
    add(cursor);
    cursor = addDays(cursor, -1);
  }
  return [...wanted.values()];
}

/** The sweep's rollup pass over every organisation that runs memberships. */
export async function runStatsRollup(now = new Date()) {
  const key = ROLLUP_HEARTBEAT_KEY;
  await prisma.operationalHeartbeat.upsert({ where: { key }, create: { key, lastStartedAt: new Date() }, update: { lastStartedAt: new Date() } }).catch(() => undefined);
  const orgs = await prisma.organisation.findMany({ where: { status: { in: ["ACTIVE", "SUSPENDED"] }, terms: { some: {} } }, select: { id: true, timezone: true, createdAt: true } });
  let days = 0;
  let failed = 0;
  for (const org of orgs) {
    try {
      const wanted = await daysToRecompute(org, now);
      await recomputeOrgDays(org.id, wanted, now);
      days += wanted.length;
    } catch {
      // One organisation's bad data must not stop everyone else's numbers.
      failed += 1;
    }
  }
  const done = new Date();
  await prisma.operationalHeartbeat
    .upsert({ where: { key }, create: { key, lastStartedAt: done, lastSucceededAt: done, lastSent: days, lastFailed: failed }, update: { lastSucceededAt: done, lastSent: days, lastFailed: failed, lastError: failed ? `${failed} organisation(s) failed` : null } })
    .catch(() => undefined);
  return { rollupDays: days };
}

/** Heartbeat row for the rollup: `lastSent` holds the days computed in the last run. */
export const ROLLUP_HEARTBEAT_KEY = "report-rollup";

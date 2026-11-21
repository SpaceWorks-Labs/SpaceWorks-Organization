import "server-only";

import { OrganisationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadPlatformOutstanding, loadPlatformPaymentGroups, loadPlatformRefundGroups } from "./finance/source";
import { growthHeadlines, growthSeries, organisationSeries, organisationStatuses, type PlatformDay } from "./platformGrowth";
import { platformMoney } from "./platformMoney";
import { compare, type PlatformWindow } from "./platformRange";

const DAY = 86_400_000;
const LIVE = [OrganisationStatus.ACTIVE, OrganisationStatus.SUSPENDED];

/** The rollup summed across live organisations, one row per day from before the previous period to the end of this one. */
async function loadPlatformDays(window: PlatformWindow): Promise<PlatformDay[]> {
  const rows = await prisma.orgDailyStats.groupBy({
    by: ["day"],
    where: { planId: null, day: { gte: new Date(window.previous.from.getTime() - 40 * DAY), lt: window.to }, organisation: { status: { in: LIVE } } },
    _sum: { active: true, grace: true, expired: true, joined: true, reactivated: true, due: true, renewed: true, lapsed: true, applications: true },
  });
  return rows.map((row) => ({
    day: row.day,
    active: row._sum.active ?? 0,
    grace: row._sum.grace ?? 0,
    expired: row._sum.expired ?? 0,
    joined: row._sum.joined ?? 0,
    reactivated: row._sum.reactivated ?? 0,
    due: row._sum.due ?? 0,
    renewed: row._sum.renewed ?? 0,
    lapsed: row._sum.lapsed ?? 0,
    applications: row._sum.applications ?? 0,
  }));
}

/**
 * Members active now: each live organisation's own latest rolled-up day, summed. Rollup days are local calendar dates,
 * so an organisation ahead of UTC already has a row dated after today's UTC date; one shared cut-off would miss it.
 */
async function loadActiveNow(now: Date): Promise<number | null> {
  const cutoff = new Date(now.getTime() + DAY);
  const [row] = await prisma.$queryRaw<Array<{ active: number | null; days: number }>>`
    SELECT SUM(s."active")::int AS "active", COUNT(*)::int AS "days"
    FROM "OrgDailyStats" s
    JOIN (
      SELECT "organisationId", MAX("day") AS "day" FROM "OrgDailyStats"
      WHERE "planId" IS NULL AND "day" < ${cutoff}::date GROUP BY "organisationId"
    ) latest ON latest."organisationId" = s."organisationId" AND latest."day" = s."day"
    JOIN "Organisation" o ON o."id" = s."organisationId"
    WHERE s."planId" IS NULL AND o."status"::text IN ('ACTIVE', 'SUSPENDED')`;
  return row && row.days > 0 ? row.active ?? 0 : null;
}

/**
 * Growth and health across the platform for one range: every headline against the previous period, the
 * organisation statuses now, and per-bucket series. Counts only; nothing about a member.
 */
export async function loadPlatformGrowth(window: PlatformWindow) {
  const [days, orgs, current, previous, activeNow] = await Promise.all([
    loadPlatformDays(window),
    prisma.organisation.findMany({ select: { createdAt: true, status: true } }),
    prisma.member.count({ where: { createdAt: { lt: window.to } } }),
    prisma.member.count({ where: { createdAt: { lt: window.previous.to } } }),
    loadActiveNow(window.to),
  ]);
  const span = { from: window.from, to: window.to };
  const headlines = growthHeadlines({ days, orgs, memberCounts: { current, previous }, current: span, previous: window.previous });
  if (activeNow !== null) headlines.membersActive = compare(activeNow, headlines.membersActive.previous);
  return {
    headlines,
    organisations: organisationStatuses(orgs),
    organisationSeries: organisationSeries(orgs, window.buckets),
    series: growthSeries(days, window.buckets),
  };
}

/** Money per currency for one range, never added across currencies: totals, comparison, online against in hand, owed now, and a point per bucket. */
export async function loadPlatformMoney(window: PlatformWindow) {
  const span = { from: window.from, to: window.to };
  const [payments, refunds, previousPayments, previousRefunds, owed] = await Promise.all([
    loadPlatformPaymentGroups(span, window.unit),
    loadPlatformRefundGroups(span, window.unit),
    loadPlatformPaymentGroups(window.previous, "month"),
    loadPlatformRefundGroups(window.previous, "month"),
    loadPlatformOutstanding(),
  ]);
  return platformMoney({ buckets: window.buckets, unit: window.unit, payments, refunds, previousPayments, previousRefunds, outstanding: owed });
}

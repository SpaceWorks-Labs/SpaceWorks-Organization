import "server-only";

import { OrganisationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rollupMonths, seriesByCurrency } from "./analytics";
import { loadPlatformOutstanding, loadPlatformPaymentActivity, loadPlatformPayments, loadPlatformRefunds } from "./finance/source";
import { revenueSeries } from "./finance/revenue";
import { amountsByOrg, applicationsByMonth, comparisonRows, failuresByOrg, type MonthBucket, type OrgFacts } from "./platformAnalytics";
import { rollupAcrossTenants } from "./platform";

const DAY = 86_400_000;

/** Today as the UTC date the rollup stores, shifted by `days`. */
function rollupDay(now: Date, days = 0): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
}

/** The last 12 calendar months (UTC) as half-open instant ranges, the current one ending now. */
export function platformMonths(now: Date): MonthBucket[] {
  return rollupMonths(now).map((month) => {
    const next = new Date(Date.UTC(month.first.getUTCFullYear(), month.first.getUTCMonth() + 1, 1));
    return { key: month.key, label: month.label, from: month.first, to: next > now ? now : next };
  });
}

/** Each organisation's latest staff sign-in (known-device sign-ins of its team, platform admins left out). */
export async function lastStaffSignIns(organisationIds: string[]): Promise<Map<string, Date>> {
  const team = await prisma.teamMember.findMany({
    where: { organisationId: { in: organisationIds }, user: { isSuperAdmin: false } },
    select: { organisationId: true, user: { select: { knownDevices: { orderBy: { lastSeenAt: "desc" }, take: 1, select: { lastSeenAt: true } } } } },
  });
  const latest = new Map<string, Date>();
  for (const row of team) {
    const seen = row.user.knownDevices[0]?.lastSeenAt;
    if (seen && (!latest.has(row.organisationId) || seen > latest.get(row.organisationId)!)) latest.set(row.organisationId, seen);
  }
  return latest;
}

/**
 * Active members (all-plans rows, units added) per organisation on its latest rolled-up day and 30 and 90 days
 * before. Local days run up to a day ahead of UTC, so tomorrow (UTC) is allowed.
 */
async function rollupStocks(organisationIds: string[], now: Date) {
  const latest = await prisma.orgDailyStats.groupBy({ by: ["organisationId"], where: { organisationId: { in: organisationIds }, planId: null, day: { lte: rollupDay(now, 1) } }, _max: { day: true } });
  const anchors = new Map(latest.flatMap((row) => (row._max.day ? [[row.organisationId, row._max.day] as const] : [])));
  const shift = (day: Date, days: number) => new Date(day.getTime() - days * DAY);
  const days = new Set<number>();
  for (const day of anchors.values()) for (const back of [0, 30, 90]) days.add(shift(day, back).getTime());
  const rows = days.size
    ? await prisma.orgDailyStats.groupBy({ by: ["organisationId", "day"], where: { organisationId: { in: [...anchors.keys()] }, planId: null, day: { in: [...days].map((time) => new Date(time)) } }, _sum: { active: true } })
    : [];
  const at = (id: string, day: Date) => rows.find((row) => row.organisationId === id && row.day.getTime() === day.getTime())?._sum.active ?? 0;
  return new Map([...anchors].map(([id, day]) => [id, { day, active: at(id, day), active30: at(id, shift(day, 30)), active90: at(id, shift(day, 90)) }]));
}

/**
 * H7 comparison table and platform trends. Aggregates only: counts, rollup sums and money per currency per
 * organisation. Nothing here reads a member's name, email or phone.
 */
export async function loadPlatformAnalytics(now: Date) {
  const months = platformMonths(now);
  const year = { from: months[0].from, to: now };
  const since30 = new Date(now.getTime() - 30 * DAY);
  const orgs = await prisma.organisation.findMany({
    where: { status: { in: [OrganisationStatus.ACTIVE, OrganisationStatus.SUSPENDED] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true, createdAt: true, memberLimit: true, managerLimit: true, _count: { select: { members: true, teamMembers: true } } },
  });
  const ids = orgs.map((org) => org.id);
  const [stocks, flows, payments, refunds, outstanding, activity, signIns, reviews, webhooks, outbox, tenants] = await Promise.all([
    rollupStocks(ids, now),
    prisma.orgDailyStats.groupBy({ by: ["organisationId"], where: { organisationId: { in: ids }, planId: null, day: { gt: rollupDay(now, -365) } }, _sum: { renewed: true, lapsed: true } }),
    loadPlatformPayments(year),
    loadPlatformRefunds(year),
    loadPlatformOutstanding(),
    loadPlatformPaymentActivity(since30),
    lastStaffSignIns(ids),
    prisma.organisationReview.findMany({ where: { createdAt: { gte: months[0].from } }, select: { action: true, createdAt: true } }),
    prisma.auditEvent.groupBy({ by: ["organisationId"], where: { action: "PAYMENT_WEBHOOK_UNMATCHED", createdAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.$queryRaw<Array<{ organisationId: string | null; failed: bigint }>>`SELECT "payload"->>'organisationId' AS "organisationId", count(*) AS "failed" FROM "OutboxMessage" WHERE "status" = 'FAILED' AND "createdAt" >= ${since30} GROUP BY 1`,
    rollupAcrossTenants(now),
  ]);
  const revenue = amountsByOrg(payments, refunds);
  const owed = amountsByOrg(outstanding);
  const facts: OrgFacts[] = orgs.map((org) => {
    const stock = stocks.get(org.id);
    const flow = flows.find((row) => row.organisationId === org.id)?._sum;
    return {
      id: org.id,
      name: org.name,
      status: org.status,
      createdAt: org.createdAt,
      members: org._count.members,
      memberLimit: org.memberLimit,
      team: org._count.teamMembers,
      managerLimit: org.managerLimit,
      active: stock?.active ?? null,
      active30: stock ? stock.active30 : null,
      active90: stock ? stock.active90 : null,
      renewed: flow?.renewed ?? 0,
      lapsed: flow?.lapsed ?? 0,
      revenue: revenue.get(org.id) ?? [],
      outstanding: owed.get(org.id) ?? [],
      lastSignIn: signIns.get(org.id) ?? null,
      lastPayment: activity.lastPaid.get(org.id) ?? null,
    };
  });
  const names = new Map(orgs.map((org) => [org.id, org.name]));
  return {
    rows: comparisonRows(facts, now),
    trends: {
      members: tenants.series,
      applications: applicationsByMonth(reviews, months),
      revenue: seriesByCurrency(revenueSeries({ payments, refunds, lines: [], documents: [], unpaidTerms: [] }, months)),
      failures: failuresByOrg(
        names,
        activity.failed,
        new Map(webhooks.flatMap((row) => (row.organisationId ? [[row.organisationId, row._count._all] as const] : []))),
        new Map(outbox.flatMap((row) => (row.organisationId ? [[row.organisationId, Number(row.failed)] as const] : []))),
      ),
    },
  };
}

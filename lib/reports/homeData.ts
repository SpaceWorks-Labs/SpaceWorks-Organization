import "server-only";

import { ANALYTICS_TTL_SECONDS, analyticsCacheKey, cached } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { can, type StaffMembership } from "@/lib/permissions";
import { teamScope } from "@/lib/membership/scope";
import { dueByWeek, dueWindowEnd, seriesByCurrency } from "./analytics";
import { loadCollections, loadOpenCharges } from "./finance/source";
import { revenueSeries } from "./finance/revenue";
import { membershipTrend } from "./metrics/series";
import { totals } from "./money";
import { periodBuckets, resolvePeriod, type Bucket } from "./period";
import { rollupTrend } from "./rollupRead";
import { loadDataset, reportScope, scopedTermWhere, type ReportScope } from "./source";

type HomeOrg = { id: string; timezone: string; financialYearStartMonth: number; currency: string };

/** Active members, joins and lapses per month (rollup when it covers the year, else live), and renewals due soon. */
async function membershipCharts(scope: ReportScope, buckets: Bucket[], timezone: string, now: Date) {
  const rolled = await rollupTrend(scope, buckets, timezone, now);
  const points = rolled ?? membershipTrend(await loadDataset(scope), buckets, now);
  const ending = await prisma.membershipTerm.findMany({
    where: {
      ...scopedTermWhere(scope),
      status: "ACTIVE",
      endsAt: { gte: now, lt: dueWindowEnd(now, timezone) },
      renewals: { none: { status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED"] } } },
    },
    select: { endsAt: true },
  });
  return {
    source: rolled ? ("rollup" as const) : ("live" as const),
    months: points.map((point) => ({ key: point.key, label: point.label, active: point.active, joined: point.joined, lapsed: point.lapsed })),
    due: dueByWeek(ending.flatMap((term) => (term.endsAt ? [term.endsAt] : [])), now, timezone),
  };
}

/** Money collected per month and currency (net of refunds), and what is owed now, from lib/reports/finance/source.ts. */
async function moneyCharts(scope: ReportScope, buckets: Bucket[], primary: string, now: Date) {
  const [collections, open] = await Promise.all([loadCollections(scope, { from: buckets[0].from, to: now }), loadOpenCharges(scope)]);
  const points = revenueSeries({ payments: collections.payments, refunds: collections.refunds, lines: [], documents: [], unpaidTerms: [] }, buckets, primary);
  return {
    currencies: seriesByCurrency(points, primary),
    outstanding: totals([...open.payments, ...open.unpaidTerms], (row) => ({ currency: row.currency, minor: row.amountMinor }), primary),
    outstandingCount: open.payments.length + open.unpaidTerms.length,
  };
}

/**
 * The dashboard home's charts (H6), inside the viewer's unit scope. Membership charts need
 * `reports.membership`; money needs `reports.finance`. Null when the viewer may see neither. Each half is
 * cached for a few minutes under the viewer's unit scope; the permission checks stay outside the cache.
 */
export async function loadHomeAnalytics(org: HomeOrg, membership: StaffMembership, now: Date) {
  const members = can(membership, "reports.membership");
  const money = can(membership, "reports.finance");
  if (!members && !money) return null;
  const scope = await reportScope(await teamScope(org.id, membership.unitId), {});
  const period = resolvePeriod({ period: "12m" }, org, now);
  const buckets = periodBuckets(period, org.timezone, "month").slice(-12);
  const [membershipView, moneyView] = await Promise.all([
    members ? cached(analyticsCacheKey(org.id, scope.unitId, "home-members"), ANALYTICS_TTL_SECONDS, () => membershipCharts(scope, buckets, org.timezone, now)) : null,
    money ? cached(analyticsCacheKey(org.id, scope.unitId, "home-money"), ANALYTICS_TTL_SECONDS, () => moneyCharts(scope, buckets, org.currency, now)) : null,
  ]);
  return { scoped: scope.scoped, currency: org.currency, membership: membershipView, money: moneyView };
}

export type HomeAnalytics = NonNullable<Awaited<ReturnType<typeof loadHomeAnalytics>>>;

import "server-only";

import { prisma } from "@/lib/db";
import { monthlyFromDays, rollupMonths, rollupRenewalRate, seriesByCurrency } from "./analytics";
import { loadCollections, loadOpenCharges, loadPlatformPaymentActivity } from "./finance/source";
import { revenueSeries } from "./finance/revenue";
import { totals } from "./money";
import { topLevelBreakdown } from "./platformAnalytics";
import { lastStaffSignIns, platformMonths } from "./platformAnalyticsSource";
import type { ReportScope } from "./source";

/**
 * H7 one organisation's analytics for the platform super admin: member trend, renewal rate, revenue per
 * currency, the breakdown by top level and limits used. Aggregates only (owner decision 3): the result holds
 * counts, unit names and money totals, never a member's name, email or phone. Null for an unknown organisation.
 */
export async function loadOrgAnalytics(organisationId: string, now: Date) {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, status: true, currency: true, unitLevels: true, memberLimit: true, managerLimit: true, createdAt: true, _count: { select: { members: true, teamMembers: true } } },
  });
  if (!org) return null;
  const months = rollupMonths(now);
  const buckets = platformMonths(now);
  const scope: ReportScope = { organisationId: org.id, unitPath: null, unitId: null, planId: null, scoped: false };
  const [days, latest, units, collections, open, activity, signIns] = await Promise.all([
    prisma.orgDailyStats.groupBy({ by: ["day"], where: { organisationId: org.id, planId: null, day: { gte: months[0].first } }, _sum: { active: true, grace: true, expired: true, joined: true, lapsed: true, renewed: true } }),
    prisma.orgDailyStats.findFirst({ where: { organisationId: org.id, planId: null }, orderBy: { day: "desc" }, select: { day: true } }),
    prisma.orgUnit.findMany({ where: { organisationId: org.id }, select: { id: true, name: true, path: true } }),
    loadCollections(scope, { from: buckets[0].from, to: now }),
    loadOpenCharges(scope),
    loadPlatformPaymentActivity(new Date(now.getTime() - 30 * 86_400_000)),
    lastStaffSignIns([org.id]),
  ]);
  const trend = monthlyFromDays(
    days.map((row) => ({ day: row.day, active: row._sum.active ?? 0, grace: row._sum.grace ?? 0, expired: row._sum.expired ?? 0, joined: row._sum.joined ?? 0, lapsed: row._sum.lapsed ?? 0, renewed: row._sum.renewed ?? 0 })),
    months,
  );
  const renewed = trend.reduce((sum, point) => sum + point.renewed, 0);
  const lapsed = trend.reduce((sum, point) => sum + point.lapsed, 0);
  const unitRows = latest ? await prisma.orgDailyStats.findMany({ where: { organisationId: org.id, planId: null, day: latest.day }, select: { unitId: true, active: true, grace: true, expired: true } }) : [];
  const revenue = seriesByCurrency(revenueSeries({ payments: collections.payments, refunds: collections.refunds, lines: [], documents: [], unpaidTerms: [] }, buckets, org.currency), org.currency);
  return {
    org: { id: org.id, name: org.name, status: org.status, createdAt: org.createdAt },
    trend,
    renewal: { renewed, lapsed, rate: rollupRenewalRate(renewed, lapsed) },
    revenue,
    outstanding: totals([...open.payments, ...open.unpaidTerms], (row) => ({ currency: row.currency, minor: row.amountMinor }), org.currency),
    levelName: org.unitLevels[0] ?? "Unit",
    breakdown: units.length ? topLevelBreakdown(unitRows, units) : [],
    rollupDay: latest?.day ?? null,
    limits: { members: org._count.members, memberLimit: org.memberLimit, team: org._count.teamMembers, managerLimit: org.managerLimit },
    lastSignIn: signIns.get(org.id) ?? null,
    lastPayment: activity.lastPaid.get(org.id) ?? null,
    failedPayments30: activity.failed.get(org.id) ?? 0,
  };
}

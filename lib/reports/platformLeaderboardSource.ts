import "server-only";

import { OrganisationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadPlatformMoneyByOrg, loadPlatformPaymentActivity } from "./finance/source";
import type { LeaderboardFacts } from "./platformLeaderboard";
import { amountsByOrg } from "./platformAnalytics";
import { lastStaffSignIns } from "./platformAnalyticsSource";
import type { PlatformWindow } from "./platformRange";

/** Active members per organisation on its latest rolled-up day before `instant` (organisations with no earlier rollup are absent). */
async function activeBefore(organisationIds: string[], instant: Date): Promise<Map<string, number>> {
  const latest = await prisma.orgDailyStats.groupBy({ by: ["organisationId"], where: { organisationId: { in: organisationIds }, planId: null, day: { lt: instant } }, _max: { day: true } });
  const anchors = new Map(latest.flatMap((row) => (row._max.day ? [[row.organisationId, row._max.day] as const] : [])));
  if (!anchors.size) return new Map();
  const wanted = new Set([...anchors.values()].map((day) => day.getTime()));
  const rows = await prisma.orgDailyStats.groupBy({ by: ["organisationId", "day"], where: { organisationId: { in: [...anchors.keys()] }, planId: null, day: { in: [...wanted].map((time) => new Date(time)) } }, _sum: { active: true } });
  const sums = new Map(rows.map((row) => [`${row.organisationId}:${row.day.getTime()}`, row._sum.active ?? 0]));
  return new Map([...anchors].map(([id, day]) => [id, sums.get(`${id}:${day.getTime()}`) ?? 0]));
}

const latest = (...dates: Array<Date | null | undefined>): Date | null => dates.reduce<Date | null>((best, date) => (date && (!best || date > best) ? date : best), null);

/**
 * One fact row per live (active or suspended) organisation for the range: members, growth, renewals, net revenue
 * per currency and last activity. Aggregates only; nothing about a member.
 */
export async function loadLeaderboardFacts(window: PlatformWindow): Promise<LeaderboardFacts[]> {
  const orgs = await prisma.organisation.findMany({ where: { status: { in: [OrganisationStatus.ACTIVE, OrganisationStatus.SUSPENDED] } }, select: { id: true, name: true, slug: true, status: true, createdAt: true } });
  const ids = orgs.map((org) => org.id);
  if (!ids.length) return [];
  const [members, newest, start, end, flows, money, activity, signIns] = await Promise.all([
    prisma.member.groupBy({ by: ["organisationId"], where: { organisationId: { in: ids } }, _count: { _all: true } }),
    prisma.member.groupBy({ by: ["organisationId"], where: { organisationId: { in: ids } }, _max: { createdAt: true } }),
    activeBefore(ids, window.from),
    activeBefore(ids, window.to),
    prisma.orgDailyStats.groupBy({ by: ["organisationId"], where: { organisationId: { in: ids }, planId: null, day: { gte: window.from, lt: window.to } }, _sum: { renewed: true, lapsed: true } }),
    loadPlatformMoneyByOrg({ from: window.from, to: window.to }),
    loadPlatformPaymentActivity(window.to),
    lastStaffSignIns(ids),
  ]);
  const revenue = amountsByOrg(money.payments, money.refunds);
  const countOf = new Map(members.map((row) => [row.organisationId, row._count._all]));
  const newestOf = new Map(newest.map((row) => [row.organisationId, row._max.createdAt]));
  const flowOf = new Map(flows.map((row) => [row.organisationId, row._sum]));
  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    createdAt: org.createdAt,
    members: countOf.get(org.id) ?? 0,
    activeStart: start.get(org.id) ?? null,
    activeEnd: end.get(org.id) ?? null,
    renewed: flowOf.get(org.id)?.renewed ?? 0,
    lapsed: flowOf.get(org.id)?.lapsed ?? 0,
    revenue: revenue.get(org.id) ?? [],
    lastActivityAt: latest(activity.lastPaid.get(org.id), signIns.get(org.id), newestOf.get(org.id)),
  }));
}

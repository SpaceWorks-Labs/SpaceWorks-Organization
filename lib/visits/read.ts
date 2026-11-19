import "server-only";

import { prisma } from "@/lib/db";
import { ANALYTICS_TTL_SECONDS, analyticsCacheKey, cached, platformCacheKey } from "@/lib/cache";
import { eachDay, summariseVisits, type VisitSummary } from "@/lib/reports/visits";

const CHANNEL = "web";
const asDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

/** The day range ending today (UTC) and covering `days` days. */
export function recentDays(days: number, now = new Date()) {
  const last = now.toISOString().slice(0, 10);
  const first = new Date(Date.parse(`${last}T00:00:00.000Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { firstDay: first, lastDay: last };
}

/**
 * Visits for one organisation, or for the platform's own pages (`organisationId` null). Cached under the
 * organisation's analytics key (organisation-wide, so the same for every viewer; permission checks stay with the
 * caller) or the platform key. Counts only; the five-minute staleness is harmless.
 */
export async function loadVisitSummary(organisationId: string | null, firstDay: string, lastDay: string): Promise<VisitSummary> {
  if (!eachDay(firstDay, lastDay).length) return summariseVisits([], firstDay, lastDay);
  const key = organisationId ? analyticsCacheKey(organisationId, null, "visits", firstDay, lastDay) : platformCacheKey("analytics", "visits", firstDay, lastDay);
  return cached(key, ANALYTICS_TTL_SECONDS, async () => {
    const rows = await prisma.webVisitDaily.findMany({
      where: { organisationId, channel: CHANNEL, day: { gte: asDate(firstDay), lte: asDate(lastDay) } },
      select: { day: true, route: true, count: true },
    });
    return summariseVisits(rows.map((row) => ({ day: row.day.toISOString().slice(0, 10), route: row.route, count: row.count })), firstDay, lastDay);
  });
}

/** Total visits per organisation over a range, for the platform overview (aggregates only). */
export async function loadVisitTotalsByOrganisation(firstDay: string, lastDay: string): Promise<Record<string, number>> {
  return cached(platformCacheKey("analytics", "visits-by-org", firstDay, lastDay), ANALYTICS_TTL_SECONDS, async () => {
    const groups = await prisma.webVisitDaily.groupBy({
      by: ["organisationId"],
      where: { organisationId: { not: null }, channel: CHANNEL, day: { gte: asDate(firstDay), lte: asDate(lastDay) } },
      _sum: { count: true },
    });
    return Object.fromEntries(groups.flatMap((group) => (group.organisationId ? [[group.organisationId, group._sum.count ?? 0]] : [])));
  });
}

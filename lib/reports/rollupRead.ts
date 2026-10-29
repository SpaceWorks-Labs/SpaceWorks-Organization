import "server-only";

import { prisma } from "@/lib/db";
import { addDays, localDate } from "@/lib/membership/periods";
import type { Bucket } from "./period";
import { dateColumn } from "./rollup";
import type { ReportScope } from "./source";

type RollupPoint = { key: string; label: string; active: number; grace: number; expired: number; joined: number; lapsed: number; renewed: number; due: number; applications: number };

/**
 * A trend from OrgDailyStats: stocks read on each bucket's last day, flows summed over its days. Rows are
 * the scope's plan (or the all-plans rows) for the units in its subtree. Returns null when any day the
 * trend needs has not been rolled up yet, so the caller computes it live instead of showing a hole.
 */
export async function rollupTrend(scope: ReportScope, buckets: Bucket[], timezone: string, now: Date): Promise<RollupPoint[] | null> {
  const live = buckets.filter((bucket) => bucket.from <= now);
  if (!live.length) return [];
  const first = localDate(live[0].from, timezone);
  const last = localDate(new Date(Math.min(live.at(-1)!.to.getTime(), now.getTime() + 1) - 1), timezone);
  const unitIds = scope.unitPath
    ? (await prisma.orgUnit.findMany({ where: { organisationId: scope.organisationId, OR: [{ path: scope.unitPath }, { path: { startsWith: `${scope.unitPath}/` } }] }, select: { id: true } })).map((unit) => unit.id)
    : null;
  const rows = await prisma.orgDailyStats.groupBy({
    by: ["day"],
    where: { organisationId: scope.organisationId, planId: scope.planId, day: { gte: dateColumn(first), lte: dateColumn(last) }, ...(unitIds ? { unitId: { in: unitIds } } : {}) },
    _sum: { active: true, grace: true, expired: true, joined: true, lapsed: true, renewed: true, due: true, applications: true },
  });
  // Coverage: the rollup must reach back to the trend's first day and be fresh (computed within a day).
  // Days with nothing in them have no rows, so coverage is judged by the oldest day and the latest run.
  const [oldest, latest] = await Promise.all([
    prisma.orgDailyStats.findFirst({ where: { organisationId: scope.organisationId }, orderBy: { day: "asc" }, select: { day: true } }),
    prisma.orgDailyStats.findFirst({ where: { organisationId: scope.organisationId }, orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
  ]);
  if (!oldest || !latest || oldest.day > dateColumn(first) || now.getTime() - latest.computedAt.getTime() > 86_400_000) return null;
  const byDay = new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), row._sum]));
  return live.map((bucket) => {
    const start = localDate(bucket.from, timezone);
    const end = localDate(new Date(Math.min(bucket.to.getTime(), now.getTime() + 1) - 1), timezone);
    const point: RollupPoint = { key: bucket.key, label: bucket.label, active: 0, grace: 0, expired: 0, joined: 0, lapsed: 0, renewed: 0, due: 0, applications: 0 };
    for (let day = start, guard = 0; dateColumn(day) <= dateColumn(end) && guard < 400; day = addDays(day, 1), guard += 1) {
      const sum = byDay.get(dateColumn(day).toISOString().slice(0, 10));
      if (!sum) continue;
      point.joined += sum.joined ?? 0;
      point.lapsed += sum.lapsed ?? 0;
      point.renewed += sum.renewed ?? 0;
      point.due += sum.due ?? 0;
      point.applications += sum.applications ?? 0;
    }
    const close = byDay.get(dateColumn(end).toISOString().slice(0, 10));
    point.active = close?.active ?? 0;
    point.grace = close?.grace ?? 0;
    point.expired = close?.expired ?? 0;
    return point;
  });
}

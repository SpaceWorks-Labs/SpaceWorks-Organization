import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, financialYearStart, localDate, startOfLocalDay } from "@/lib/membership/periods";
import type { LiveStatResult, LiveStatsData } from "./blockData";
import { MIN_PUBLIC_COUNT, publicTotal, suppressSmallCounts, type CountRow } from "./live";
import { GROWTH_DAYS, LIVE_STAT_LABELS, type PageDocument, type SectionOf } from "./sections";

/**
 * The numbers block's figures: aggregates only, no name, id or contact detail. Every count under MIN_PUBLIC_COUNT is
 * removed (lib/publicPage/live.ts), a breakdown with one hidden row also hides its smallest shown row, and growth
 * shows a percentage only when both sides are large enough. `scopePath` limits everything to an area's subtree (the
 * area's path, ancestor ids joined by "/"). Callers cache the result under the organisation's public-page key.
 */

type Metric = SectionOf<"liveStats">["metrics"][number];
export type LiveStatsSettings = { financialYearStartMonth: number; timezone: string; unitLevels: string[] };

const CURRENT = ["ACTIVE", "GRACE"] as const;

/** Members whose unit is the area or below it. Paths are ids joined by "/", so a prefix with "/" can't match a sibling. */
const unitScope = (organisationId: string, scopePath: string | null): Prisma.MemberWhereInput =>
  scopePath ? { unit: { organisationId, OR: [{ path: scopePath }, { path: { startsWith: `${scopePath}/` } }] } } : {};

const scopeSql = (organisationId: string, scopePath: string | null) =>
  scopePath
    ? Prisma.sql`AND m."unitId" IN (SELECT su."id" FROM "OrgUnit" su WHERE su."organisationId" = ${organisationId} AND (su."path" = ${scopePath} OR su."path" LIKE ${`${scopePath}/%`}))`
    : Prisma.empty;

const currentMembers = (organisationId: string, scopePath: string | null): Prisma.MemberWhereInput => ({
  organisationId, anonymisedAt: null, terms: { some: { organisationId, status: { in: [...CURRENT] } } }, ...unitScope(organisationId, scopePath),
});

/** The visible numbers blocks of a document that have something to count. */
export const liveStatsSections = (document: Pick<PageDocument, "sections">) =>
  document.sections.filter((section): section is SectionOf<"liveStats"> => section.type === "liveStats" && section.visible && section.metrics.length > 0);

/** `scopeLevel` is the area's level (null for the whole organisation); it names the "by area" breakdown. */
export async function loadLiveStats(organisationId: string, document: Pick<PageDocument, "sections">, scopePath: string | null, settings: LiveStatsSettings, scopeLevel: number | null = null, now = new Date()): Promise<LiveStatsData | null> {
  const sections = liveStatsSections(document);
  if (!sections.length) return null;
  const groupingIds = [...new Set(sections.flatMap((section) => section.metrics.flatMap((metric) => (metric.kind === "byGrouping" && metric.groupingId ? [metric.groupingId] : []))))];
  const groupings = groupingIds.length ? await prisma.orgGrouping.findMany({ where: { organisationId, id: { in: groupingIds }, archivedAt: null }, select: { id: true, name: true } }) : [];
  const groupingName = new Map(groupings.map((grouping) => [grouping.id, grouping.name]));
  const out: LiveStatsData = {};
  for (const section of sections) {
    const results = await Promise.all(section.metrics.map((metric) => one(organisationId, metric, scopePath, scopeLevel, settings, groupingName, now)));
    out[section.id] = results.filter((result): result is LiveStatResult => result !== null);
  }
  return out;
}

/**
 * Every metric the editor can offer (each period, plus one per grouping), organisation-wide, so a numbers block can be
 * edited live. The same aggregates and suppression as a published block; the editor is the only reader.
 */
export async function loadStatsCatalogue(organisationId: string, groupings: Array<{ id: string; name: string }>, settings: LiveStatsSettings, now = new Date()): Promise<LiveStatResult[]> {
  const names = new Map(groupings.map((grouping) => [grouping.id, grouping.name]));
  const plain = { label: "", groupingId: "", days: 90 as const };
  const metrics: Metric[] = [
    { ...plain, kind: "total" }, { ...plain, kind: "joinsThisYear" }, { ...plain, kind: "byArea" }, { ...plain, kind: "byPlan" },
    ...GROWTH_DAYS.map((days): Metric => ({ ...plain, kind: "growth", days })),
    ...groupings.map((grouping): Metric => ({ ...plain, kind: "byGrouping", groupingId: grouping.id })),
  ];
  const results = await Promise.all(metrics.map((metric) => one(organisationId, metric, null, null, settings, names, now)));
  return results.filter((result): result is LiveStatResult => result !== null);
}

async function one(organisationId: string, metric: Metric, scopePath: string | null, scopeLevel: number | null, settings: LiveStatsSettings, groupingName: Map<string, string>, now: Date): Promise<LiveStatResult | null> {
  const label = (fallback: string) => metric.label || fallback;
  const blank = { value: null, percent: null, rows: [] as CountRow[] };
  switch (metric.kind) {
    case "total": {
      const count = await prisma.member.count({ where: currentMembers(organisationId, scopePath) });
      return { kind: metric.kind, label: label(LIVE_STAT_LABELS.total), ...blank, value: publicTotal(count) };
    }
    case "joinsThisYear": {
      const start = startOfLocalDay(financialYearStart(localDate(now, settings.timezone), settings.financialYearStartMonth), settings.timezone);
      const count = await prisma.member.count({ where: { organisationId, anonymisedAt: null, createdAt: { gte: start }, ...unitScope(organisationId, scopePath) } });
      return { kind: metric.kind, label: label(LIVE_STAT_LABELS.joinsThisYear), ...blank, value: publicTotal(count) };
    }
    case "growth": {
      const since = startOfLocalDay(addDays(localDate(now, settings.timezone), -metric.days), settings.timezone);
      const [joined, before] = await Promise.all([
        prisma.member.count({ where: { organisationId, anonymisedAt: null, createdAt: { gte: since }, ...unitScope(organisationId, scopePath) } }),
        prisma.member.count({ where: { organisationId, anonymisedAt: null, createdAt: { lt: since }, ...unitScope(organisationId, scopePath) } }),
      ]);
      const percent = joined >= MIN_PUBLIC_COUNT && before >= MIN_PUBLIC_COUNT ? Math.round((joined / before) * 100) : null;
      return { kind: metric.kind, days: metric.days, label: label(`New members in ${metric.days} days`), ...blank, value: publicTotal(joined), percent };
    }
    case "byArea": {
      const named = settings.unitLevels[scopeLevel === null ? 0 : scopeLevel + 1];
      return { kind: metric.kind, label: label(named ? `Members by ${named.toLowerCase()}` : LIVE_STAT_LABELS.byArea), ...blank, rows: suppressSmallCounts(await byArea(organisationId, scopePath)) };
    }
    case "byPlan": return { kind: metric.kind, label: label(LIVE_STAT_LABELS.byPlan), ...blank, rows: suppressSmallCounts(await byPlan(organisationId, scopePath)) };
    case "byGrouping": {
      const name = groupingName.get(metric.groupingId);
      if (!name) return null;
      return { kind: metric.kind, groupingId: metric.groupingId, label: label(`Members by ${name.toLowerCase()}`), ...blank, rows: suppressSmallCounts(await byGrouping(organisationId, metric.groupingId, scopePath)) };
    }
  }
}

const toRows = (rows: Array<{ label: string; count: number }>): CountRow[] => rows.map((row) => ({ label: row.label, count: Number(row.count) }));

/** By the units directly below the scope (the top level without one); members in the scope unit itself are not a row. */
async function byArea(organisationId: string, scopePath: string | null): Promise<CountRow[]> {
  const depth = scopePath ? scopePath.split("/").length + 1 : 1;
  return toRows(await prisma.$queryRaw<Array<{ label: string; count: number }>>`
    SELECT child."name" AS label, count(DISTINCT m."id")::int AS count
    FROM "Member" m
    JOIN "OrgUnit" u ON u."id" = m."unitId" AND u."organisationId" = m."organisationId"
    JOIN "OrgUnit" child ON child."id" = split_part(u."path", '/', ${depth}::int) AND child."organisationId" = m."organisationId"
    WHERE m."organisationId" = ${organisationId} AND m."anonymisedAt" IS NULL AND child."archivedAt" IS NULL
      ${scopeSql(organisationId, scopePath)}
      AND EXISTS (SELECT 1 FROM "MembershipTerm" t WHERE t."memberId" = m."id" AND t."organisationId" = m."organisationId" AND t."status"::text IN ('ACTIVE', 'GRACE'))
    GROUP BY child."id", child."name"`);
}

async function byPlan(organisationId: string, scopePath: string | null): Promise<CountRow[]> {
  return toRows(await prisma.$queryRaw<Array<{ label: string; count: number }>>`
    SELECT p."name" AS label, count(DISTINCT t."memberId")::int AS count
    FROM "MembershipTerm" t
    JOIN "MembershipPlan" p ON p."id" = t."planId" AND p."organisationId" = t."organisationId"
    JOIN "Member" m ON m."id" = t."memberId" AND m."organisationId" = t."organisationId"
    WHERE t."organisationId" = ${organisationId} AND t."status"::text IN ('ACTIVE', 'GRACE')
      AND p."archivedAt" IS NULL AND m."anonymisedAt" IS NULL ${scopeSql(organisationId, scopePath)}
    GROUP BY p."id", p."name"`);
}

async function byGrouping(organisationId: string, groupingId: string, scopePath: string | null): Promise<CountRow[]> {
  return toRows(await prisma.$queryRaw<Array<{ label: string; count: number }>>`
    SELECT v."label" AS label, count(DISTINCT m."id")::int AS count
    FROM "MemberGroupingValue" mv
    JOIN "OrgGroupingValue" v ON v."id" = mv."valueId" AND v."organisationId" = mv."organisationId" AND v."groupingId" = mv."groupingId"
    JOIN "Member" m ON m."id" = mv."memberId" AND m."organisationId" = mv."organisationId"
    WHERE mv."organisationId" = ${organisationId} AND mv."groupingId" = ${groupingId} AND v."archivedAt" IS NULL AND m."anonymisedAt" IS NULL
      ${scopeSql(organisationId, scopePath)}
      AND EXISTS (SELECT 1 FROM "MembershipTerm" t WHERE t."memberId" = m."id" AND t."organisationId" = m."organisationId" AND t."status"::text IN ('ACTIVE', 'GRACE'))
    GROUP BY v."id", v."label"`);
}

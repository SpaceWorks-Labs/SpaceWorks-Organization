import { ANALYTICS_TTL_SECONDS, analyticsCacheKey, cached } from "@/lib/cache";
import { inSubtree, prepareDataset } from "@/lib/reports/dataset";
import { drillHref } from "@/lib/reports/drillLinks";
import { filterQuery, type ReportSearch } from "@/lib/reports/context";
import { loadCollections, loadOpenCharges } from "@/lib/reports/finance/source";
import { levelLeague } from "@/lib/reports/metrics/levels";
import { drillFilters, openReport, reportShell } from "@/lib/reports/shell";
import { loadReportRows } from "@/lib/reports/source";

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

/**
 * H6 drill-down by level: a league table of the units one level below the current one (the top level for
 * organisation-wide staff, the viewer's own unit for scoped staff). The unit filter picks the level and can
 * only narrow the viewer's scope (lib/reports/source.ts reportScope). Money needs `reports.finance`. The league
 * (aggregates only) is cached for a few minutes, keyed by the unit in force, plan, period and whether it has money.
 */
export async function loadOrgReportsUnits({ params, searchParams }: Props) {
  const ctx = await openReport(params, searchParams, "reports.membership");
  const { now, period, scope, org, team } = ctx;
  const finance = ctx.can("reports.finance");
  const key = analyticsCacheKey(org.id, scope.unitId, "units", scope.planId ?? "all", `${period.from.getTime()}-${period.to.getTime()}`, finance ? "money" : "members");
  const league = await cached(key, ANALYTICS_TTL_SECONDS, async () => {
    const [rows, collections, open] = await Promise.all([
      loadReportRows(scope),
      finance ? loadCollections(scope, { from: period.from, to: period.to }) : null,
      finance ? loadOpenCharges(scope) : null,
    ]);
    const money = collections && open ? { paid: collections.payments, refunds: collections.refunds, open: open.payments, unpaid: open.unpaidTerms } : null;
    return levelLeague(prepareDataset(rows), ctx.allUnits, scope.unitPath, period, now, money, org.currency);
  });

  const base = `/dashboard/${org.slug}/reports/units`;
  const at = (unitId: string | null) => `${base}${filterQuery({ ...ctx.filters, unit: unitId && unitId !== team.unitId ? unitId : "" })}`;
  const unitById = new Map(ctx.allUnits.map((unit) => [unit.id, unit]));
  // The way back up: the organisation (organisation-wide staff only), then each unit down to the current one.
  const trail = [
    ...(team.unitId ? [] : [{ key: "org", label: org.name, href: at(null) }]),
    ...(scope.unitPath ?? "").split("/").flatMap((id) => {
      const unit = unitById.get(id);
      return unit && inSubtree(unit.path, team.unitPath) ? [{ key: unit.id, label: unit.name, href: at(unit.id) }] : [];
    }),
  ];
  const depth = scope.unitPath ? scope.unitPath.split("/").length : 0;
  const filters = drillFilters(ctx);
  return {
    shell: reportShell(ctx, "units"),
    hasUnits: ctx.allUnits.length > 0,
    levelName: org.unitLevels[depth] ?? "Unit",
    trail,
    finance,
    currency: org.currency,
    rows: league.map((row) => ({
      ...row,
      key: row.unitId ?? "direct",
      href: row.unitId ? (row.hasChildren ? at(row.unitId) : drillHref(org.slug, "active", { ...filters, unit: row.unitId })) : undefined,
    })),
  };
}

export type OrgReportsUnits = Awaited<ReturnType<typeof loadOrgReportsUnits>>;

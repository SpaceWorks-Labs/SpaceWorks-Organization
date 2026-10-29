import "server-only";

import { requireOrgCapability } from "@/lib/permissions";
import type { Capability } from "@/lib/permissionRoles";
import { buildReportContext, filterQuery, type ReportContext, type ReportSearch } from "./context";
import { dayKey, type ReportPeriod } from "./period";
import { FINANCE_TABLES_READY } from "./finance/source";

/** Open a report page: the capability gate (404/redirect handled by requireOrgCapability), then the context. */
export async function openReport(params: Promise<{ orgSlug: string }>, searchParams: Promise<ReportSearch>, capability: Capability) {
  const { orgSlug } = await params;
  const access = await requireOrgCapability(orgSlug, capability);
  return buildReportContext(access, await searchParams);
}

/** Plain data for the report header, tabs and filter bar (no functions, so it crosses the split-hosting wire). */
export function reportShell(ctx: ReportContext, tab: string) {
  const unitLevel = (level: number) => ctx.org.unitLevels[level] ?? "Unit";
  return {
    org: { name: ctx.org.name, slug: ctx.org.slug, logoUrl: ctx.org.logoUrl },
    tab,
    period: periodInfo(ctx.period),
    filters: ctx.filters,
    query: filterQuery(ctx.filters),
    plans: ctx.plans.map((plan) => ({ id: plan.id, name: plan.archivedAt ? `${plan.name} (archived)` : plan.name })),
    units: ctx.units.map((unit) => ({ id: unit.id, name: unit.name, level: unit.level, levelName: unitLevel(unit.level) })),
    scopedUnitName: ctx.team.unitId ? (ctx.allUnits.find((unit) => unit.id === ctx.team.unitId)?.name ?? null) : null,
    tabs: {
      finance: ctx.can("reports.finance"),
      activity: ctx.can("audit.view"),
      units: ctx.allUnits.length > 0,
      financeReady: FINANCE_TABLES_READY,
    },
    canExport: ctx.can("reports.membership"),
    canExportFinance: ctx.can("reports.finance"),
    showContact: ctx.showContact,
  };
}

export type ReportShell = ReturnType<typeof reportShell>;

function periodInfo(period: ReportPeriod) {
  return { label: period.label, preset: period.preset, firstDay: dayKey(period.firstDay), lastDay: dayKey(period.lastDay) };
}

/** Drill-down filters for this context, for lib/reports/drillLinks.ts drillHref. */
export function drillFilters(ctx: ReportContext) {
  return { period: ctx.filters.period, from: ctx.filters.from, to: ctx.filters.to, plan: ctx.filters.plan, unit: ctx.scope.unitId && ctx.scope.unitId !== ctx.team.unitId ? ctx.scope.unitId : undefined };
}

import "server-only";

import { prisma } from "@/lib/db";
import { can, type Capability } from "@/lib/permissionRoles";
import type { StaffMembership } from "@/lib/permissions";
import { teamScope } from "@/lib/membership/scope";
import { inSubtree } from "./dataset";
import { resolvePeriod, type ReportPeriod } from "./period";
import { reportScope, type ReportScope } from "./source";

/** Query parameters every report understands. Unknown values fall back to defaults; nothing widens scope. */
export type ReportSearch = { period?: string; from?: string; to?: string; plan?: string; unit?: string; days?: string; page?: string };

type ReportAccess = { organisation: { id: string; slug: string }; membership: StaffMembership; userId: string };

export type ReportContext = Awaited<ReturnType<typeof buildReportContext>>;

/**
 * Everything a report page or export needs once access is proved: the organisation's calendar and money
 * settings, the viewer's scope narrowed by the filters, the period, and the options for the filter bar.
 */
export async function buildReportContext(access: ReportAccess, search: ReportSearch, now = new Date()) {
  const found = await prisma.organisation.findUniqueOrThrow({
    where: { id: access.organisation.id },
    select: { id: true, slug: true, name: true, logoUrl: true, timezone: true, financialYearStartMonth: true, currency: true, locale: true, unitLevels: true, stateCode: true, taxSettings: { select: { stateCode: true } } },
  });
  // The supplier state for GST reports is the registration's state, as on the invoices themselves.
  const { taxSettings, ...rest } = found;
  const org = { ...rest, stateCode: taxSettings?.stateCode ?? rest.stateCode };
  const team = await teamScope(org.id, access.membership.unitId);
  const scope: ReportScope = await reportScope(team, { unit: search.unit, plan: search.plan });
  const period: ReportPeriod = resolvePeriod(search, org, now);
  const [plans, units, roles] = await Promise.all([
    prisma.membershipPlan.findMany({ where: { organisationId: org.id }, orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }], select: { id: true, name: true, currency: true, priceRenewalMinor: true, archivedAt: true } }),
    prisma.orgUnit.findMany({ where: { organisationId: org.id, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, path: true, level: true, parentId: true } }),
    prisma.memberRole.findMany({ where: { organisationId: org.id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
  ]);
  const actor = access.membership;
  return {
    org,
    now,
    period,
    scope,
    team,
    plans,
    /** Units the viewer may filter by: their own subtree only. */
    units: units.filter((unit) => inSubtree(unit.path, team.unitPath)),
    allUnits: units,
    roles,
    filters: {
      period: period.preset,
      from: period.preset === "custom" ? search.from ?? "" : "",
      to: period.preset === "custom" ? search.to ?? "" : "",
      plan: scope.planId ?? "",
      unit: scope.unitId && scope.unitId !== team.unitId ? scope.unitId : "",
    },
    userId: access.userId,
    can: (capability: Capability) => can(actor, capability),
    showContact: can(actor, "members.contact"),
  };
}

/** The filters as query parameters, for links between tabs and to exports. */
export function filterQuery(filters: ReportContext["filters"], extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra })) if (value && !(key === "period" && value === "fy")) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** The units a breakdown groups members by: every unit, archived ones too while their subtree still holds one of them. */
export async function reportingUnits(ctx: Pick<ReportContext, "org">, members: ReadonlyArray<{ unitPath: string | null }>) {
  const units = await prisma.orgUnit.findMany({ where: { organisationId: ctx.org.id }, orderBy: { path: "asc" }, select: { id: true, name: true, path: true, level: true, parentId: true, archivedAt: true } });
  return units.filter((unit) => !unit.archivedAt || members.some((member) => inSubtree(member.unitPath, unit.path)));
}

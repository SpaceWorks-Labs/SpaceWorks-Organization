import "server-only";

import { prisma } from "@/lib/db";
import { flattenValues, indentedLabel } from "@/lib/groupings/keys";
import { scopedMemberWhere, type ReportScope } from "./source";

export type GroupingBreakdown = {
  groupings: Array<{ id: string; name: string }>;
  grouping: { id: string; name: string } | null;
  /** One row per value in tree order: members holding it, and those with a running membership (active or in grace). */
  rows: Array<{ valueId: string; label: string; archived: boolean; members: number; active: number }>;
  /** Members in scope holding no value of this grouping. */
  unassigned: number;
};

/**
 * A breakdown of the members in a report scope by the values of one grouping (aggregates only: counts, never names).
 * The scope's unit and grouping limits apply, so a limited viewer counts only the people they may see.
 */
export async function groupingBreakdown(scope: ReportScope, groupingId: string | null): Promise<GroupingBreakdown> {
  const groupings = await prisma.orgGrouping.findMany({ where: { organisationId: scope.organisationId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  const grouping = groupings.find((entry) => entry.id === groupingId) ?? groupings[0] ?? null;
  if (!grouping) return { groupings, grouping: null, rows: [], unassigned: 0 };
  const members = { AND: [scopedMemberWhere(scope), { anonymisedAt: null }] };
  const running = { AND: [...members.AND, { terms: { some: { organisationId: scope.organisationId, status: { in: ["ACTIVE", "GRACE"] as Array<"ACTIVE" | "GRACE"> } } } }] };
  const [values, totals, actives, unassigned] = await Promise.all([
    prisma.orgGroupingValue.findMany({ where: { organisationId: scope.organisationId, groupingId: grouping.id }, select: { id: true, parentId: true, label: true, code: true, sortOrder: true, archivedAt: true } }),
    prisma.memberGroupingValue.groupBy({ by: ["valueId"], where: { organisationId: scope.organisationId, groupingId: grouping.id, member: { is: members } }, _count: { _all: true } }),
    prisma.memberGroupingValue.groupBy({ by: ["valueId"], where: { organisationId: scope.organisationId, groupingId: grouping.id, member: { is: running } }, _count: { _all: true } }),
    prisma.member.count({ where: { AND: [...members.AND, { groupingValues: { none: { groupingId: grouping.id } } }] } }),
  ]);
  const total = new Map(totals.map((row) => [row.valueId, row._count._all]));
  const active = new Map(actives.map((row) => [row.valueId, row._count._all]));
  const rows = flattenValues(values)
    .map((value) => ({ valueId: value.id, label: indentedLabel(value.label, value.level), archived: value.archivedAt !== null, members: total.get(value.id) ?? 0, active: active.get(value.id) ?? 0 }))
    // An archived value with nobody in it is noise; one that still holds members stays in the count.
    .filter((row) => !row.archived || row.members > 0);
  return { groupings, grouping, rows, unassigned };
}

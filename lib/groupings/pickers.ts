import "server-only";

import { prisma } from "@/lib/db";
import { valueInScope, type TeamScope } from "@/lib/membership/scope";
import { flattenValues, indentedLabel } from "./keys";

export type PickerGrouping = {
  id: string;
  key: string;
  name: string;
  multiple: boolean;
  /** The viewer is limited to some values of this grouping, so only those are offered (and one is needed). */
  limited: boolean;
  values: Array<{ id: string; label: string }>;
};

/**
 * Live groupings with their live values in tree order, for the pickers staff use. A viewer limited by a grouping is
 * offered only the values inside their reach for it, so a picker can never offer what the server would refuse.
 */
export async function loadPickerGroupings(scope: TeamScope): Promise<PickerGrouping[]> {
  const groupings = await prisma.orgGrouping.findMany({
    where: { organisationId: scope.organisationId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, key: true, name: true, multiple: true, values: { where: { archivedAt: null }, select: { id: true, parentId: true, label: true, code: true, sortOrder: true, path: true } } },
  });
  return groupings.map((grouping) => ({
    id: grouping.id,
    key: grouping.key,
    name: grouping.name,
    multiple: grouping.multiple,
    limited: scope.limits.some((limit) => limit.groupingId === grouping.id),
    values: flattenValues(grouping.values)
      .filter((value) => valueInScope(scope, grouping.id, value.path))
      .map((value) => ({ id: value.id, label: indentedLabel(value.label, value.level) })),
  }));
}

/** The values a member holds, by grouping, for a picker's starting state. */
export async function memberPickerValues(organisationId: string, memberId: string): Promise<Record<string, string[]>> {
  const rows = await prisma.memberGroupingValue.findMany({ where: { organisationId, memberId }, select: { groupingId: true, valueId: true } });
  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.groupingId] ??= []).push(row.valueId);
  return out;
}

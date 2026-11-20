import "server-only";

import { prisma } from "@/lib/db";
import { flattenValues, indentedLabel } from "./keys";

export type GroupingChoices = { groupingMultiple: boolean; groupingValues: Array<{ id: string; label: string }> };

/**
 * The choices behind a plan's grouping questions, for the join form: live values of live groupings of this
 * organisation, in tree order with their depth drawn into the label. A question whose grouping is gone is dropped.
 */
export async function groupingChoices(organisationId: string, groupingIds: readonly string[]): Promise<Map<string, GroupingChoices>> {
  const ids = [...new Set(groupingIds)];
  const out = new Map<string, GroupingChoices>();
  if (!ids.length) return out;
  const groupings = await prisma.orgGrouping.findMany({
    where: { organisationId, id: { in: ids }, archivedAt: null },
    select: { id: true, multiple: true, values: { where: { archivedAt: null }, select: { id: true, parentId: true, label: true, code: true, sortOrder: true } } },
  });
  for (const grouping of groupings) {
    out.set(grouping.id, { groupingMultiple: grouping.multiple, groupingValues: flattenValues(grouping.values).map((value) => ({ id: value.id, label: indentedLabel(value.label, value.level) })) });
  }
  return out;
}

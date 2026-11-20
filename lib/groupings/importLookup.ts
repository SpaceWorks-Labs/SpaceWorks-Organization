import "server-only";

import { prisma } from "@/lib/db";
import type { GroupingLookup } from "./importValues";

/** The organisation's live groupings by key, each with its live values, for matching imported cells. */
export async function loadGroupingLookup(organisationId: string): Promise<GroupingLookup> {
  const groupings = await prisma.orgGrouping.findMany({
    where: { organisationId, archivedAt: null },
    select: { id: true, key: true, name: true, multiple: true, values: { where: { archivedAt: null }, select: { id: true, label: true, code: true } } },
  });
  return new Map(groupings.map((grouping) => [grouping.key, { id: grouping.id, name: grouping.name, multiple: grouping.multiple, values: grouping.values }]));
}

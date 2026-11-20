import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MEMBER_FILTERS, type MemberFilter } from "@/lib/membership/describe";
import { memberFilterWhere } from "@/lib/cards/exportFilter";
import { smartGroupWhere } from "@/lib/groups/conditions";

/** Members holding a grouping value or any value under it (a tree value covers its subtree). Unknown values match nobody. */
export async function groupingValueWhere(organisationId: string, valueId: string): Promise<Prisma.MemberWhereInput> {
  const value = await prisma.orgGroupingValue.findFirst({ where: { id: valueId, organisationId }, select: { groupingId: true, path: true } });
  if (!value) return { id: { in: [] } };
  return { groupingValues: { some: { organisationId, groupingId: value.groupingId, value: { is: { OR: [{ path: value.path }, { path: { startsWith: `${value.path}/` } }] } } } } };
}

/** The member-list filters a request names by grouping value (`gv`) and smart group (`sg`), as extra conditions. */
export async function groupFilters(organisationId: string, input: { valueId?: string | null; smartGroupId?: string | null }): Promise<Prisma.MemberWhereInput[]> {
  const out: Prisma.MemberWhereInput[] = [];
  if (input.valueId) out.push(await groupingValueWhere(organisationId, input.valueId));
  if (input.smartGroupId) out.push(await smartGroupWhere(organisationId, input.smartGroupId));
  return out;
}

/** The directory's status counts through Prisma, for views the raw count query can't follow (smart group and grouping filters). */
export async function countFiltersWithPrisma(base: Prisma.MemberWhereInput, now: Date): Promise<Record<MemberFilter, number>> {
  const counts = await Promise.all(MEMBER_FILTERS.map((key) => prisma.member.count({ where: { AND: [base, memberFilterWhere(key, now)] } })));
  return Object.fromEntries(MEMBER_FILTERS.map((key, index) => [key, counts[index]])) as Record<MemberFilter, number>;
}

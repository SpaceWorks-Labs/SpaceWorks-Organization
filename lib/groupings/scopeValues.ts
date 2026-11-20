import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof prisma;

export type ScopeValue = { groupingId: string; valueId: string; path: string };

/**
 * The live values of this organisation's live groupings that a staff limit may name. Null when any id is unknown,
 * archived, or from another organisation, so a limit never lands on something that isn't there.
 */
export async function loadScopeValues(client: Client, organisationId: string, valueIds: readonly string[]): Promise<ScopeValue[] | null> {
  const ids = [...new Set(valueIds)];
  if (!ids.length) return [];
  const values = await client.orgGroupingValue.findMany({
    where: { organisationId, id: { in: ids }, archivedAt: null, grouping: { is: { archivedAt: null } } },
    select: { id: true, groupingId: true, path: true },
  });
  if (values.length !== ids.length) return null;
  return values.map((value) => ({ groupingId: value.groupingId, valueId: value.id, path: value.path }));
}

/** A team member's or invite's limit rows as the granting rules want them: grouping and value path. */
export const asLimits = (values: readonly ScopeValue[]) => values.map((value) => ({ groupingId: value.groupingId, path: value.path }));

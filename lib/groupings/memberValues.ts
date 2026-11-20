import "server-only";

import type { Prisma } from "@prisma/client";
import { heldValuesInScope, type TeamScope } from "@/lib/membership/scope";
import { GroupingError } from "./service";

type Tx = Prisma.TransactionClient;

export type HeldValue = { groupingId: string; valueId: string; path: string };

/**
 * Replace the values one member holds in one grouping (the caller holds the member's row lock). Every value must
 * belong to this grouping of this organisation; a value is refused for a new answer once archived, but a member
 * keeps (and may re-save) one they already hold. A grouping that takes one value takes at most one.
 */
export async function replaceMemberValues(tx: Tx, organisationId: string, memberId: string, groupingId: string, valueIds: readonly string[]): Promise<{ changed: boolean }> {
  const ids = [...new Set(valueIds)];
  const grouping = await tx.orgGrouping.findFirst({ where: { id: groupingId, organisationId } });
  if (!grouping) throw new GroupingError("Grouping not found.");
  if (!grouping.multiple && ids.length > 1) throw new GroupingError(`${grouping.name} takes one value.`);
  const held = await tx.memberGroupingValue.findMany({ where: { organisationId, memberId, groupingId }, select: { valueId: true } });
  const heldIds = new Set(held.map((row) => row.valueId));
  const found = ids.length ? await tx.orgGroupingValue.findMany({ where: { organisationId, groupingId, id: { in: ids } }, select: { id: true, archivedAt: true } }) : [];
  if (found.length !== ids.length) throw new GroupingError(`Choose from the values of ${grouping.name}.`);
  const added = found.filter((value) => !heldIds.has(value.id));
  if (added.some((value) => value.archivedAt) || (added.length && grouping.archivedAt)) throw new GroupingError(`${grouping.name} no longer offers that value.`);
  const removed = held.filter((row) => !ids.includes(row.valueId));
  if (removed.length) await tx.memberGroupingValue.deleteMany({ where: { organisationId, memberId, groupingId, valueId: { in: removed.map((row) => row.valueId) } } });
  if (added.length) await tx.memberGroupingValue.createMany({ data: added.map((value) => ({ organisationId, memberId, groupingId, valueId: value.id })), skipDuplicates: true });
  return { changed: removed.length > 0 || added.length > 0 };
}

/** The values a member holds, each with its value path, for the scope check after a change. */
export async function heldValues(tx: Tx, organisationId: string, memberId: string): Promise<HeldValue[]> {
  const rows = await tx.memberGroupingValue.findMany({ where: { organisationId, memberId }, select: { groupingId: true, valueId: true, value: { select: { path: true } } } });
  return rows.map((row) => ({ groupingId: row.groupingId, valueId: row.valueId, path: row.value.path }));
}

/**
 * Give a new member grouping values (grouped by grouping, replacing what they hold there), then check the member is
 * inside the adding manager's reach: someone limited by a grouping can't add a member they could not then see.
 */
export async function giveGroupingValues(tx: Tx, organisationId: string, scope: TeamScope, memberId: string, valueIds: readonly string[]) {
  if (valueIds.length) {
    const values = await tx.orgGroupingValue.findMany({ where: { organisationId, id: { in: [...valueIds] } }, select: { id: true, groupingId: true } });
    if (values.length !== new Set(valueIds).size) throw new GroupingError("One of those grouping values no longer exists.");
    for (const groupingId of new Set(values.map((value) => value.groupingId))) {
      await replaceMemberValues(tx, organisationId, memberId, groupingId, values.filter((value) => value.groupingId === groupingId).map((value) => value.id));
    }
  }
  if (!heldValuesInScope(scope, await heldValues(tx, organisationId, memberId))) throw new GroupingError("Choose a value inside your reach for each grouping you are limited to.");
}

import "server-only";

import type { Prisma } from "@prisma/client";
import { firstFreeKey, firstFreeValueCode, groupingKeyBase, MAX_GROUPINGS, MAX_GROUPING_VALUES, MAX_VALUE_LEVEL, valueCodeBase, type GroupingKind } from "./keys";

type Tx = Prisma.TransactionClient;

/** Thrown inside a groupings transaction to roll it back with a message for the person. */
export class GroupingError extends Error {}

/** Serialise grouping edits in one organisation: value paths come from their parents', so moves never overlap. */
export async function lockGroupings(tx: Tx, organisationId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Organisation" WHERE "id" = ${organisationId} FOR NO KEY UPDATE`;
}

async function liveGrouping(tx: Tx, organisationId: string, groupingId: string) {
  const grouping = await tx.orgGrouping.findFirst({ where: { id: groupingId, organisationId } });
  if (!grouping) throw new GroupingError("Grouping not found.");
  return grouping;
}

export async function createGrouping(tx: Tx, organisationId: string, input: { name: string; kind: GroupingKind; multiple: boolean }) {
  if ((await tx.orgGrouping.count({ where: { organisationId } })) >= MAX_GROUPINGS) throw new GroupingError("This organisation has reached the grouping limit.");
  const taken = await tx.orgGrouping.findMany({ where: { organisationId }, select: { key: true, sortOrder: true }, orderBy: { sortOrder: "desc" } });
  const key = firstFreeKey(groupingKeyBase(input.name), new Set(taken.map((row) => row.key)));
  return tx.orgGrouping.create({ data: { organisationId, key, name: input.name, kind: input.kind, multiple: input.multiple, sortOrder: (taken[0]?.sortOrder ?? -1) + 1 } });
}

/** Rename a grouping, or change whether members may hold several of its values (never down while someone does). */
export async function updateGrouping(tx: Tx, organisationId: string, groupingId: string, input: { name: string; multiple: boolean }) {
  const grouping = await liveGrouping(tx, organisationId, groupingId);
  if (grouping.multiple && !input.multiple) {
    const several = await tx.$queryRaw<Array<{ n: number }>>`
      SELECT 1 AS n FROM "MemberGroupingValue" WHERE "organisationId" = ${organisationId} AND "groupingId" = ${groupingId}
      GROUP BY "memberId" HAVING count(*) > 1 LIMIT 1`;
    if (several.length) throw new GroupingError("Some members hold several values, so this grouping can't go back to one value each.");
  }
  await tx.orgGrouping.update({ where: { id: groupingId }, data: { name: input.name, multiple: input.multiple } });
}

export async function setGroupingArchived(tx: Tx, organisationId: string, groupingId: string, archived: boolean) {
  await liveGrouping(tx, organisationId, groupingId);
  await tx.orgGrouping.update({ where: { id: groupingId }, data: { archivedAt: archived ? new Date() : null } });
}

async function takenCodes(tx: Tx, groupingId: string, except?: string) {
  const rows = await tx.orgGroupingValue.findMany({ where: { groupingId, ...(except ? { id: { not: except } } : {}) }, select: { code: true } });
  return new Set(rows.map((row) => row.code));
}

/** Add a value to a list, or under a parent (or at the top) of a tree. */
export async function createValue(tx: Tx, organisationId: string, groupingId: string, input: { label: string; parentId: string | null; code?: string }) {
  const grouping = await liveGrouping(tx, organisationId, groupingId);
  if (grouping.archivedAt) throw new GroupingError("Restore the grouping before adding values.");
  if ((await tx.orgGroupingValue.count({ where: { groupingId } })) >= MAX_GROUPING_VALUES) throw new GroupingError("This grouping has reached the value limit.");
  const parent = input.parentId ? await tx.orgGroupingValue.findFirst({ where: { id: input.parentId, organisationId, groupingId, archivedAt: null }, select: { id: true, level: true, path: true } }) : null;
  if (input.parentId && !parent) throw new GroupingError("The value above it no longer exists.");
  if (parent && grouping.kind !== "tree") throw new GroupingError("Only a tree grouping has values under values.");
  const level = parent ? parent.level + 1 : 0;
  if (level > MAX_VALUE_LEVEL) throw new GroupingError("Values can go at most six levels deep.");
  const codes = await takenCodes(tx, groupingId);
  if (input.code && codes.has(input.code)) throw new GroupingError("Another value already uses that code.");
  const code = input.code ?? firstFreeValueCode(valueCodeBase(input.label), codes);
  const last = await tx.orgGroupingValue.aggregate({ where: { groupingId, parentId: parent?.id ?? null }, _max: { sortOrder: true } });
  const created = await tx.orgGroupingValue.create({
    data: { organisationId, groupingId, parentId: parent?.id ?? null, label: input.label, code, level, sortOrder: (last._max.sortOrder ?? -1) + 1, path: "pending" },
  });
  await tx.orgGroupingValue.update({ where: { id: created.id }, data: { path: parent ? `${parent.path}/${created.id}` : created.id } });
  return created;
}

async function loadValue(tx: Tx, organisationId: string, valueId: string) {
  const value = await tx.orgGroupingValue.findFirst({ where: { id: valueId, organisationId } });
  if (!value) throw new GroupingError("Value not found.");
  return value;
}

export async function renameValue(tx: Tx, organisationId: string, valueId: string, input: { label: string; code?: string }) {
  const value = await loadValue(tx, organisationId, valueId);
  if (input.code && input.code !== value.code && (await takenCodes(tx, value.groupingId, value.id)).has(input.code)) throw new GroupingError("Another value already uses that code.");
  await tx.orgGroupingValue.update({ where: { id: value.id }, data: { label: input.label, ...(input.code ? { code: input.code } : {}) } });
}

/** Archive a value and everything under it, or restore it (its parent must not be archived). Members keep theirs. */
export async function setValueArchived(tx: Tx, organisationId: string, valueId: string, archived: boolean) {
  const value = await loadValue(tx, organisationId, valueId);
  const subtree = { organisationId, groupingId: value.groupingId, OR: [{ path: value.path }, { path: { startsWith: `${value.path}/` } }] };
  if (!archived && value.parentId) {
    const parent = await tx.orgGroupingValue.findFirst({ where: { id: value.parentId, organisationId }, select: { archivedAt: true } });
    if (parent?.archivedAt) throw new GroupingError("Restore the value above it first.");
  }
  await tx.orgGroupingValue.updateMany({ where: subtree, data: { archivedAt: archived ? new Date() : null } });
}

/** Move a value, with everything under it, to another parent (or the top) of the same tree. Only paths and depths change. */
export async function moveValue(tx: Tx, organisationId: string, valueId: string, parentId: string | null) {
  const value = await loadValue(tx, organisationId, valueId);
  const grouping = await liveGrouping(tx, organisationId, value.groupingId);
  if (grouping.kind !== "tree") throw new GroupingError("Only a tree grouping has values under values.");
  if (value.archivedAt) throw new GroupingError("Restore the value before moving it.");
  if (value.parentId === parentId) return;
  const parent = parentId ? await tx.orgGroupingValue.findFirst({ where: { id: parentId, organisationId, groupingId: value.groupingId, archivedAt: null }, select: { id: true, level: true, path: true } }) : null;
  if (parentId && !parent) throw new GroupingError("Choose a value that isn't archived.");
  if (parent && (parent.path === value.path || parent.path.startsWith(`${value.path}/`))) throw new GroupingError("A value can't move under itself.");
  const level = parent ? parent.level + 1 : 0;
  const delta = level - value.level;
  const deepest = await tx.orgGroupingValue.aggregate({ where: { organisationId, groupingId: value.groupingId, OR: [{ path: value.path }, { path: { startsWith: `${value.path}/` } }] }, _max: { level: true } });
  if ((deepest._max.level ?? value.level) + delta > MAX_VALUE_LEVEL) throw new GroupingError("That would put values more than six levels deep.");
  const from = value.path;
  const to = parent ? `${parent.path}/${value.id}` : value.id;
  const last = await tx.orgGroupingValue.aggregate({ where: { groupingId: value.groupingId, parentId }, _max: { sortOrder: true } });
  await tx.orgGroupingValue.update({ where: { id: value.id }, data: { parentId, path: to, level, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
  await tx.$executeRaw`
    UPDATE "OrgGroupingValue" SET "path" = ${to} || substr("path", ${from.length + 1}::int), "level" = "level" + ${delta}::int
    WHERE "organisationId" = ${organisationId} AND "groupingId" = ${value.groupingId} AND starts_with("path", ${`${from}/`})`;
}

/** Swap a value with its neighbour among the siblings under the same parent. */
export async function reorderValue(tx: Tx, organisationId: string, valueId: string, direction: "up" | "down") {
  const value = await loadValue(tx, organisationId, valueId);
  const siblings = await tx.orgGroupingValue.findMany({ where: { organisationId, groupingId: value.groupingId, parentId: value.parentId }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { id: true } });
  const index = siblings.findIndex((row) => row.id === value.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  const order = siblings.map((row) => row.id);
  [order[index], order[target]] = [order[target], order[index]];
  for (const [position, id] of order.entries()) await tx.orgGroupingValue.update({ where: { id }, data: { sortOrder: position } });
}

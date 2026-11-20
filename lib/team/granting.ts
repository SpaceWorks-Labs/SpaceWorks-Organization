import "server-only";

import type { OrgRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveLimits, unitInScope, valueInScope, type ScopeSubject, type TeamScope } from "@/lib/membership/scope";
import { canGrant, type RoleGrant, type StaffActor } from "@/lib/permissionRoles";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * A grant as the granting rules see it: the role, the unit it is held for (null: the whole organisation) and the
 * grouping values it is limited to (the path of each value; none: no grouping limit).
 */
type GrantTarget = { role: RoleGrant; unitId: string | null; unitPath: string | null; limits?: ReadonlyArray<{ groupingId: string; path: string }> };

/**
 * Whether an actor may give this grant, or change or remove someone holding it: the role must grant strictly less
 * than the actor holds (`canGrant`), and the unit and every grouping value must sit inside the actor's own reach.
 * Someone limited to a unit, or to a grouping, never grants wider reach: a giver limited to one profession can
 * only grant that profession or part of it.
 */
export function mayGrant(actor: StaffActor, scope: TeamScope, target: GrantTarget): boolean {
  if (actor.unitId && !target.unitId) return false;
  if (!unitInScope(scope, target.unitPath)) return false;
  const limits = target.limits ?? [];
  for (const limit of scope.limits) {
    const held = limits.filter((entry) => entry.groupingId === limit.groupingId);
    if (!held.length || !held.every((entry) => valueInScope(scope, entry.groupingId, entry.path))) return false;
  }
  return canGrant(actor, target.role, Boolean(target.unitId) || limits.length > 0);
}

/** An actor's reach, read through any client (so a transaction sees its own locks). A missing unit reaches nothing. */
export async function reachOf(client: Client, organisationId: string, who: ScopeSubject): Promise<TeamScope> {
  const unit = who.unitId ? await client.orgUnit.findFirst({ where: { organisationId, id: who.unitId }, select: { path: true } }) : null;
  const rows = who.scopes ?? (who.id.startsWith("platform:") ? [] : await client.teamMemberScope.findMany({ where: { organisationId, teamMemberId: who.id }, select: { groupingId: true, valueId: true } }));
  return { organisationId, unitId: who.unitId, unitPath: who.unitId ? unit?.path ?? "__missing__" : null, limits: await resolveLimits(organisationId, rows) };
}

/** The grouping limits a team member or invite holds, with each value's path, for `mayGrant`. */
export async function limitPaths(client: Client, organisationId: string, rows: ReadonlyArray<{ groupingId: string; valueId: string }>) {
  if (!rows.length) return [];
  const values = await client.orgGroupingValue.findMany({ where: { organisationId, id: { in: rows.map((row) => row.valueId) } }, select: { id: true, groupingId: true, path: true } });
  const byId = new Map(values.map((value) => [value.id, value]));
  return rows.map((row) => ({ groupingId: row.groupingId, path: byId.get(row.valueId)?.path ?? "__missing__" }));
}

/** A live (not archived) unit of this organisation, or null. */
export async function liveUnit(client: Client, organisationId: string, unitId: string) {
  return client.orgUnit.findFirst({ where: { organisationId, id: unitId, archivedAt: null }, select: { id: true, path: true } });
}

/**
 * Lock a staff role's row for reading and return it if it can still be given: this organisation's, not archived and
 * not the Owner role. Archiving or editing a role locks the same row, so a grant never lands on a role that changed
 * underneath it.
 */
export async function lockGrantableRole(tx: Prisma.TransactionClient, organisationId: string, roleId: string): Promise<OrgRole | null> {
  await tx.$queryRaw`SELECT 1 FROM "OrgRole" WHERE "id" = ${roleId} AND "organisationId" = ${organisationId} FOR SHARE`;
  return tx.orgRole.findFirst({ where: { id: roleId, organisationId, archivedAt: null, isOwner: false } });
}

/** Serialise team changes in one organisation (owners, the team size limit) without blocking inserts that reference it. */
export async function lockOrganisationTeam(tx: Prisma.TransactionClient, organisationId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Organisation" WHERE "id" = ${organisationId} FOR NO KEY UPDATE`;
}

import "server-only";

import type { OrgRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unitInScope, type TeamScope } from "@/lib/membership/scope";
import { canGrant, type RoleGrant, type StaffActor } from "@/lib/permissionRoles";

type Client = Prisma.TransactionClient | typeof prisma;

/** A grant as the granting rules see it: the role, and the unit it is held for (null: the whole organisation). */
type GrantTarget = { role: RoleGrant; unitId: string | null; unitPath: string | null };

/**
 * Whether an actor may give this grant, or change or remove someone holding it: the role must grant strictly less
 * than the actor holds (`canGrant`), and the unit must sit inside the actor's own subtree. Someone holding their role
 * for one unit never grants org-wide reach.
 */
export function mayGrant(actor: StaffActor, scope: TeamScope, target: GrantTarget): boolean {
  if (actor.unitId && !target.unitId) return false;
  if (!unitInScope(scope, target.unitPath)) return false;
  return canGrant(actor, target.role, Boolean(target.unitId));
}

/** An actor's reach, read through any client (so a transaction sees its own locks). A missing unit reaches nothing. */
export async function reachOf(client: Client, organisationId: string, unitId: string | null): Promise<TeamScope> {
  if (!unitId) return { organisationId, unitId: null, unitPath: null };
  const unit = await client.orgUnit.findFirst({ where: { organisationId, id: unitId }, select: { path: true } });
  return { organisationId, unitId, unitPath: unit?.path ?? "__missing__" };
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

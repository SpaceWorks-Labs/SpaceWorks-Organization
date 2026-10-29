import "server-only";

import type { OrgRole, Prisma, TeamRole } from "@prisma/client";
import { fallbackTeamRole, roleCapabilities, STARTER_ROLES, type Capability, type RoleGrant } from "@/lib/permissionRoles";

type Tx = Prisma.TransactionClient;

/** A new organisation's starter roles (Owner, Manager, Treasurer, Viewer), by the fixed role each replaces. */
export async function createStarterRoles(tx: Tx, organisationId: string): Promise<Record<TeamRole, OrgRole>> {
  const roles = {} as Record<TeamRole, OrgRole>;
  for (const [index, starter] of STARTER_ROLES.entries()) {
    roles[starter.key] = await tx.orgRole.create({
      data: { organisationId, name: starter.name, description: starter.description, capabilities: [...starter.capabilities], isOwner: starter.isOwner, starterKey: starter.key, sortOrder: index },
    });
  }
  return roles;
}

/** The organisation's Owner role. Every organisation has exactly one. */
export async function ownerRole(tx: Tx, organisationId: string): Promise<OrgRole> {
  return tx.orgRole.findFirstOrThrow({ where: { organisationId, isOwner: true } });
}

/** The columns to write when giving someone a role: the role, and the fixed role kept beside it for rollbacks. */
export function roleColumns(role: Pick<OrgRole, "id"> & RoleGrant): { roleId: string; role: TeamRole } {
  return { roleId: role.id, role: fallbackTeamRole(role) };
}

/**
 * Staff who hold a permission, for choosing who to notify. `orgWide` keeps only people holding their role for the
 * whole organisation. Roles are few per organisation, so they are filtered here rather than in SQL.
 */
export async function staffWithCapability(
  tx: Tx,
  organisationId: string,
  capability: Capability,
  options: { orgWide?: boolean; where?: Prisma.TeamMemberWhereInput } = {},
) {
  const roles = await tx.orgRole.findMany({ where: { organisationId }, select: { id: true, isOwner: true, capabilities: true } });
  const roleIds = roles.filter((role) => roleCapabilities(role).has(capability)).map((role) => role.id);
  if (!roleIds.length) return [];
  return tx.teamMember.findMany({
    where: { ...options.where, organisationId, roleId: { in: roleIds }, ...(options.orgWide ? { unitId: null } : {}) },
    select: { id: true, userId: true, unitId: true, user: { select: { email: true, name: true } } },
  });
}

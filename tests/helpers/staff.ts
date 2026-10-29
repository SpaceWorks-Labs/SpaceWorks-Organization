import type { TeamRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STARTER_ROLES } from "@/lib/permissionRoles";

/** An organisation's starter role for a fixed role, creating the starter roles on first use (tests make bare organisations). */
export async function starterRole(organisationId: string, key: TeamRole) {
  const name = STARTER_ROLES.find((starter) => starter.key === key)!.name;
  const existing = await prisma.orgRole.findUnique({ where: { organisationId_name: { organisationId, name } } });
  if (existing) return existing;
  if (!(await prisma.orgRole.count({ where: { organisationId } }))) {
    await prisma.orgRole.createMany({
      data: STARTER_ROLES.map((starter, index) => ({ organisationId, name: starter.name, description: starter.description, capabilities: [...starter.capabilities], isOwner: starter.isOwner, starterKey: starter.key, sortOrder: index })),
      skipDuplicates: true,
    });
  }
  return prisma.orgRole.findUniqueOrThrow({ where: { organisationId_name: { organisationId, name } } });
}

/** Put someone on an organisation's team with a starter role, for the whole organisation or one unit. */
export async function addStaff(organisationId: string, userId: string, key: TeamRole, unitId: string | null = null) {
  const role = await starterRole(organisationId, key);
  return prisma.teamMember.create({ data: { organisationId, userId, role: key, roleId: role.id, unitId } });
}

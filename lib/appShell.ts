import "server-only";

import type { OrganisationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, CAPABILITY_LIST, type Capability } from "@/lib/permissionRoles";

export type ShellOrganisation = {
  slug: string;
  name: string;
  logoUrl: string | null;
  roleName: string;
  /** What this person may open here (read access), for the navigation. */
  capabilities: Capability[];
  status: OrganisationStatus;
};

export type ShellUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

const MAX_SHELL_ORGANISATIONS = 50;

/** Data for the dashboard sidebar: the signed-in person and the organisations they are on the team of. */
export async function getAppShellData(userId: string): Promise<{ user: ShellUser; organisations: ShellOrganisation[] }> {
  const [user, teams] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, image: true, profileImageUrl: true } }),
    prisma.teamMember.findMany({
      where: { userId },
      select: { unitId: true, orgRole: { select: { name: true, isOwner: true, capabilities: true } }, organisation: { select: { slug: true, name: true, logoUrl: true, status: true } } },
      orderBy: { organisation: { name: "asc" } },
      take: MAX_SHELL_ORGANISATIONS,
    }),
  ]);

  return {
    user: { name: user?.name ?? null, email: user?.email ?? null, image: user?.profileImageUrl ?? user?.image ?? null },
    organisations: teams.map(({ unitId, orgRole, organisation }) => ({
      ...organisation,
      roleName: orgRole.name,
      capabilities: CAPABILITY_LIST.filter((capability) => can({ orgRole, unitId }, capability)),
    })),
  };
}

import "server-only";

import type { OrganisationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format/datetime";

export type AccountMembershipRow = {
  id: string;
  organisation: { slug: string; name: string; logoUrl: string | null; status: OrganisationStatus };
  /** The staff role they hold there (`orgRole.name`), and whether it is the Owner role. */
  roleName: string;
  isOwner: boolean;
  joinedLabel: string;
  /** The only owner left; leaving would orphan the organisation. */
  soleOwner: boolean;
};

export type AccountOrganisationsData = {
  teamMembers: AccountMembershipRow[];
};

/** The organisation teams one user is on. Selects are explicit: other people are never read. */
export async function loadAccountOrganisations(userId: string): Promise<AccountOrganisationsData> {
  const teams = await prisma.teamMember.findMany({
    where: { userId },
    orderBy: { organisation: { name: "asc" } },
    select: { id: true, createdAt: true, orgRole: { select: { name: true, isOwner: true } }, organisation: { select: { id: true, slug: true, name: true, logoUrl: true, status: true } } },
  });
  const ownedOrgIds = teams.filter((team) => team.orgRole.isOwner).map((team) => team.organisation.id);
  const ownersByOrg = ownedOrgIds.length
    ? await prisma.teamMember.groupBy({ by: ["organisationId"], where: { organisationId: { in: ownedOrgIds }, orgRole: { isOwner: true } }, _count: { _all: true } })
    : [];
  const owners = new Map(ownersByOrg.map((group) => [group.organisationId, group._count._all]));

  return {
    teamMembers: teams.map(({ id, orgRole, createdAt, organisation: { id: organisationId, ...organisation } }) => ({
      id,
      roleName: orgRole.name,
      isOwner: orgRole.isOwner,
      organisation,
      joinedLabel: formatDate(createdAt, "UTC"),
      soleOwner: orgRole.isOwner && (owners.get(organisationId) ?? 0) <= 1,
    })),
  };
}

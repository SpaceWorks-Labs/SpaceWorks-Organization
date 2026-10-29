import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { roleCapabilities } from "@/lib/permissionRoles";
import { editableCapabilities, mayEditRole, ROLE_TOO_WIDE } from "@/lib/team/capabilities";

/**
 * The organisation's staff roles, in order, with how many people hold each and how many open invite links give it.
 * Each role says whether the viewer may edit it: never the Owner role or the role they hold, and someone other than
 * the owner only roles narrower than their own.
 */
export async function loadOrgStaffRolesView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "roles.manage");
  const canEdit = can(membership, "roles.manage", { write: true });
  const now = new Date();
  const where = { organisationId: organisation.id };
  const [org, roles, holders, invites] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true } }),
    prisma.orgRole.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, description: true, capabilities: true, isOwner: true, archivedAt: true } }),
    prisma.teamMember.groupBy({ by: ["roleId"], where, _count: { _all: true } }),
    prisma.teamInvite.groupBy({ by: ["roleId"], where: { ...where, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, _count: { _all: true } }),
  ]);
  const heldBy = new Map(holders.map((group) => [group.roleId, group._count._all]));
  const invitedBy = new Map(invites.map((group) => [group.roleId, group._count._all]));
  const lockedReason = (role: (typeof roles)[number]) => {
    if (role.isOwner) return "The Owner role holds every permission and can't be changed.";
    if (!canEdit) return "Your role lets you read staff roles but not change them.";
    if (role.id === membership.roleId) return "You hold this role, so only the owner can change it.";
    if (!mayEditRole(membership, role.capabilities)) return ROLE_TOO_WIDE;
    return null;
  };
  return {
    org,
    canEdit,
    /** The permissions this viewer may put in a role. */
    allowed: canEdit ? [...editableCapabilities(membership)] : [],
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      capabilities: role.isOwner ? [...roleCapabilities(role)] : role.capabilities,
      isOwner: role.isOwner,
      archived: Boolean(role.archivedAt),
      holders: heldBy.get(role.id) ?? 0,
      invites: invitedBy.get(role.id) ?? 0,
      lockedReason: lockedReason(role),
    })),
  };
}

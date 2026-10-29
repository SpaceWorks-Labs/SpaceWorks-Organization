import { prisma } from "@/lib/db";
import { memberWhere, teamScope, unitInScope } from "@/lib/membership/scope";
import { can, requireOrgCapability } from "@/lib/permissions";

/**
 * The organisation's units (as a tree, with member counts) and its member roles. Staff limited to a unit see only
 * their part of the tree, and counts of their own members.
 */
export async function loadOrgStructureView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "structure.manage");
  const scope = await teamScope(organisation.id, membership.unitId);
  const [org, allUnits, roles, unitCounts, roleCounts] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, unitLevels: true } }),
    prisma.orgUnit.findMany({ where: { organisationId: organisation.id }, orderBy: [{ path: "asc" }], select: { id: true, name: true, slug: true, code: true, level: true, path: true, parentId: true, archivedAt: true } }),
    prisma.memberRole.findMany({ where: { organisationId: organisation.id }, orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }], select: { id: true, name: true, description: true, color: true, unitId: true, archivedAt: true } }),
    prisma.member.groupBy({ by: ["unitId"], where: { organisationId: organisation.id, unitId: { not: null } }, _count: { _all: true } }),
    prisma.memberRoleAssignment.groupBy({ by: ["roleId"], where: { organisationId: organisation.id, member: { is: memberWhere(scope) } }, _count: { _all: true } }),
  ]);
  const units = allUnits.filter((unit) => unitInScope(scope, unit.path));
  const visible = new Set(units.map((unit) => unit.id));
  const membersByUnit = new Map(unitCounts.map((row) => [row.unitId!, row._count._all]));
  const membersByRole = new Map(roleCounts.map((row) => [row.roleId, row._count._all]));
  // Each unit's members count towards every unit on its path, so a unit knows its whole subtree's total.
  const subtreeMembers = new Map<string, number>();
  for (const unit of units) {
    const count = membersByUnit.get(unit.id) ?? 0;
    if (count) for (const id of unit.path.split("/")) subtreeMembers.set(id, (subtreeMembers.get(id) ?? 0) + count);
  }
  // Depth-first order by name within each parent, so the tree reads naturally.
  const children = new Map<string | null, typeof units>();
  // A scoped viewer's own unit is the root of what they see.
  for (const unit of units) {
    const parentId = unit.parentId && visible.has(unit.parentId) ? unit.parentId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), unit]);
  }
  const ordered: Array<Omit<(typeof units)[number], "path"> & { members: number; subtreeMembers: number }> = [];
  const visit = (parentId: string | null) => {
    for (const unit of [...(children.get(parentId) ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
      ordered.push({ id: unit.id, name: unit.name, slug: unit.slug, code: unit.code, level: unit.level, parentId: unit.parentId, archivedAt: unit.archivedAt, members: membersByUnit.get(unit.id) ?? 0, subtreeMembers: subtreeMembers.get(unit.id) ?? 0 });
      visit(unit.id);
    }
  };
  visit(null);
  return {
    org,
    canEdit: can(membership, "structure.manage", { write: true }),
    units: ordered,
    roles: roles.map((role) => ({ ...role, members: membersByRole.get(role.id) ?? 0 })),
  };
}

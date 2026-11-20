import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { smartGroupWhereInScope } from "@/lib/groups/conditions";
import { smartGroupConditionSchema } from "@/lib/groups/schema";
import { conditionValueIds } from "@/lib/groups/valueIds";
import { flattenValues, indentedLabel } from "@/lib/groupings/keys";
import { teamScope, unitInScope } from "@/lib/membership/scope";

/**
 * The organisation's smart groups with how many members each covers inside the viewer's own reach (a count, computed
 * now), and the choices the condition builder offers: plans, units in reach, groupings and their values, questions.
 */
export async function loadSmartGroupsView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "members.view");
  const scope = await teamScope(organisation.id, membership);
  const [org, groups, plans, units, groupings, fields] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true } }),
    prisma.smartGroup.findMany({ where: { organisationId: organisation.id }, orderBy: { name: "asc" }, select: { id: true, name: true, description: true, condition: true } }),
    prisma.membershipPlan.findMany({ where: { organisationId: organisation.id }, orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }], select: { id: true, name: true } }),
    prisma.orgUnit.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, level: true, path: true } }),
    prisma.orgGrouping.findMany({
      where: { organisationId: organisation.id, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, values: { where: { archivedAt: null }, select: { id: true, parentId: true, label: true, code: true, sortOrder: true } } },
    }),
    prisma.planField.findMany({ where: { organisationId: organisation.id, section: false, type: { not: "GROUPING" } }, distinct: ["key"], orderBy: { key: "asc" }, select: { key: true, label: true, type: true } }),
  ]);
  // Grouping values an organisation has archived match nobody, so a group that still names one is flagged.
  const archived = new Set((await prisma.orgGroupingValue.findMany({ where: { organisationId: organisation.id, archivedAt: { not: null } }, select: { id: true } })).map((value) => value.id));
  const counts = await Promise.all(groups.map(async (group) => prisma.member.count({ where: await smartGroupWhereInScope(scope, group.id) })));
  return {
    org,
    canManage: can(membership, "members.manage", { write: true }),
    groups: groups.map((group, index) => {
      const parsed = smartGroupConditionSchema.safeParse(group.condition);
      return { id: group.id, name: group.name, description: group.description, condition: parsed.success ? parsed.data : null, members: counts[index], usesArchivedValue: parsed.success && conditionValueIds(parsed.data).some((id) => archived.has(id)) };
    }),
    options: {
      plans,
      units: units.filter((unit) => unitInScope(scope, unit.path)).map(({ id, name, level }) => ({ id, name, level })),
      groupings: groupings.map((grouping) => ({ id: grouping.id, name: grouping.name, values: flattenValues(grouping.values).map((value) => ({ id: value.id, label: indentedLabel(value.label, value.level) })) })),
      fields,
    },
  };
}

import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { flattenValues } from "@/lib/groupings/keys";

/**
 * The organisation's groupings with their values (tree order, archived ones too) and how many members hold each.
 * Groupings are organisation-wide, so staff limited to a unit or a grouping can't open this page.
 */
export async function loadOrgGroupingsView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "groupings.manage");
  const [org, groupings, counts] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true } }),
    prisma.orgGrouping.findMany({
      where: { organisationId: organisation.id },
      orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, key: true, name: true, kind: true, multiple: true, archivedAt: true, values: { select: { id: true, parentId: true, label: true, code: true, sortOrder: true, archivedAt: true } } },
    }),
    prisma.memberGroupingValue.groupBy({ by: ["valueId"], where: { organisationId: organisation.id }, _count: { _all: true } }),
  ]);
  const held = new Map(counts.map((row) => [row.valueId, row._count._all]));
  return {
    org,
    canEdit: can(membership, "groupings.manage", { write: true }),
    groupings: groupings.map((grouping) => ({
      id: grouping.id,
      key: grouping.key,
      name: grouping.name,
      kind: grouping.kind as "list" | "tree",
      multiple: grouping.multiple,
      archived: grouping.archivedAt !== null,
      values: flattenValues(grouping.values).map((value) => ({
        id: value.id, parentId: value.parentId, label: value.label, code: value.code, level: value.level, archived: value.archivedAt !== null, members: held.get(value.id) ?? 0,
      })),
    })),
  };
}

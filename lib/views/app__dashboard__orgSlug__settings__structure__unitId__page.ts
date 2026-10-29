import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/email/message";
import { teamScope, unitInScope } from "@/lib/membership/scope";
import { planOffersUnit } from "@/lib/membership/planUnits";
import { can, requireOrgCapability } from "@/lib/permissions";
import { unitChain } from "@/lib/payments/payGuidance";
import { resolveUnitInstructions } from "@/lib/payments/unitInstructions";

/** One unit: where it sits, what's under it, who looks after it, its join links, and where it can move. */
export async function loadOrgUnitView({ params }: { params: Promise<{ orgSlug: string; unitId: string }> }) {
  const { orgSlug, unitId } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "structure.manage");
  const organisationId = organisation.id;
  const unit = await prisma.orgUnit.findFirst({
    where: { organisationId, id: unitId.slice(0, 64) },
    select: { id: true, name: true, code: true, level: true, path: true, parentId: true, archivedAt: true, paymentInstructions: true },
  });
  if (!unit) notFound();
  // Staff limited to a unit see only units inside their reach.
  if (!unitInScope(await teamScope(organisationId, membership.unitId), unit.path)) notFound();

  // A scoped viewer's reach starts at their own unit (on this unit's path, being in scope): nothing above it is shown.
  const fullPath = unit.path.split("/");
  const pathIds = membership.unitId ? fullPath.slice(fullPath.indexOf(membership.unitId)) : fullPath;
  const subtree = { OR: [{ path: unit.path }, { path: { startsWith: `${unit.path}/` } }] };
  const [org, ancestors, children, staff, plans, members, parents, chain, paySettings] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true, slug: true, logoUrl: true, unitLevels: true } }),
    prisma.orgUnit.findMany({ where: { organisationId, id: { in: pathIds.slice(0, -1) } }, select: { id: true, name: true, level: true } }),
    prisma.orgUnit.findMany({ where: { organisationId, parentId: unit.id }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, archivedAt: true } }),
    // Everyone whose reach includes this unit: staff limited to it or to a unit above it.
    prisma.teamMember.findMany({ where: { organisationId, unitId: { in: pathIds } }, select: { id: true, unitId: true, orgRole: { select: { name: true } }, user: { select: { name: true, email: true } } } }),
    prisma.membershipPlan.findMany({
      where: { organisationId, archivedAt: null, joinMode: { in: ["OPEN", "APPROVAL"] } },
      orderBy: { name: "asc" },
      select: { name: true, slug: true, allUnits: true, units: { select: { unit: { select: { path: true } } } } },
    }),
    prisma.member.count({ where: { organisationId, unit: { is: subtree } } }),
    unit.level > 0
      ? prisma.orgUnit.findMany({ where: { organisationId, level: unit.level - 1, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    unitChain(organisationId, unit.path),
    prisma.orgPaymentSettings.findUnique({ where: { organisationId }, select: { offlineInstructions: true } }),
  ]);
  const ancestorName = new Map(ancestors.map((entry) => [entry.id, entry.name]));

  return {
    org,
    canEdit: can(membership, "structure.manage", { write: true }),
    unit: { id: unit.id, name: unit.name, code: unit.code, parentId: unit.parentId, archived: Boolean(unit.archivedAt), levelName: org.unitLevels[unit.level] ?? "Unit" },
    trail: [...ancestors].sort((a, b) => a.level - b.level).map(({ id, name }) => ({ id, name })),
    childLevelName: org.unitLevels[unit.level + 1] ?? null,
    /** This unit's own offline payment instructions, and what members here see without them. */
    payment: { instructions: unit.paymentInstructions, inherited: resolveUnitInstructions(chain.slice(0, -1), paySettings?.offlineInstructions ?? "") },
    children,
    members,
    staff: staff.map((entry) => ({
      id: entry.id,
      name: entry.user.name || entry.user.email || "Team member",
      role: entry.orgRole.name,
      reach: entry.unitId === unit.id ? "This unit" : `All of ${ancestorName.get(entry.unitId!) ?? "a unit above"}`,
    })),
    joinLinks: unit.archivedAt
      ? []
      : plans
          .filter((plan) => planOffersUnit(plan, plan.units.map((entry) => entry.unit.path), unit.path))
          .map((plan) => ({ plan: plan.name, url: absoluteUrl(`/o/${org.slug}/join/${plan.slug}?unit=${unit.code}`) })),
    parents: parents.filter((parent) => parent.id !== unit.parentId),
    parentLevelName: unit.level > 0 ? org.unitLevels[unit.level - 1] ?? "Unit" : null,
  };
}

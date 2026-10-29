import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { memberWhere, teamScope } from "@/lib/membership/scope";

/** Every plan with how many members hold it now and how many are waiting (within a scoped viewer's units). */
export async function loadOrgPlansView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "members.view");
  const scope = await teamScope(organisation.id, membership.unitId);
  const [org, plans, counts] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, locale: true, financialYearStartMonth: true } }),
    prisma.membershipPlan.findMany({
      where: { organisationId: organisation.id },
      orderBy: [{ archivedAt: "asc" }, { sortOrder: "asc" }],
      include: { units: { include: { unit: { select: { name: true } } } } },
    }),
    prisma.membershipTerm.groupBy({ by: ["planId", "status"], where: { organisationId: organisation.id, status: { in: ["ACTIVE", "GRACE", "PENDING_APPROVAL", "PENDING_PAYMENT"] }, ...(scope.unitPath ? { member: memberWhere(scope) } : {}) }, _count: { _all: true } }),
  ]);
  const tally = (planId: string, statuses: string[]) => counts.filter((row) => row.planId === planId && statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  return {
    org,
    canManage: can(membership, "plans.manage", { write: true }),
    plans: plans.map((plan) => ({
      ...plan,
      active: tally(plan.id, ["ACTIVE", "GRACE"]),
      waiting: tally(plan.id, ["PENDING_APPROVAL", "PENDING_PAYMENT"]),
      unitNames: plan.units.map((entry) => entry.unit.name),
    })),
  };
}

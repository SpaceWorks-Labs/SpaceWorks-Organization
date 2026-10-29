import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { memberWhere, teamScope, unitInScope } from "@/lib/membership/scope";

async function orgUnits(organisationId: string) {
  return prisma.orgUnit.findMany({ where: { organisationId, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, level: true, path: true } });
}

/** Everything the new-plan page needs: the default currency and the units a plan can be limited to. */
export async function loadNewPlanView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "plans.manage");
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, currency: true } });
  return { org, units: (await orgUnits(organisation.id)).map(({ id, name, level }) => ({ id, name, level })), canManage: can(membership, "plans.manage", { write: true }) };
}

/** One plan: its settings, its join-form questions and its open invitations. */
export async function loadPlanView({ params }: { params: Promise<{ orgSlug: string; planId: string }> }) {
  const { orgSlug, planId } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "members.view");
  const plan = await prisma.membershipPlan.findFirst({
    where: { id: planId, organisationId: organisation.id },
    include: { fields: { orderBy: { sortOrder: "asc" } }, units: { select: { unitId: true } }, _count: { select: { terms: true } } },
  });
  if (!plan) notFound();
  const now = new Date();
  // A scoped viewer sees only the invites that place people inside their units.
  const scope = await teamScope(organisation.id, membership.unitId);
  const reach = scope.unitPath
    ? (await prisma.orgUnit.findMany({ where: { organisationId: organisation.id, OR: [{ path: scope.unitPath }, { path: { startsWith: `${scope.unitPath}/` } }] }, select: { id: true } })).map((unit) => unit.id)
    : null;
  const [org, units, invites, scopedTerms] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, status: true } }),
    orgUnits(organisation.id),
    prisma.memberInvite.findMany({
      where: { organisationId: organisation.id, planId: plan.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], ...(reach ? { unitId: { in: reach } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, token: true, email: true, uses: true, maxUses: true, expiresAt: true, createdAt: true, unitId: true },
    }),
    // A scoped viewer counts only the memberships of people in their units.
    scope.unitPath ? prisma.membershipTerm.count({ where: { organisationId: organisation.id, planId: plan.id, member: { is: memberWhere(scope) } } }) : null,
  ]);
  return {
    org,
    plan: scopedTerms === null ? plan : { ...plan, _count: { terms: scopedTerms } },
    units: units.filter((unit) => unitInScope(scope, unit.path)).map(({ id, name, level }) => ({ id, name, level })),
    invites: invites.filter((invite) => invite.uses < invite.maxUses),
    canManagePlan: can(membership, "plans.manage", { write: true }),
    canInvite: can(membership, "members.manage"),
  };
}

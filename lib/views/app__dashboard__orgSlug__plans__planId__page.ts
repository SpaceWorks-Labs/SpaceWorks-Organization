import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { isLimited, memberWhere, teamScope, unitInScope } from "@/lib/membership/scope";
import { conflictingKeys } from "@/lib/membership/planAnswers";

async function orgUnits(organisationId: string) {
  return prisma.orgUnit.findMany({ where: { organisationId, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, level: true, path: true } });
}

/** The active plans a renewal can move into. */
function renewTargets(organisationId: string, exceptId?: string) {
  return prisma.membershipPlan.findMany({ where: { organisationId, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
}

/** The organisation's smart groups, for who may renew and renewing into. */
function smartGroups(organisationId: string) {
  return prisma.smartGroup.findMany({ where: { organisationId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** Everything the new-plan page needs: the default currency and the units a plan can be limited to. */
export async function loadNewPlanView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "plans.manage");
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, currency: true } });
  return { org, units: (await orgUnits(organisation.id)).map(({ id, name, level }) => ({ id, name, level })), otherPlans: await renewTargets(organisation.id), groups: await smartGroups(organisation.id), canManage: can(membership, "plans.manage", { write: true }) };
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
  const scope = await teamScope(organisation.id, membership);
  const reach = scope.unitPath
    ? (await prisma.orgUnit.findMany({ where: { organisationId: organisation.id, OR: [{ path: scope.unitPath }, { path: { startsWith: `${scope.unitPath}/` } }] }, select: { id: true } })).map((unit) => unit.id)
    : null;
  const canInvite = can(membership, "members.manage");
  const showEmail = can(membership, "members.contact");
  const [org, units, invites, scopedTerms, planFields, otherPlans, groupings, groups] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, status: true } }),
    orgUnits(organisation.id),
    // Invites are read only by staff who may send them; an invitee's email only by staff who may see contact details.
    !canInvite || scope.limits.length ? [] : prisma.memberInvite.findMany({
      where: { organisationId: organisation.id, planId: plan.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], ...(reach ? { unitId: { in: reach } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, token: true, email: true, uses: true, maxUses: true, expiresAt: true, createdAt: true, unitId: true },
    }),
    // A scoped viewer counts only the memberships of people in their units.
    isLimited(scope) ? prisma.membershipTerm.count({ where: { organisationId: organisation.id, planId: plan.id, member: { is: memberWhere(scope) } } }) : null,
    prisma.membershipPlan.findMany({ where: { organisationId: organisation.id }, select: { fields: true } }),
    renewTargets(organisation.id, plan.id),
    prisma.orgGrouping.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    smartGroups(organisation.id),
  ]);
  return {
    org,
    plan: scopedTerms === null ? plan : { ...plan, _count: { terms: scopedTerms } },
    units: units.filter((unit) => unitInScope(scope, unit.path)).map(({ id, name, level }) => ({ id, name, level })),
    otherPlans,
    invites: invites.filter((invite) => invite.uses < invite.maxUses).map((invite) => ({ ...invite, email: showEmail ? invite.email : null })),
    groups,
    // Keys the plans define differently are kept off public forms until they match; the question editor lists them.
    conflictingKeys: conflictingKeys(planFields),
    groupings,
    canManagePlan: can(membership, "plans.manage", { write: true }),
    canInvite,
    canViewMembers: can(membership, "members.view"),
  };
}

import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadPublicOrganisation } from "@/lib/publicOrganisation";
import { deriveStatus } from "@/lib/membership/lifecycle";
import { planOffersUnit } from "@/lib/membership/planUnits";

type Search = { invite?: string; unit?: string };

/**
 * The join form for one plan: the plan, its questions and units, the signed-in person (if any), any
 * standing they already have on it, and whether an invite in the link is usable.
 */
export async function loadJoinView({ params, searchParams }: { params: Promise<{ orgSlug: string; planSlug: string }>; searchParams: Promise<Search> }) {
  const { orgSlug, planSlug } = await params;
  const { invite: inviteToken, unit: unitCode } = await searchParams;
  const org = await loadPublicOrganisation(orgSlug);
  const plan = await prisma.membershipPlan.findFirst({
    where: { organisationId: org.id, slug: planSlug, archivedAt: null },
    include: { fields: { where: { adminOnly: false }, orderBy: { sortOrder: "asc" } }, units: { select: { unit: { select: { path: true } } } } },
  });
  if (!plan) notFound();

  const session = await auth();
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, emailVerified: true } }) : null;
  const now = new Date();
  const invite = inviteToken ? await prisma.memberInvite.findFirst({ where: { token: inviteToken.slice(0, 128), planId: plan.id }, select: { email: true, uses: true, maxUses: true, revokedAt: true, expiresAt: true, unitId: true } }) : null;
  const inviteState = !inviteToken ? "none" : !invite || invite.revokedAt || invite.uses >= invite.maxUses || (invite.expiresAt && invite.expiresAt <= now) ? "unusable" : invite.email && user?.email && invite.email !== user.email.toLowerCase() ? "other-email" : "ok";

  let standing: string | null = null;
  let memberUnit: { id: string; name: string; path: string } | null = null;
  // Member records are found only by a verified email.
  if (user?.email && user.emailVerified) {
    const member = await prisma.member.findUnique({ where: { organisationId_email: { organisationId: org.id, email: user.email.toLowerCase() } }, select: { unit: { select: { id: true, name: true, path: true } }, terms: { where: { planId: plan.id } } } });
    if (member?.terms.length) standing = deriveStatus(member.terms, now).status;
    memberUnit = member?.unit ?? null;
  }

  // A plan limited to units is offered to everything under them too.
  const planUnitPaths = plan.units.map((entry) => entry.unit.path);
  const units = org.unitLevels.length
    ? (await prisma.orgUnit.findMany({ where: { organisationId: org.id, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, level: true, path: true, code: true } }))
        .filter((unit) => planOffersUnit(plan, planUnitPaths, unit.path))
    : [];
  // The unit is locked by, in order: the member's existing unit (joining never moves it), the invite's, then `?unit=CODE`.
  const code = typeof unitCode === "string" ? unitCode.trim().toUpperCase() : "";
  const linkUnitId = code ? units.find((unit) => unit.code === code)?.id ?? null : null;
  const offered = (id: string | null | undefined) => (id && units.some((unit) => unit.id === id) ? id : null);
  const presetUnitId = offered(memberUnit?.id) ?? (inviteState === "ok" ? offered(invite?.unitId) : null) ?? linkUnitId;

  return {
    org,
    plan,
    units: units.map(({ id, name, level }) => ({ id, name, level })),
    unitCode: linkUnitId ? code : null,
    unitLabel: org.unitLevels.at(-1) ?? "Unit",
    user: user ? { name: user.name ?? "", email: user.email ?? "", verified: Boolean(user.emailVerified) } : null,
    standing,
    inviteToken: inviteState === "ok" ? inviteToken! : null,
    inviteState,
    presetUnitId,
    // Joining never moves a member, so a plan not offered in their unit can't be joined here. Judged from the unit's
    // path, not the picker: a member of an archived unit keeps it and may still join a plan that reaches it.
    unitNotOffered: memberUnit && !planOffersUnit(plan, planUnitPaths, memberUnit.path) ? memberUnit.name : null,
    open: org.status === "ACTIVE" && (plan.joinMode === "OPEN" || plan.joinMode === "APPROVAL" || inviteState === "ok"),
  };
}

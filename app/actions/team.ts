"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, getMembership, hasAuthenticator, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { deleteOrganisationSchema, removeTeamMemberSchema, teamMemberUnitSchema, updateTeamRoleSchema } from "@/lib/validators";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";
import { canDeleteInStatus } from "@/lib/organisationLifecycle";
import { recordAuditEvent } from "@/lib/audit";
import { hasRecentAuthentication } from "@/lib/reauth";
import { liveUnit, lockGrantableRole, mayGrant } from "@/lib/team/granting";
import { manageableTarget, refreshTeam, teamAccess, teamChange, TeamError } from "@/lib/team/members";
import { roleColumns } from "@/lib/team/roles";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/** Give a staff member another of the organisation's roles, at the reach they already hold. */
export async function updateTeamRole(input: unknown): Promise<ActionResult> {
  const parsed = updateTeamRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await teamAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  if (!(await hasRecentAuthentication())) return { ok: false, error: "For security, sign in again before changing team roles." };
  const organisationId = access.organisation.id;
  const result = await teamChange(() => prisma.$transaction(async (tx) => {
    const { target, scope } = await manageableTarget(tx, access.membership, parsed.data.targetUserId);
    if (target.roleId === parsed.data.roleId) return;
    const role = await lockGrantableRole(tx, organisationId, parsed.data.roleId);
    if (!role) throw new TeamError("That role isn't available. Choose another.");
    if (!mayGrant(access.membership, scope, { role, unitId: target.unitId, unitPath: target.unit?.path ?? null })) {
      throw new TeamError("Your role doesn't allow you to give that role.");
    }
    await tx.teamMember.update({ where: { id: target.id }, data: roleColumns(role) });
    await recordAuditEvent({ action: "TEAM_ROLE_CHANGED", actorUserId: access.userId, organisationId, targetType: "teamMember", targetId: target.id, metadata: { fromRoleId: target.roleId, toRoleId: role.id }, client: tx });
  }));
  if (result.ok) refreshTeam(access.organisation.slug);
  return result;
}

/** Take someone off the team. Leaving yourself is done from your account. */
export async function removeTeamMember(input: unknown): Promise<ActionResult> {
  const parsed = removeTeamMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await teamAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  if (parsed.data.targetUserId === access.userId) return { ok: false, error: "You cannot remove yourself this way." };
  const organisationId = access.organisation.id;
  const result = await teamChange(() => prisma.$transaction(async (tx) => {
    const { target } = await manageableTarget(tx, access.membership, parsed.data.targetUserId);
    await tx.teamMember.delete({ where: { id: target.id } });
    await recordAuditEvent({ action: "TEAM_MEMBER_REMOVED", actorUserId: access.userId, organisationId, targetType: "teamMember", targetId: target.id, metadata: { roleId: target.roleId }, client: tx });
  }));
  if (result.ok) refreshTeam(access.organisation.slug);
  return result;
}

/**
 * Limit a staff member to one unit's subtree, or give them the whole organisation again. Staff who hold their own role
 * for one unit may only move people within their subtree, and never give org-wide reach.
 */
export async function setTeamMemberUnit(input: unknown): Promise<ActionResult> {
  const parsed = teamMemberUnitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await teamAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  const unitId = parsed.data.unitId;
  const result = await teamChange(() => prisma.$transaction(async (tx) => {
    const { target, scope } = await manageableTarget(tx, access.membership, parsed.data.targetUserId);
    if (target.unitId === unitId) return;
    const unit = unitId ? await liveUnit(tx, organisationId, unitId) : null;
    if (unitId && !unit) throw new TeamError("That unit no longer exists.");
    if (!mayGrant(access.membership, scope, { role: target.orgRole, unitId, unitPath: unit?.path ?? null })) {
      throw new TeamError(access.membership.unitId ? "You can only give access inside your own unit." : "Your role doesn't allow you to give this person that access.");
    }
    await tx.teamMember.update({ where: { id: target.id }, data: { unitId } });
    await recordAuditEvent({ action: "TEAM_UNIT_SCOPE_CHANGED", actorUserId: access.userId, organisationId, targetType: "teamMember", targetId: target.id, metadata: { fromUnitId: target.unitId, toUnitId: unitId }, client: tx });
  }));
  if (result.ok) refreshTeam(access.organisation.slug);
  return result;
}

export async function deleteOrganisation(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = deleteOrganisationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const org = await prisma.organisation.findUnique({
    where: { slug: parsed.data.organisationSlug },
  });
  if (!org) return { ok: false, error: "Organisation not found." };

  if (!canDeleteInStatus(org.status)) return { ok: false, error: "A suspended or archived organisation keeps its records and can't be deleted." };

  const membership = await getMembership(session.user.id, org.id);
  if (!can(membership, "org.delete")) {
    return { ok: false, error: "Only the organisation owner can delete it." };
  }
  if (!(await hasAuthenticator(session.user.id))) return { ok: false, error: STAFF_AUTHENTICATOR_MESSAGE };
  if (!(await hasRecentAuthentication())) {
    return { ok: false, error: "For security, sign in again before deleting an organisation." };
  }

  // Money records are kept for audit (8 years); an organisation that has taken payments is archived instead.
  if ((await prisma.payment.count({ where: { organisationId: org.id, status: { in: ["PAID", "WAIVED"] } } })) || (await prisma.ledgerEntry.count({ where: { organisationId: org.id } }))) {
    return { ok: false, error: "This organisation has taken payments, so its records must be kept. Ask a platform admin to archive it instead." };
  }

  const slug = org.slug;
  // Deliberately omit organisationId: deleting the organisation cascades its
  // scoped records, while this audit record must survive at the instance level.
  await recordAuditEvent({
    action: "ORGANISATION_DELETED",
    actorUserId: session.user.id,
    targetType: "organisation",
    targetId: org.id,
  });
  await prisma.$transaction([
    prisma.paymentLine.deleteMany({ where: { organisationId: org.id } }),
    prisma.payment.deleteMany({ where: { organisationId: org.id } }),
    prisma.organisation.delete({ where: { id: org.id } }),
  ]);

  revalidatePath("/dashboard");
  revalidatePath(`/o/${slug}`);
  return { ok: true };
}

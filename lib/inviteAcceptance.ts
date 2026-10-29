import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { lockOrganisationTeam, mayGrant, reachOf } from "@/lib/team/granting";
import { roleColumns } from "@/lib/team/roles";

export type InviteAcceptance =
  | { ok: true; href: string }
  | { ok: false; reason: "unavailable" | "wrong-account" | "team-full" };

type Invite = { organisationId: string; roleId: string; unitId: string | null; createdByUserId: string | null };

/** A super admin off the team who sent an invite through platform access stands in as an organisation-wide owner. */
async function platformInviter(tx: Prisma.TransactionClient, organisationId: string, userId: string) {
  const creator = await tx.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true, email: true, emailVerified: true } });
  if (!creator?.isSuperAdmin || !creator.email || !creator.emailVerified) return null;
  const orgRole = await tx.orgRole.findFirst({ where: { organisationId, isOwner: true } });
  return orgRole ? { orgRole, unitId: null } : null;
}

/**
 * Whether an invite may still be used: its role and unit aren't archived, and whoever made it could still give it.
 * Invites made by a super admin off the team (owner invites, and staff invites sent through platform access) are
 * checked as if an organisation-wide owner made them.
 */
async function stillGrantable(tx: Prisma.TransactionClient, invite: Invite) {
  // Lock the role so an archive or an edit can't slip in between this check and the grant.
  await tx.$queryRaw`SELECT 1 FROM "OrgRole" WHERE "id" = ${invite.roleId} AND "organisationId" = ${invite.organisationId} FOR SHARE`;
  const role = await tx.orgRole.findFirst({ where: { id: invite.roleId, organisationId: invite.organisationId, archivedAt: null } });
  if (!role) return null;
  const unit = invite.unitId ? await tx.orgUnit.findFirst({ where: { id: invite.unitId, organisationId: invite.organisationId, archivedAt: null }, select: { path: true } }) : null;
  if (invite.unitId && !unit) return null;
  if (!invite.createdByUserId) return null;
  if (role.isOwner) {
    const creator = await tx.user.findUnique({ where: { id: invite.createdByUserId }, select: { isSuperAdmin: true } });
    return creator?.isSuperAdmin && !invite.unitId ? role : null;
  }
  const inviter = (await tx.teamMember.findUnique({
    where: { userId_organisationId: { userId: invite.createdByUserId, organisationId: invite.organisationId } },
    include: { orgRole: true },
  })) ?? (await platformInviter(tx, invite.organisationId, invite.createdByUserId));
  if (!inviter) return null;
  const scope = await reachOf(tx, invite.organisationId, inviter.unitId);
  return mayGrant(inviter, scope, { role, unitId: invite.unitId, unitPath: unit?.path ?? null }) ? role : null;
}

/**
 * Join an organisation's team with a single-use invite. Invites the platform super-admin sends when it
 * creates an organisation are bound to one email address; only that verified account may accept. Everything the
 * invite grants is checked again here, under the organisation's team lock, along with its team size limit.
 */
export async function acceptOrganisationInviteToken(token: string, user: { id: string; email: string | null; emailVerified: boolean }): Promise<InviteAcceptance> {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.teamInvite.findUnique({
      where: { token },
      select: { id: true, email: true, organisationId: true, roleId: true, unitId: true, createdByUserId: true, usedAt: true, expiresAt: true, organisation: { select: { slug: true } } },
    });
    const now = new Date();
    if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt <= now)) return { ok: false, reason: "unavailable" };
    if (invite.email && (!user.emailVerified || !user.email || invite.email.trim().toLowerCase() !== user.email.trim().toLowerCase())) {
      return { ok: false, reason: "wrong-account" };
    }
    await lockOrganisationTeam(tx, invite.organisationId);
    const role = await stillGrantable(tx, invite);
    if (!role) return { ok: false, reason: "unavailable" };
    const existing = await tx.teamMember.findUnique({ where: { userId_organisationId: { userId: user.id, organisationId: invite.organisationId } }, select: { id: true } });
    if (!existing) {
      const organisation = await tx.organisation.findUniqueOrThrow({ where: { id: invite.organisationId }, select: { managerLimit: true } });
      if (organisation.managerLimit !== null && (await tx.teamMember.count({ where: { organisationId: invite.organisationId } })) >= organisation.managerLimit) {
        return { ok: false, reason: "team-full" };
      }
    }
    const claim = await tx.teamInvite.updateMany({
      where: { id: invite.id, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: { usedAt: now, usedByUserId: user.id },
    });
    if (claim.count !== 1) return { ok: false, reason: "unavailable" };
    // Someone already on the team keeps the access they have.
    if (!existing) {
      await tx.teamMember.create({ data: { userId: user.id, organisationId: invite.organisationId, ...roleColumns(role), unitId: invite.unitId } });
    }
    await tx.auditEvent.create({ data: { action: "TEAM_INVITE_ACCEPTED", actorUserId: user.id, organisationId: invite.organisationId, targetType: "TeamInvite", targetId: invite.id, metadata: { roleId: role.id, unitId: invite.unitId } } });
    return { ok: true, href: `/dashboard/${invite.organisation.slug}` };
  });
}

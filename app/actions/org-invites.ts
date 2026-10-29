"use server";

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createOrgInviteSchema, revokeOrgInviteSchema } from "@/lib/validators";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { orgActionAccess } from "@/lib/permissions";
import { liveUnit, lockGrantableRole, mayGrant, reachOf } from "@/lib/team/granting";
import { refreshTeam, TeamError } from "@/lib/team/members";
import { roleColumns } from "@/lib/team/roles";

const INVITE_DAYS = 7;

function randomToken(): string {
  // 32 chars of base64url-ish entropy, no padding.
  return crypto.randomBytes(24).toString("base64url");
}

async function inviteAccess(slug: unknown) {
  const access = await orgActionAccess(slug, "team.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("invite", access.userId)) return { ok: false as const, error: "Too many invite requests. Please try again later." };
  return access;
}

/**
 * A single-use link that adds one person to the team with a role, for the whole organisation or one unit. The role
 * and unit must be ones the inviter could give today; acceptance checks again.
 */
export async function createOrgInvite(input: unknown): Promise<ActionResult<{ token: string; inviteId: string; }>> {
  const parsed = createOrgInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a role for the invite.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await inviteAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  const { roleId, unitId } = parsed.data;
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  // Retry on token collision (very unlikely, but unique constraint exists).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const invite = await prisma.$transaction(async (tx) => {
        const role = await lockGrantableRole(tx, organisationId, roleId);
        if (!role) throw new TeamError("That role isn't available. Choose another.");
        const unit = unitId ? await liveUnit(tx, organisationId, unitId) : null;
        if (unitId && !unit) throw new TeamError("That unit no longer exists.");
        const scope = await reachOf(tx, organisationId, access.membership.unitId);
        if (!mayGrant(access.membership, scope, { role, unitId, unitPath: unit?.path ?? null })) {
          throw new TeamError(access.membership.unitId && !unitId ? "Choose a unit inside yours. You can't invite people for the whole organisation." : "Your role doesn't allow you to invite someone with that access.");
        }
        const created = await tx.teamInvite.create({
          data: { organisationId, token: randomToken(), ...roleColumns(role), unitId, createdByUserId: access.userId, expiresAt },
          select: { id: true, token: true },
        });
        await recordAuditEvent({ action: "ORGANISATION_INVITE_CREATED", actorUserId: access.userId, organisationId, targetType: "TeamInvite", targetId: created.id, metadata: { roleId: role.id, unitId }, client: tx });
        return created;
      });
      refreshTeam(access.organisation.slug);
      return { ok: true, data: { token: invite.token, inviteId: invite.id } };
    } catch (error) {
      if (error instanceof TeamError) return { ok: false, error: error.message };
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      console.error("[organisation invite] creation failed");
      return { ok: false, error: "Could not create invite link." };
    }
  }

  return { ok: false, error: "Could not create invite link. Please try again." };
}

/** Revoke an unused invite link. Staff may revoke only invites they could have made. */
export async function revokeOrgInvite(input: unknown): Promise<ActionResult> {
  const parsed = revokeOrgInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await inviteAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;

  const invite = await prisma.teamInvite.findFirst({
    where: { id: parsed.data.inviteId, organisationId },
    select: { id: true, usedAt: true, unitId: true, orgRole: true, unit: { select: { path: true } } },
  });
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.usedAt) return { ok: false, error: "Invite is already used." };
  const scope = await reachOf(prisma, organisationId, access.membership.unitId);
  if (!mayGrant(access.membership, scope, { role: invite.orgRole, unitId: invite.unitId, unitPath: invite.unit?.path ?? null })) {
    return { ok: false, error: "Your role doesn't allow you to revoke this invite." };
  }

  await prisma.teamInvite.deleteMany({ where: { id: invite.id, organisationId, usedAt: null } });
  await recordAuditEvent({ action: "ORGANISATION_INVITE_REVOKED", actorUserId: access.userId, organisationId, targetType: "TeamInvite", targetId: invite.id });
  refreshTeam(access.organisation.slug);
  return { ok: true };
}

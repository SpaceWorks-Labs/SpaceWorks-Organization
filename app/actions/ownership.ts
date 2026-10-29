"use server";

import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { hasAuthenticator, orgActionAccess, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { organisationAllows } from "@/lib/permissionRoles";
import { hasRecentAuthentication } from "@/lib/reauth";
import { acceptOwnershipTransferSchema, cancelOwnershipTransferSchema, startOwnershipTransferSchema } from "@/lib/validators";
import { lockGrantableRole, lockOrganisationTeam } from "@/lib/team/granting";
import { refreshTeam, TeamError } from "@/lib/team/members";
import { closeExpiredTransfers, openTransferWhere, TRANSFER_DAYS } from "@/lib/team/ownership";
import { ownerRole, roleColumns } from "@/lib/team/roles";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

async function attempt<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof TeamError) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * The owner offers the organisation to another staff member who holds their role for the whole organisation, naming
 * the role they keep. Nothing changes until that person accepts. One open offer per organisation.
 */
export async function startOwnershipTransfer(input: unknown): Promise<ActionResult> {
  const parsed = startOwnershipTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose who becomes the owner and the role you keep.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await orgActionAccess(parsed.data.organisationSlug, "ownership.transfer");
  if (!access.ok) return access;
  if (access.membership.superAdmin) return { ok: false, error: "Platform access can't transfer ownership; the organisation's owner does that." };
  if (await isActionRateLimited("action", access.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  if (!(await hasRecentAuthentication())) return { ok: false, error: "For security, sign in again before transferring ownership." };
  const { targetUserId, keepRoleId } = parsed.data;
  if (targetUserId === access.userId) return { ok: false, error: "You already own this organisation." };
  const organisationId = access.organisation.id;
  const result = await attempt(() => prisma.$transaction(async (tx) => {
    await lockOrganisationTeam(tx, organisationId);
    await closeExpiredTransfers(tx, organisationId);
    if (await tx.ownershipTransfer.count({ where: openTransferWhere(organisationId) })) throw new TeamError("A transfer is already waiting. Cancel it first.");
    const target = await tx.teamMember.findUnique({ where: { userId_organisationId: { userId: targetUserId, organisationId } }, include: { orgRole: true, user: { select: { email: true } } } });
    if (!target) throw new TeamError("That person isn't on the team.");
    if (target.orgRole.isOwner) throw new TeamError("That person already owns this organisation.");
    if (target.unitId) throw new TeamError("Give this person the whole organisation first. An owner can't be limited to one unit.");
    const kept = await lockGrantableRole(tx, organisationId, keepRoleId);
    if (!kept) throw new TeamError("Choose the role you'll keep.");
    const transfer = await tx.ownershipTransfer.create({
      data: { organisationId, fromUserId: access.userId, toUserId: targetUserId, keepRoleId: kept.id, token: crypto.randomBytes(32).toString("base64url"), expiresAt: new Date(Date.now() + TRANSFER_DAYS * 86_400_000) },
      select: { id: true },
    });
    if (target.user.email) await enqueueOutbox(tx, "ownership-transfer", { to: target.user.email, transferId: transfer.id, notice: "offered" });
    await recordAuditEvent({ action: "OWNERSHIP_TRANSFER_STARTED", actorUserId: access.userId, organisationId, targetType: "OwnershipTransfer", targetId: transfer.id, metadata: { toTeamMemberId: target.id, keptRoleId: kept.id }, client: tx });
  }));
  if (!result.ok) return result;
  refreshTeam(access.organisation.slug);
  return { ok: true };
}

/** The owner withdraws an open offer. */
export async function cancelOwnershipTransfer(input: unknown): Promise<ActionResult> {
  const parsed = cancelOwnershipTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await orgActionAccess(parsed.data.organisationSlug, "ownership.transfer");
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  const result = await attempt(() => prisma.$transaction(async (tx) => {
    await lockOrganisationTeam(tx, organisationId);
    const open = await tx.ownershipTransfer.findFirst({ where: openTransferWhere(organisationId), select: { id: true } });
    if (!open) throw new TeamError("There's no transfer waiting.");
    await tx.ownershipTransfer.update({ where: { id: open.id }, data: { cancelledAt: new Date() } });
    await recordAuditEvent({ action: "OWNERSHIP_TRANSFER_CANCELLED", actorUserId: access.userId, organisationId, targetType: "OwnershipTransfer", targetId: open.id, client: tx });
  }));
  if (!result.ok) return result;
  refreshTeam(access.organisation.slug);
  return { ok: true };
}

/**
 * The proposed owner accepts. Everything is checked again under the organisation's team lock: the offer is open and
 * unexpired, its maker still owns the organisation, and the accepter still holds their role for the whole of it.
 */
export async function acceptOwnershipTransfer(input: unknown): Promise<ActionResult<{ href: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const parsed = acceptOwnershipTransferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This transfer is no longer open." };
  if (await isActionRateLimited("action", userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  const found = await prisma.ownershipTransfer.findUnique({ where: { token: parsed.data.token }, select: { id: true, organisationId: true, toUserId: true } });
  // Someone else's offer reads the same as a missing one.
  if (!found || found.toUserId !== userId) return { ok: false, error: "This transfer is no longer open." };
  if (!(await hasAuthenticator(userId))) return { ok: false, error: STAFF_AUTHENTICATOR_MESSAGE };
  if (!(await hasRecentAuthentication())) return { ok: false, error: "For security, sign in again before accepting ownership." };
  const organisationId = found.organisationId;
  const result = await attempt(() => prisma.$transaction(async (tx) => {
    await lockOrganisationTeam(tx, organisationId);
    const now = new Date();
    const transfer = await tx.ownershipTransfer.findFirst({ where: { id: found.id, ...openTransferWhere(organisationId), expiresAt: { gt: now } }, include: { organisation: { select: { slug: true, status: true } } } });
    if (!transfer) throw new TeamError("This transfer is no longer open.");
    if (!organisationAllows(transfer.organisation.status, "ownership.transfer")) throw new TeamError("Ownership can't move while the organisation is suspended or awaiting approval.");
    const include = { orgRole: true, user: { select: { email: true } } } as const;
    const [current, target] = await Promise.all([
      tx.teamMember.findUnique({ where: { userId_organisationId: { userId: transfer.fromUserId, organisationId } }, include }),
      tx.teamMember.findUnique({ where: { userId_organisationId: { userId, organisationId } }, include }),
    ]);
    if (!current?.orgRole.isOwner) throw new TeamError("The person who offered this no longer owns the organisation.");
    if (!target || target.orgRole.isOwner || target.unitId) throw new TeamError("Only staff for the whole organisation can become the owner.");
    const kept = await lockGrantableRole(tx, organisationId, transfer.keepRoleId);
    if (!kept) throw new TeamError("The role the owner chose to keep is no longer available. Ask them to start again.");
    const owner = await ownerRole(tx, organisationId);
    await tx.teamMember.update({ where: { id: target.id }, data: { ...roleColumns(owner), unitId: null } });
    await tx.teamMember.update({ where: { id: current.id }, data: { ...roleColumns(kept), unitId: null } });
    await tx.ownershipTransfer.update({ where: { id: transfer.id }, data: { acceptedAt: now } });
    if (target.user.email) await enqueueOutbox(tx, "ownership-transfer", { to: target.user.email, transferId: transfer.id, notice: "accepted-new-owner" });
    if (current.user.email) await enqueueOutbox(tx, "ownership-transfer", { to: current.user.email, transferId: transfer.id, notice: "accepted-previous-owner" });
    await recordAuditEvent({
      action: "OWNERSHIP_TRANSFER_ACCEPTED",
      actorUserId: userId,
      organisationId,
      targetType: "OwnershipTransfer",
      targetId: transfer.id,
      metadata: { fromTeamMemberId: current.id, toTeamMemberId: target.id, keptRoleId: kept.id, fromRoleId: target.roleId },
      client: tx,
    });
    return transfer.organisation.slug;
  }));
  if (!result.ok) return result;
  refreshTeam(result.value);
  return { ok: true, data: { href: `/dashboard/${result.value}/team` } };
}

"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { orgActionAccess, type StaffMembership } from "@/lib/permissions";
import { fallbackTeamRole } from "@/lib/permissionRoles";
import { archiveStaffRoleSchema, createStaffRoleSchema, reorderStaffRolesSchema, updateStaffRoleSchema } from "@/lib/validators";
import { mayEditRole, normaliseCapabilities, ROLE_TOO_WIDE, withinEditorReach } from "@/lib/team/capabilities";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/** Thrown inside a role transaction to roll it back with a message for the person. */
class RoleError extends Error {}

async function rolesAccess(slug: unknown) {
  const access = await orgActionAccess(slug, "roles.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return access;
}

function refreshRoles(slug: string) {
  revalidatePath(`/dashboard/${slug}/settings/roles`);
  revalidatePath(`/dashboard/${slug}/team`);
}

function failed(error: unknown): Extract<ActionResult, { ok: false }> {
  if (error instanceof RoleError) return { ok: false, error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { ok: false, error: "Another role already has that name.", fieldErrors: { name: ["Already used"] } };
  }
  throw error;
}

/** Lock a role this person may edit: this organisation's, not the Owner role, not their own, and narrower than them. */
async function lockEditableRole(tx: Prisma.TransactionClient, actor: StaffMembership, roleId: string) {
  await tx.$queryRaw`SELECT 1 FROM "OrgRole" WHERE "id" = ${roleId} AND "organisationId" = ${actor.organisationId} FOR UPDATE`;
  const role = await tx.orgRole.findFirst({ where: { id: roleId, organisationId: actor.organisationId } });
  if (!role) throw new RoleError("Role not found.");
  if (role.isOwner) throw new RoleError("The Owner role can't be changed.");
  if (role.id === actor.roleId) throw new RoleError("You can't change the role you hold. Ask the owner.");
  if (!mayEditRole(actor, role.capabilities)) throw new RoleError(ROLE_TOO_WIDE);
  return role;
}

function checkedCapabilities(actor: StaffMembership, values: string[]) {
  const capabilities = normaliseCapabilities(values);
  if (!capabilities) throw new RoleError("Choose permissions from the list.");
  if (!withinEditorReach(actor, capabilities)) throw new RoleError("You can only give a role permissions you hold yourself.");
  return capabilities;
}

/** Add a staff role. */
export async function createStaffRole(input: unknown): Promise<ActionResult<{ roleId: string }>> {
  const parsed = createStaffRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await rolesAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  try {
    const capabilities = checkedCapabilities(access.membership, parsed.data.capabilities);
    const role = await prisma.$transaction(async (tx) => {
      const last = await tx.orgRole.aggregate({ where: { organisationId }, _max: { sortOrder: true } });
      const created = await tx.orgRole.create({
        data: { organisationId, name: parsed.data.name, description: parsed.data.description, capabilities, sortOrder: (last._max.sortOrder ?? 0) + 1 },
        select: { id: true },
      });
      await recordAuditEvent({ action: "STAFF_ROLE_CREATED", actorUserId: access.userId, organisationId, targetType: "OrgRole", targetId: created.id, metadata: { capabilities: capabilities.join(",") }, client: tx });
      return created;
    });
    refreshRoles(access.organisation.slug);
    return { ok: true, data: { roleId: role.id } };
  } catch (error) {
    return failed(error);
  }
}

/** Rename a staff role or change its permissions. Everyone holding it gets the change at once. */
export async function updateStaffRole(input: unknown): Promise<ActionResult> {
  const parsed = updateStaffRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await rolesAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  try {
    const capabilities = checkedCapabilities(access.membership, parsed.data.capabilities);
    await prisma.$transaction(async (tx) => {
      const role = await lockEditableRole(tx, access.membership, parsed.data.roleId);
      // Never widen a role to match the editor: that would hand its holders a peer's role, which `canGrant` refuses.
      if (!mayEditRole(access.membership, capabilities)) throw new RoleError("A role you change must grant less than yours.");
      const added = capabilities.filter((capability) => !role.capabilities.includes(capability));
      const removed = role.capabilities.filter((capability) => !(capabilities as string[]).includes(capability));
      await tx.orgRole.update({ where: { id: role.id }, data: { name: parsed.data.name, description: parsed.data.description, capabilities } });
      // Keep the fixed role written beside it in step, so an update rollback never gives holders more than the role now does.
      const fallback = fallbackTeamRole({ isOwner: false, capabilities });
      // Tell migration 0017's triggers this is the fallback being kept in step, not an old release changing roles.
      await tx.$executeRaw`SELECT set_config('swo.role_fallback_sync', 'on', true)`;
      await tx.teamMember.updateMany({ where: { organisationId, roleId: role.id }, data: { role: fallback } });
      await tx.teamInvite.updateMany({ where: { organisationId, roleId: role.id }, data: { role: fallback } });
      await recordAuditEvent({
        action: "STAFF_ROLE_UPDATED",
        actorUserId: access.userId,
        organisationId,
        targetType: "OrgRole",
        targetId: role.id,
        metadata: { added: added.join(","), removed: removed.join(","), renamed: role.name !== parsed.data.name },
        client: tx,
      });
    });
    refreshRoles(access.organisation.slug);
    return { ok: true };
  } catch (error) {
    return failed(error);
  }
}

/** Archive a role nobody holds and no open invite gives, or restore an archived one. */
export async function archiveStaffRole(input: unknown): Promise<ActionResult> {
  const parsed = archiveStaffRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await rolesAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const organisationId = access.organisation.id;
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const role = await lockEditableRole(tx, access.membership, parsed.data.roleId);
      if (parsed.data.archived === Boolean(role.archivedAt)) return;
      if (parsed.data.archived) {
        const holders = await tx.teamMember.count({ where: { organisationId, roleId: role.id } });
        if (holders) throw new RoleError(`${holders === 1 ? "1 person holds" : `${holders} people hold`} this role. Give them another role first.`);
        const invites = await tx.teamInvite.count({ where: { organisationId, roleId: role.id, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
        if (invites) throw new RoleError("An open invite link gives this role. Revoke it first.");
      }
      await tx.orgRole.update({ where: { id: role.id }, data: { archivedAt: parsed.data.archived ? now : null } });
      await recordAuditEvent({ action: parsed.data.archived ? "STAFF_ROLE_ARCHIVED" : "STAFF_ROLE_RESTORED", actorUserId: access.userId, organisationId, targetType: "OrgRole", targetId: role.id, client: tx });
    });
    refreshRoles(access.organisation.slug);
    return { ok: true };
  } catch (error) {
    return failed(error);
  }
}

/** Put the organisation's roles in a new order (the Owner role stays first). Only the owner reorders every role. */
export async function reorderStaffRoles(input: unknown): Promise<ActionResult> {
  const parsed = reorderStaffRolesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await rolesAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  if (!access.membership.orgRole.isOwner) return { ok: false, error: "Only the owner can reorder roles." };
  const organisationId = access.organisation.id;
  const ids = parsed.data.roleIds;
  if (new Set(ids).size !== ids.length) return { ok: false, error: "Invalid request." };
  const roles = await prisma.orgRole.findMany({ where: { organisationId, id: { in: ids }, isOwner: false }, select: { id: true } });
  if (roles.length !== ids.length) return { ok: false, error: "Role not found." };
  await prisma.$transaction([
    ...ids.map((id, index) => prisma.orgRole.updateMany({ where: { id, organisationId }, data: { sortOrder: index + 1 } })),
    prisma.auditEvent.create({ data: { action: "STAFF_ROLES_REORDERED", actorUserId: access.userId, organisationId, targetType: "Organisation", targetId: organisationId } }),
  ]);
  refreshRoles(access.organisation.slug);
  return { ok: true };
}

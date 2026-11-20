import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordThrottledAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { can, getMembership, hasAuthenticator, organisationAllows, STAFF_AUTHENTICATOR_MESSAGE, type StaffMembership } from "@/lib/permissions";
import type { Capability } from "@/lib/permissionRoles";

/*
 * Read access for the card designer's extras (version history, organisation templates, previewing with a
 * member): the server-action counterpart of requireOrgCapability, returning an error instead of redirecting.
 * Every capability must be held (to read); an unknown organisation or a non-member gets "Not found.".
 */

export type DesignerReadAccess =
  | { ok: true; organisation: { id: string; slug: string; name: string }; membership: StaffMembership; userId: string }
  | { ok: false; error: string };

export const NOT_FOUND = "Not found.";

export async function cardDesignerReadAccess(slug: unknown, capabilities: readonly Capability[]): Promise<DesignerReadAccess> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (typeof slug !== "string" || !slug) return { ok: false, error: NOT_FOUND };
  const org = await prisma.organisation.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, status: true } });
  const membership = org ? await getMembership(userId, org.id) : null;
  if (!org || !membership) return { ok: false, error: NOT_FOUND };
  if (!capabilities.every((capability) => organisationAllows(org.status, capability) && can(membership, capability))) return { ok: false, error: "Your role doesn't allow this." };
  if (!(await hasAuthenticator(userId))) return { ok: false, error: STAFF_AUTHENTICATOR_MESSAGE };
  if (await isActionRateLimited("action", userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  if (membership.superAdmin) {
    await recordThrottledAuditEvent({ action: "SUPER_ADMIN_ORG_ENTERED", actorUserId: userId, organisationId: org.id, targetType: "Organisation", targetId: org.id, windowMs: 30 * 60_000 }).catch(() => undefined);
  }
  return { ok: true, organisation: { id: org.id, slug: org.slug, name: org.name }, membership, userId };
}

/** Which design: the organisation default (neither id), one plan's or one live member role's. Null when either is gone. */
export async function findDesignScope(organisationId: string, planId: string | null, roleId: string | null) {
  if (planId && roleId) return null;
  const plan = planId ? await prisma.membershipPlan.findFirst({ where: { id: planId, organisationId }, select: { id: true, name: true } }) : null;
  if (planId && !plan) return null;
  const role = roleId ? await prisma.memberRole.findFirst({ where: { id: roleId, organisationId, archivedAt: null }, select: { id: true, name: true } }) : null;
  if (roleId && !role) return null;
  return { plan, role, where: { organisationId, planId: plan?.id ?? null, roleId: role?.id ?? null } };
}

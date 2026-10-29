import type { OrganisationStatus, OrgRole, TeamMember } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent, recordThrottledAuditEvent } from "@/lib/audit";
import type { Session } from "next-auth";
import { can, organisationAllows, STAFF_AUTHENTICATOR_MESSAGE, STAFF_AUTHENTICATOR_SETUP, type Capability } from "./permissionRoles";

/**
 * A team member with the role they hold: what every permission check reads. `superAdmin` marks platform access: a
 * super admin who isn't on this organisation's team, standing in as its owner (no team row behind it).
 */
export type StaffMembership = TeamMember & { orgRole: OrgRole; superAdmin?: true };

export async function getMembership(userId: string, organisationId: string): Promise<StaffMembership | null> {
  const membership = await prisma.teamMember.findUnique({
    where: { userId_organisationId: { userId, organisationId } },
    include: { orgRole: true },
  });
  return membership ?? platformAccess(userId, organisationId);
}

/**
 * Owner decision (2026-10-29): platform super admins have full owner-level access to every organisation, with no
 * session or time limit. They still need an authenticator like all staff, and everything they do is audited and
 * shown on the organisation's audit log. They are never on the team: not listed, not counted, not emailed.
 */
async function platformAccess(userId: string, organisationId: string): Promise<StaffMembership | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true, emailVerified: true } });
  if (!user?.isSuperAdmin || !user.emailVerified) return null;
  const orgRole = await prisma.orgRole.findFirst({ where: { organisationId, isOwner: true } });
  if (!orgRole) return null;
  return { id: `platform:${userId}`, userId, organisationId, role: "OWNER", roleId: orgRole.id, unitId: null, reportDigest: false, createdAt: new Date(0), orgRole, superAdmin: true };
}

/** Read from the database for mutation gates; session JWTs can be stale. */
export async function isUserEmailVerified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  return user?.emailVerified != null;
}

export async function requireAuth(): Promise<Session & { user: { id: string; }; }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session as Session & { user: { id: string; }; };
}

/**
 * Instance-wide super-admin gate: a verified user flagged `isSuperAdmin`. Super admins are created and their
 * passwords set only on the server (`docker/ops/admin.mjs`). Anyone else gets notFound(), so the panel's
 * existence is never revealed.
 */
export async function requireSuperAdmin(): Promise<
  Session & { user: { id: string; email: string; }; }
> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerified: true, isSuperAdmin: true },
  });
  const userEmail = user?.email;
  if (!userEmail || !user.emailVerified) notFound();
  if (!user.isSuperAdmin) notFound();

  return {
    ...session,
    user: { ...session.user, id: session.user.id, email: userEmail },
  } as Session & { user: { id: string; email: string; }; };
}

export type OrgAccessContext = {
  organisation: { id: string; slug: string; name: string; status: OrganisationStatus; };
  membership: StaffMembership;
  userId: string;
};

/**
 * Team access to an organisation, whatever its status. Use only for the application page and other
 * screens that must work before approval; everything else goes through requireOrgCapability.
 */
export async function requireOrgTeam(orgSlug: string): Promise<OrgAccessContext> {
  const session = await requireAuth();
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, slug: true, name: true, status: true } });
  if (!org) redirect("/dashboard");
  const membership = await getMembership(session.user.id, org.id);
  if (!membership) redirect("/dashboard");
  if (!(await hasAuthenticator(session.user.id))) redirect(STAFF_AUTHENTICATOR_SETUP);
  if (membership.superAdmin) {
    // Platform access into an organisation is recorded (once per half hour per organisation, like SUPER_ADMIN_ORG_VIEWED).
    await recordThrottledAuditEvent({ action: "SUPER_ADMIN_ORG_ENTERED", actorUserId: session.user.id, organisationId: org.id, targetType: "Organisation", targetId: org.id, windowMs: 30 * 60_000 }).catch(() => undefined);
  }
  return { organisation: org, membership, userId: session.user.id };
}

/** Staff (anyone on an organisation's team) must use an authenticator app; members and super admins need not. */
export async function hasAuthenticator(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabledAt: true } });
  return Boolean(user?.mfaEnabledAt);
}

/** Team access for one permission, to read, honouring the organisation's status (suspended keeps finance). */
export async function requireOrgCapability(orgSlug: string, capability: Capability): Promise<OrgAccessContext> {
  const access = await requireOrgTeam(orgSlug);
  if (!organisationAllows(access.organisation.status, capability)) redirect(`/dashboard/${orgSlug}/application`);
  if (!can(access.membership, capability)) redirect(`/dashboard/${orgSlug}`);
  return access;
}

export type OrgActionAccess =
  | { ok: true; organisation: OrgAccessContext["organisation"]; membership: StaffMembership; userId: string }
  | { ok: false; error: string };

/**
 * The server-action counterpart of requireOrgCapability: returns an error instead of redirecting, so every action
 * applies the same tenant, status and permission checks before touching data. Actions change things, so someone
 * holding their role for one unit is refused the org-wide-to-change permissions here.
 */
export async function orgActionAccess(orgSlug: unknown, capability: Capability): Promise<OrgActionAccess> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };
  if (typeof orgSlug !== "string" || !orgSlug) return { ok: false, error: "Organisation not found." };
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, slug: true, name: true, status: true } });
  if (!org) return { ok: false, error: "Organisation not found." };
  const membership = await getMembership(session.user.id, org.id);
  if (!membership) return { ok: false, error: "Organisation not found." };
  if (!organisationAllows(org.status, capability)) {
    return { ok: false, error: org.status === "SUSPENDED" ? "This organisation is suspended, so this can't be changed right now." : "This organisation isn't approved yet." };
  }
  if (!can(membership, capability, { write: true })) {
    return { ok: false, error: membership.unitId && can(membership, capability) ? "Only staff for the whole organisation can change this." : "Your role doesn't allow this." };
  }
  if (!(await hasAuthenticator(session.user.id))) return { ok: false, error: STAFF_AUTHENTICATOR_MESSAGE };
  if (membership.superAdmin) {
    await recordAuditEvent({ action: "SUPER_ADMIN_ORG_ACTION", actorUserId: session.user.id, organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { capability } });
  }
  return { ok: true, organisation: org, membership, userId: session.user.id };
}

export { can, organisationAllows, STAFF_AUTHENTICATOR_MESSAGE, STAFF_AUTHENTICATOR_SETUP } from "@/lib/permissionRoles";

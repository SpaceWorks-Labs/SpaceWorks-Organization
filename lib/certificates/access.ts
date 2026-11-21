import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator } from "@/lib/permissions";
import { memberInScope, teamScope } from "@/lib/membership/scope";
import { verifiedEmail } from "@/lib/portal/member";

/*
 * Who may download a certificate: a team member of its organisation who issues certificates or sees members'
 * contact details, uses an authenticator (as every staff route requires) and whose reach includes the member; or
 * the member themself, found only by the account's verified email (the portal's rule), while the organisation's
 * member accounts are on. Everyone else gets the same 404. A revoked certificate is for the team only.
 */

export type CertificateViewer = { userId: string; as: "team" | "member" };

export async function authorizeCertificateAccess(certificateId: string): Promise<CertificateViewer | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !/^[A-Za-z0-9_-]{1,64}$/.test(certificateId)) return null;
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    select: {
      organisationId: true, memberId: true, revokedAt: true,
      organisation: { select: { status: true, memberPortal: true } },
      member: { select: { email: true, anonymisedAt: true } },
    },
  });
  if (!certificate || certificate.member.anonymisedAt) return null;

  const membership = await getMembership(userId, certificate.organisationId);
  if (membership && organisationAllows(certificate.organisation.status, "members.view") && (can(membership, "certificates.issue") || can(membership, "members.contact")) && (await hasAuthenticator(userId))) {
    if (await memberInScope(await teamScope(certificate.organisationId, membership), certificate.memberId)) return { userId, as: "team" };
  }
  // Members keep what they were given while the organisation is suspended (member data rights stay open).
  if (certificate.revokedAt || !certificate.organisation.memberPortal || !["ACTIVE", "SUSPENDED", "ARCHIVED"].includes(certificate.organisation.status)) return null;
  const email = await verifiedEmail(userId);
  return email && email === certificate.member.email.trim().toLowerCase() ? { userId, as: "member" } : null;
}

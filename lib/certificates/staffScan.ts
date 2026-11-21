import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator } from "@/lib/permissions";
import { memberInScope, teamScope } from "@/lib/membership/scope";
import { CERTIFICATE_TOKEN_PATTERN, certificateState } from "./core";

/*
 * Staff who scan a certificate of their own organisation: a team member (or a super admin through platform access)
 * who reads members there, with the member inside their reach. Everyone else, including staff of another
 * organisation and staff limited to another unit, gets null and sees only the public check, so the page never
 * hints that the person is a member anywhere else.
 */
export async function staffCertificateScanAccess(token: string) {
  if (!CERTIFICATE_TOKEN_PATTERN.test(token)) return null;
  const userId = (await auth())?.user?.id;
  if (!userId) return null;
  const certificate = await prisma.certificate.findUnique({
    where: { verifyToken: token },
    select: {
      id: true, certificateNumber: true, title: true, reason: true, issuedAt: true, revokedAt: true, revokedReason: true, emailedAt: true, organisationId: true, memberId: true,
      design: { select: { name: true } },
      organisation: { select: { slug: true, status: true, timezone: true } },
      member: { select: { name: true, anonymisedAt: true } },
    },
  });
  if (!certificate || certificate.member.anonymisedAt) return null;
  const membership = await getMembership(userId, certificate.organisationId);
  if (!membership || !organisationAllows(certificate.organisation.status, "members.view") || !can(membership, "members.view")) return null;
  if (!(await memberInScope(await teamScope(certificate.organisationId, membership), certificate.memberId))) return null;
  return {
    userId,
    organisationId: certificate.organisationId,
    orgSlug: certificate.organisation.slug,
    timeZone: certificate.organisation.timezone,
    memberId: certificate.memberId,
    memberName: certificate.member.name,
    canIssue: can(membership, "certificates.issue") && organisationAllows(certificate.organisation.status, "certificates.issue"),
    certificate: {
      id: certificate.id, number: certificate.certificateNumber, title: certificate.title, reason: certificate.reason, designName: certificate.design.name,
      issuedAt: certificate.issuedAt, revokedAt: certificate.revokedAt, revokedReason: certificate.revokedReason, emailedAt: certificate.emailedAt, state: certificateState(certificate),
    },
    authenticator: await hasAuthenticator(userId),
  };
}

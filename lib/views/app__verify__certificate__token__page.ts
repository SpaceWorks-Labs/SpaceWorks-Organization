import { recordThrottledAuditEvent } from "@/lib/audit";
import { staffCertificateScanAccess } from "@/lib/certificates/staffScan";
import { lookupCertificateVerification } from "@/lib/certificates/verifyLookup";

/**
 * A scanned certificate, read now. Everyone gets the public check (title, organisation, number, issue date and
 * whether it is valid; the member's name only while it is). Staff of the certificate's organisation who may see
 * the member also get the certificate's own record here (lib/certificates/staffScan.ts), audited as
 * `CERTIFICATE_SCANNED`. Rate limited in proxy.ts with the card checks.
 */
export async function loadCertificateVerifyView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const checkedAt = new Date();
  const view = await lookupCertificateVerification(token);
  const access = await staffCertificateScanAccess(token);
  if (access?.authenticator) {
    await recordThrottledAuditEvent({ action: "CERTIFICATE_SCANNED", actorUserId: access.userId, organisationId: access.organisationId, targetType: "Certificate", targetId: access.certificate.id, windowMs: 10 * 60_000 });
    const staff = {
      state: "panel" as const,
      orgSlug: access.orgSlug,
      timeZone: access.timeZone,
      member: { id: access.memberId, name: access.memberName },
      certificate: {
        id: access.certificate.id,
        number: access.certificate.number,
        title: access.certificate.title,
        reason: access.certificate.reason,
        designName: access.certificate.designName,
        state: access.certificate.state,
        issuedAt: access.certificate.issuedAt.toISOString(),
        emailedAt: access.certificate.emailedAt?.toISOString() ?? null,
        revokedAt: access.certificate.revokedAt?.toISOString() ?? null,
        revokedReason: access.certificate.revokedReason,
      },
      canIssue: access.canIssue,
      /** Dashboard pages of this certificate and its member. */
      paths: { certificate: `/dashboard/${access.orgSlug}/certificates/${access.certificate.id}`, member: `/dashboard/${access.orgSlug}/members/${access.memberId}` },
      downloads: { pdf: `/api/certificates/${access.certificate.id}?format=pdf`, png: `/api/certificates/${access.certificate.id}?format=png` },
    };
    return { view, checkedAt, staff };
  }
  return { view, checkedAt, staff: access ? { state: "authenticator" as const } : null };
}

import "server-only";

import { prisma } from "@/lib/db";
import { managedImageUrl } from "@/lib/cards/imageUrl";
import { CERTIFICATE_TOKEN_PATTERN } from "./core";
import { certificateVerificationView, type CertificateVerifyView } from "./verify";

/** Look a certificate's verify token up and reduce it to what the public page may show. */
export async function lookupCertificateVerification(token: string): Promise<CertificateVerifyView> {
  if (!CERTIFICATE_TOKEN_PATTERN.test(token)) return { state: "not-found" };
  const row = await prisma.certificate.findUnique({
    where: { verifyToken: token },
    select: {
      title: true, certificateNumber: true, issuedAt: true, revokedAt: true, organisationId: true,
      member: { select: { name: true, anonymisedAt: true } },
      organisation: { select: { name: true, slug: true, status: true, timezone: true, logoUrl: true } },
    },
  });
  if (!row) return { state: "not-found" };
  return certificateVerificationView({
    certificate: row,
    member: row.member,
    organisation: { ...row.organisation, logoUrl: managedImageUrl(row.organisation.logoUrl, { kind: "organisation", organisationId: row.organisationId, category: "organisation-logos" }) },
  });
}

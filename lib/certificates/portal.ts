import "server-only";

import { prisma } from "@/lib/db";
import { verifiedEmail } from "@/lib/portal/member";
import { certificateVerifyPath } from "./core";

/*
 * A member's own certificates in the portal: found only by the account's verified email, lowercased, matched to
 * Member.email (lib/portal/member.ts). Never by a member id. Revoked certificates, erased members, organisations
 * that are not running and organisations with member accounts off are left out.
 */

export type OwnCertificate = {
  id: string;
  title: string;
  number: string;
  issuedAt: Date;
  organisation: { name: string; slug: string; timezone: string };
  verifyPath: string;
  downloads: { pdf: string; png: string };
};

export const certificateDownloadPath = (certificateId: string, format: "pdf" | "png") => `/api/certificates/${certificateId}?format=${format}`;

export async function listCertificatesForUser(userId: string): Promise<OwnCertificate[]> {
  const email = await verifiedEmail(userId);
  if (!email) return [];
  const rows = await prisma.certificate.findMany({
    where: {
      revokedAt: null,
      organisation: { status: { in: ["ACTIVE", "SUSPENDED"] }, memberPortal: true },
      member: { email, anonymisedAt: null },
    },
    select: { id: true, title: true, certificateNumber: true, issuedAt: true, verifyToken: true, organisation: { select: { name: true, slug: true, timezone: true } } },
    orderBy: { issuedAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    number: row.certificateNumber,
    issuedAt: row.issuedAt,
    organisation: row.organisation,
    verifyPath: certificateVerifyPath(row.verifyToken),
    downloads: { pdf: certificateDownloadPath(row.id, "pdf"), png: certificateDownloadPath(row.id, "png") },
  }));
}

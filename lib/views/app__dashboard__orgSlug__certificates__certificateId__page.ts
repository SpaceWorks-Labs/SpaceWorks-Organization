import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { memberInScope, teamScope } from "@/lib/membership/scope";
import { certificateState, certificateVerifyPath } from "@/lib/certificates/core";
import { requireCertificatesAccess } from "@/lib/certificates/pageAccess";
import { pageDimensions, readPage } from "@/lib/certificates/pages";
import { certificateDownloadPath } from "@/lib/certificates/portal";

/**
 * One certificate: what it says, who has it, whether it is valid, and its downloads and check link. Only members
 * inside the viewer's reach are found; anything else, including another organisation's certificate, is a 404.
 */
export async function loadCertificateDetailView({ params }: { params: Promise<{ orgSlug: string; certificateId: string }> }) {
  const { orgSlug, certificateId } = await params;
  const { organisation, membership } = await requireCertificatesAccess(orgSlug, "view");
  const certificate = await prisma.certificate.findFirst({
    where: { id: certificateId, organisationId: organisation.id },
    include: {
      design: { select: { id: true, name: true, pageSize: true, orientation: true, archivedAt: true } },
      member: { select: { id: true, name: true, anonymisedAt: true, unit: { select: { name: true } } } },
    },
  });
  if (!certificate || certificate.member.anonymisedAt) notFound();
  if (!(await memberInScope(await teamScope(organisation.id, membership), certificate.memberId))) notFound();
  const [issuedBy, revokedBy, zone] = await Promise.all([
    certificate.issuedById ? prisma.user.findUnique({ where: { id: certificate.issuedById }, select: { name: true } }) : null,
    certificate.revokedById ? prisma.user.findUnique({ where: { id: certificate.revokedById }, select: { name: true } }) : null,
    prisma.organisation.findUnique({ where: { id: organisation.id }, select: { timezone: true } }),
  ]);
  const page = readPage(certificate.design);
  const state = certificateState(certificate);

  return {
    org: { name: organisation.name, slug: organisation.slug, timeZone: zone?.timezone ?? "UTC" },
    certificate: {
      id: certificate.id,
      number: certificate.certificateNumber,
      title: certificate.title,
      reason: certificate.reason,
      state,
      issuedAt: certificate.issuedAt.toISOString(),
      issuedByName: issuedBy?.name ?? null,
      emailedAt: certificate.emailedAt?.toISOString() ?? null,
      revokedAt: certificate.revokedAt?.toISOString() ?? null,
      revokedReason: certificate.revokedReason,
      revokedByName: revokedBy?.name ?? null,
    },
    member: { id: certificate.member.id, name: certificate.member.name, unitName: certificate.member.unit?.name ?? null },
    design: { id: certificate.design.id, name: certificate.design.name, archived: certificate.design.archivedAt !== null, ...page, ...pageDimensions(page.pageSize, page.orientation) },
    /** The public check page this certificate's QR opens. */
    verifyPath: certificateVerifyPath(certificate.verifyToken),
    downloads: { pdf: certificateDownloadPath(certificate.id, "pdf"), png: certificateDownloadPath(certificate.id, "png") },
    canRevoke: state === "valid" && can(membership, "certificates.issue"),
    canEmail: state === "valid" && can(membership, "certificates.issue"),
  };
}

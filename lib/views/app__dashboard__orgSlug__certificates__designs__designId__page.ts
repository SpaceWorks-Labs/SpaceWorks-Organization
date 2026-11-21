import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { loadCardBrandKit } from "@/lib/cards/brandKitData";
import { certificateBranding, loadCertificateOrgContext } from "@/lib/certificates/data";
import { withOwnCertificateArtwork } from "@/lib/certificates/design";
import { certificateDraftDiffers, readCertificateDraft } from "@/lib/certificates/draft";
import { requireCertificatesAccess } from "@/lib/certificates/pageAccess";
import { ORIENTATION_LABELS, PAGE_SIZE_LABELS, pageDimensions } from "@/lib/certificates/pages";
import { CERTIFICATE_PLACEHOLDERS } from "@/lib/certificates/placeholders";
import { sampleCertificate } from "@/lib/certificates/sample";

/**
 * The certificate designer for one design: the draft waiting for the owner's approval when there is one, else the
 * live design. `side` is one card side at page size (draw it with the card canvas, `withCertificateText(side,
 * sample.values)` and `sample.holder`); `design.widthMm`/`heightMm` equal `side.widthMm`/`side.heightMm`.
 */
export async function loadCertificateDesignerView({ params }: { params: Promise<{ orgSlug: string; designId: string }> }) {
  const { orgSlug, designId } = await params;
  const { organisation, membership } = await requireCertificatesAccess(orgSlug, "design");
  const ctx = await loadCertificateOrgContext(organisation.id);
  const row = ctx ? await prisma.certificateDesign.findFirst({ where: { id: designId, organisationId: organisation.id } }) : null;
  if (!ctx || !row) notFound();
  const context = { organisationName: ctx.organisation.name };
  const draft = readCertificateDraft(row, context);
  const side = withOwnCertificateArtwork(draft.design, organisation.id);
  const [issuedCount, brandKit] = await Promise.all([
    prisma.certificate.count({ where: { organisationId: organisation.id, designId: row.id } }),
    loadCardBrandKit(organisation.id, ctx.organisation.logoUrl),
  ]);

  return {
    org: { name: ctx.organisation.name, slug: ctx.organisation.slug, logoUrl: ctx.organisation.logoUrl, unitLevels: ctx.organisation.unitLevels },
    design: {
      id: row.id,
      name: row.name,
      typeLabel: draft.typeLabel,
      pageSize: draft.pageSize,
      orientation: draft.orientation,
      ...pageDimensions(draft.pageSize, draft.orientation),
      numberPrefix: draft.numberPrefix,
      numberFormat: draft.numberFormat,
      archived: row.archivedAt !== null,
      issuedCount,
    },
    side,
    branding: certificateBranding(ctx),
    sample: sampleCertificate({ organisationName: ctx.organisation.name, unitLevels: ctx.organisation.unitLevels, title: draft.typeLabel }),
    approval: {
      pending: certificateDraftDiffers(row, context),
      live: row.design !== null,
      hasDraft: row.draft !== null,
      draftUpdatedAt: row.draft ? row.draftUpdatedAt?.toISOString() ?? null : null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      canApprove: can(membership, "certificates.approve"),
      timeZone: ctx.organisation.timezone,
    },
    canEdit: can(membership, "certificates.design", { write: true }),
    placeholders: CERTIFICATE_PLACEHOLDERS,
    pageSizes: Object.entries(PAGE_SIZE_LABELS).map(([value, label]) => ({ value, label })),
    orientations: Object.entries(ORIENTATION_LABELS).map(([value, label]) => ({ value, label })),
    ...brandKit,
  };
}

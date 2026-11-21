import "server-only";

import { prisma } from "@/lib/db";
import { loadPreviewHolder, PREVIEW_ORG_SELECT } from "@/lib/cards/previewMember";
import type { TeamScope } from "@/lib/membership/scope";
import { certificateBranding, loadCertificateOrgContext } from "./data";
import { withOwnCertificateArtwork } from "./design";
import { readCertificateDraft } from "./draft";
import type { CertificateInput } from "./render";
import { sampleCertificate } from "./sample";

/*
 * The designer's download of a design as it stands (the saved draft, else the live design), read from the
 * database and never from the client, drawn with the fictional sample member or a real member inside the
 * viewer's reach (their name, number, plan and units; the QR is a dummy link, never their token).
 */

export async function loadDraftPreview(organisationId: string, designId: string, scope: TeamScope | null, memberId: string | null) {
  const [row, org, ctx] = await Promise.all([
    prisma.certificateDesign.findFirst({ where: { id: designId, organisationId } }),
    prisma.organisation.findUnique({ where: { id: organisationId }, select: PREVIEW_ORG_SELECT }),
    loadCertificateOrgContext(organisationId),
  ]);
  if (!row || !org || !ctx) return null;
  const draft = readCertificateDraft(row, { organisationName: ctx.organisation.name });
  const side = withOwnCertificateArtwork(draft.design, organisationId);
  const sample = sampleCertificate({ organisationName: ctx.organisation.name, unitLevels: ctx.organisation.unitLevels, title: draft.typeLabel });
  let input: CertificateInput = { side, branding: certificateBranding(ctx), ...sample };
  if (memberId && scope) {
    const holder = await loadPreviewHolder(org, scope, memberId, null);
    if (!holder) return null;
    input = {
      ...input,
      holder: { ...holder, idNumber: sample.values.certificateNumber, organisationName: ctx.organisation.name },
      values: { ...sample.values, memberName: holder.displayName, memberNumber: holder.idNumber ?? sample.values.memberNumber },
    };
  }
  return { row, ctx, input };
}

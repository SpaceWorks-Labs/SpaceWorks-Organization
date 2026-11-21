import "server-only";

import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { withOwnCertificateArtwork } from "./design";
import { readCertificateDraft } from "./draft";

type Tx = Prisma.TransactionClient;

/**
 * The owner approves a design's draft: it becomes the live design, page, type label and numbering that issued
 * certificates are drawn from, and the draft is cleared. The row is locked so two approvals (or an approval and
 * a save) can't interleave. Returns false when there is nothing to approve.
 */
export async function approveCertificateDraft(tx: Tx, args: { organisationId: string; designId: string; actorUserId: string; organisationName: string }) {
  const [locked] = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CertificateDesign" WHERE "id" = ${args.designId} AND "organisationId" = ${args.organisationId} FOR UPDATE`;
  if (!locked) return false;
  const current = await tx.certificateDesign.findUniqueOrThrow({ where: { id: locked.id } });
  if (!current.draft) return false;
  const draft = readCertificateDraft(current, { organisationName: args.organisationName });
  await tx.certificateDesign.update({
    where: { id: current.id },
    data: {
      design: withOwnCertificateArtwork(draft.design, args.organisationId) as unknown as Prisma.InputJsonValue,
      pageSize: draft.pageSize,
      orientation: draft.orientation,
      typeLabel: draft.typeLabel,
      numberPrefix: draft.numberPrefix,
      numberFormat: draft.numberFormat,
      draft: Prisma.DbNull,
      draftUpdatedAt: null,
      draftUpdatedById: null,
      approvedAt: new Date(),
      approvedById: args.actorUserId,
    },
  });
  await recordAuditEvent({ action: "CERTIFICATE_DESIGN_APPROVED", actorUserId: args.actorUserId, organisationId: args.organisationId, targetType: "CertificateDesign", targetId: current.id, client: tx });
  return true;
}

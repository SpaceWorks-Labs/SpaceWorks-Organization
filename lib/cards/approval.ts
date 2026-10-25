import "server-only";

import { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import type { CardDesignContext } from "./design/normalize";
import { withOwnArtwork } from "./design/presets";
import { readDraft } from "./draft";
import { managedImageUrl } from "./imageUrl";

type Tx = Prisma.TransactionClient;

/**
 * The owner approves a design's draft: it becomes the live design, numbering and watermark that every
 * member's card is drawn from, and the draft is cleared. The row is locked so two approvals (or an
 * approval and a save) can't interleave. Returns false when there is nothing to approve.
 */
export async function approveCardDraft(tx: Tx, args: { organisationId: string; rowId: string; actorUserId: string; context: CardDesignContext }) {
  const [row] = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CardDesign" WHERE "id" = ${args.rowId} AND "organisationId" = ${args.organisationId} FOR UPDATE`;
  if (!row) return false;
  const current = await tx.cardDesign.findUniqueOrThrow({ where: { id: row.id } });
  if (!current.draft) return false;
  const draft = readDraft(current, args.context);
  await tx.cardDesign.update({
    where: { id: current.id },
    data: {
      design: withOwnArtwork(draft.design, args.organisationId) as unknown as Prisma.InputJsonValue,
      numberPrefix: draft.numberPrefix,
      numberFormat: draft.numberFormat,
      watermarkUrl: managedImageUrl(draft.watermarkUrl, { kind: "organisation", organisationId: args.organisationId, category: "member-id-watermarks" }),
      draft: Prisma.DbNull,
      draftUpdatedAt: null,
      draftUpdatedById: null,
      approvedAt: new Date(),
      approvedById: args.actorUserId,
    },
  });
  await recordAuditEvent({ action: "CARD_DESIGN_APPROVED", actorUserId: args.actorUserId, organisationId: args.organisationId, targetType: "CardDesign", targetId: current.id, client: tx });
  return true;
}

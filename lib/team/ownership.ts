import "server-only";

import type { Prisma } from "@prisma/client";

/** How long an ownership offer stays open. */
export const TRANSFER_DAYS = 7;

/** An organisation's open transfer: neither accepted nor cancelled (it may have expired). */
export function openTransferWhere(organisationId: string): Prisma.OwnershipTransferWhereInput {
  return { organisationId, acceptedAt: null, cancelledAt: null };
}

/** Close offers that ran out, so the one-open-transfer index makes room for a new one. */
export async function closeExpiredTransfers(tx: Prisma.TransactionClient, organisationId: string, now = new Date()) {
  await tx.ownershipTransfer.updateMany({ where: { ...openTransferWhere(organisationId), expiresAt: { lte: now } }, data: { cancelledAt: now } });
}

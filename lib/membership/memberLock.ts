import "server-only";

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Lock a member row for the rest of the transaction and re-read it, so concurrent writers of
 * `fieldValues` (join, staff, portal, import) never lose each other's keys.
 */
export async function lockMember(tx: Tx, organisationId: string, memberId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Member" WHERE "id" = ${memberId} AND "organisationId" = ${organisationId} FOR UPDATE`;
  return rows.length ? tx.member.findUnique({ where: { id: memberId } }) : null;
}

/** The organisation's member with this email, locked, or null when there is none. */
export async function lockMemberByEmail(tx: Tx, organisationId: string, email: string) {
  const address = email.trim().toLowerCase();
  const found = await tx.member.findUnique({ where: { organisationId_email: { organisationId, email: address } }, select: { id: true } });
  const member = found ? await lockMember(tx, organisationId, found.id) : null;
  // The email may have changed while we waited for the lock.
  return member?.email === address ? member : null;
}

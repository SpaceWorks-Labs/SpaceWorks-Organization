import "server-only";

import type { Prisma } from "@prisma/client";
import { lockMemberByEmail } from "./memberLock";
import { nextCounter } from "./counter";

type Tx = Prisma.TransactionClient;

export type MemberInput = {
  email: string;
  name: string;
  phone?: string | null;
  stateCode?: string | null;
  unitId?: string | null;
  userId?: string | null;
  fieldValues?: Record<string, unknown>;
  /**
   * "merge" (default) adds `fieldValues` to the stored answers. "replace" stores `fieldValues` as the member's
   * whole answer object: the caller built it from the row it read with `lockMemberByEmail` in this transaction.
   */
  fieldValuesMode?: "merge" | "replace";
  source: "JOIN_FORM" | "MANUAL" | "IMPORT";
  isMinor?: boolean;
  guardianName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  /** Leave an existing member's unit as it is (a join form never moves anyone). */
  keepExistingUnit?: boolean;
};

/**
 * The organisation's record for this email, created on first sight with the next member number. The row is
 * locked first. Omitted (undefined) details keep their stored values; null clears them.
 */
export async function upsertMember(tx: Tx, organisationId: string, input: MemberInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await lockMemberByEmail(tx, organisationId, email);
  // Prisma leaves undefined columns untouched on update and at their defaults on create.
  const profile = {
    name: input.name.trim(),
    phone: input.phone,
    stateCode: input.stateCode,
    ...(input.unitId !== undefined && !(input.keepExistingUnit && existing?.unitId) ? { unitId: input.unitId } : {}),
    isMinor: input.isMinor,
    guardianName: input.guardianName,
    guardianEmail: input.guardianEmail,
    guardianPhone: input.guardianPhone,
  };
  if (existing) {
    const fieldValues = input.fieldValuesMode === "replace" ? input.fieldValues : input.fieldValues && { ...(existing.fieldValues as Record<string, unknown>), ...input.fieldValues };
    return tx.member.update({
      where: { id: existing.id },
      data: {
        ...profile,
        ...(input.userId && !existing.userId ? { userId: input.userId } : {}),
        ...(fieldValues ? { fieldValues: fieldValues as Prisma.InputJsonValue } : {}),
      },
    });
  }
  const memberNumber = await nextCounter(tx, organisationId, "member");
  return tx.member.create({
    data: { organisationId, email, memberNumber, source: input.source, userId: input.userId ?? null, fieldValues: (input.fieldValues ?? {}) as Prisma.InputJsonValue, ...profile },
  });
}

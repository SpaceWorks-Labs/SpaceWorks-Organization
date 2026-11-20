import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { issueCard } from "@/lib/cards/issue";
import { lockMember } from "./memberLock";

type Tx = Prisma.TransactionClient;
type Ref = { organisationId: string; memberId: string; planId: string };

const LIVE_TERM = ["UPCOMING", "ACTIVE", "GRACE"] as const;

/**
 * A membership was revoked, cancelled or withdrawn: end the member's live card for that plan (reason
 * MEMBERSHIP_ENDED, as when a new registration replaces a card), unless another term of the same plan still runs.
 * The card number is kept in the history, so reinstating brings the same number back.
 */
export async function endLiveCards(tx: Tx, args: Ref & { actorUserId: string | null }) {
  const stillRunning = await tx.membershipTerm.count({ where: { memberId: args.memberId, planId: args.planId, status: { in: [...LIVE_TERM] } } });
  if (stillRunning) return 0;
  if (!(await lockMember(tx, args.organisationId, args.memberId))) return 0;
  const live = await tx.memberCard.findMany({ where: { organisationId: args.organisationId, memberId: args.memberId, planId: args.planId, revokedAt: null }, select: { id: true } });
  for (const card of live) {
    const { count } = await tx.memberCard.updateMany({ where: { id: card.id, revokedAt: null }, data: { revokedAt: new Date(), revokedById: args.actorUserId, revokedReason: "MEMBERSHIP_ENDED" } });
    if (count) await recordAuditEvent({ action: "CARD_ENDED", actorUserId: args.actorUserId, organisationId: args.organisationId, targetType: "MemberCard", targetId: card.id, metadata: { memberId: args.memberId, planId: args.planId, reason: "MEMBERSHIP_ENDED" }, client: tx });
  }
  return live.length;
}

/** A reinstated membership gets its plan's card back, with the same number, when it had one that ended. */
export async function restoreCardOnReinstate(tx: Tx, args: Ref & { actorUserId: string }) {
  const { actorUserId, ...ref } = args;
  if (!(await tx.memberCard.count({ where: ref }))) return;
  await issueCard(tx, ref, actorUserId);
}

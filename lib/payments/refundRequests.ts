import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { queueChatAlerts } from "@/lib/chat/notify";
import { canTransition, statusAt } from "@/lib/membership/lifecycle";
import { decideTerm } from "@/lib/membership/service";
import { lockPayment, PaymentError, type OrgForPayments } from "./charges";
import { createRefund, refundableMinor } from "./refunds";
import { refundOffer, type RefundOffer, type RefundPolicyName } from "./refundPolicy";

type Tx = Prisma.TransactionClient;

/** The membership fee on a payment, tax included; joining and rejoining fees are never offered back. */
function membershipFeeMinor(lines: Array<{ kind: string; amountMinor: number }>) {
  return lines.filter((line) => line.kind === "TERM_FEE").reduce((sum, line) => sum + line.amountMinor, 0);
}

/** The paid payment a membership term was bought with (the latest, if there were several). */
async function paidPaymentForTerm(tx: Tx, organisationId: string, termId: string) {
  return tx.payment.findFirst({ where: { organisationId, termId, status: "PAID" }, orderBy: { paidAt: "desc" }, select: { id: true } });
}

/** What the policy offers on a payment right now, with the term it belongs to and any open request. */
async function refundOfferForPayment(tx: Tx, organisationId: string, paymentId: string, now = new Date()) {
  const [payment, settings] = await Promise.all([
    tx.payment.findFirst({ where: { id: paymentId, organisationId }, include: { lines: { select: { kind: true, amountMinor: true } }, term: true, refundRequests: { where: { status: "OPEN" }, select: { id: true } } } }),
    tx.orgPaymentSettings.findUnique({ where: { organisationId }, select: { refundPolicy: true, refundWindowDays: true, refundPolicyText: true } }),
  ]);
  if (!payment || payment.status !== "PAID" || !payment.term) return null;
  const policy = (settings?.refundPolicy ?? "NONE") as RefundPolicyName;
  const offer: RefundOffer = refundOffer({
    policy,
    windowDays: settings?.refundWindowDays ?? 14,
    paidAt: payment.paidAt ?? payment.createdAt,
    now,
    refundableMinor: await refundableMinor(tx, payment),
    membershipFeeMinor: membershipFeeMinor(payment.lines),
    startsAt: payment.term.startsAt,
    endsAt: payment.term.endsAt,
  });
  return { payment, term: payment.term, offer, policy, policyText: settings?.refundPolicyText ?? "", openRequestId: payment.refundRequests[0]?.id ?? null };
}

/** End a membership because its money went back: the member's own cancellation, so no "revoked" notice. */
async function endTermForRefund(tx: Tx, org: OrgForPayments, termId: string, actorUserId: string, now: Date) {
  const term = await tx.membershipTerm.findFirst({ where: { id: termId, organisationId: org.id } });
  if (!term || !canTransition("withdraw", statusAt(term, now))) return false;
  await decideTerm(tx, { org, termId, action: "withdraw", actorUserId, reason: "Cancelled with a refund", now });
  return true;
}

/** A member asks for their money back on a live membership, which also asks to end it. */
export async function requestRefund(tx: Tx, args: { org: OrgForPayments; memberId: string; termId: string; reason: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const term = await tx.membershipTerm.findFirst({ where: { id: args.termId, organisationId: args.org.id, memberId: args.memberId } });
  if (!term || !canTransition("withdraw", statusAt(term, now))) throw new PaymentError("This membership can't be cancelled any more.");
  const paid = await paidPaymentForTerm(tx, args.org.id, term.id);
  if (!paid) throw new PaymentError("There's no payment on this membership to refund.");
  await lockPayment(tx, args.org.id, paid.id);
  const found = await refundOfferForPayment(tx, args.org.id, paid.id, now);
  if (!found || !found.offer.eligible) throw new PaymentError("This membership isn't eligible for a refund under the organisation's policy.");
  if (found.openRequestId) throw new PaymentError("You've already asked for a refund on this membership.");
  const request = await tx.refundRequest.create({
    data: { organisationId: args.org.id, paymentId: paid.id, termId: term.id, memberId: args.memberId, requestedByUserId: args.userId, reason: args.reason.trim().slice(0, 500), suggestedMinor: found.offer.amountMinor, currency: found.payment.currency },
  });
  await recordAuditEvent({ action: "REFUND_REQUESTED", actorUserId: args.userId, organisationId: args.org.id, targetType: "RefundRequest", targetId: request.id, metadata: { paymentId: paid.id, suggestedMinor: request.suggestedMinor }, client: tx });
  await enqueueOutbox(tx, "refund-notice", { requestId: request.id, organisationId: args.org.id, event: "requested" });
  await queueChatAlerts(tx, args.org.id, "refund-requested", { requestId: request.id });
  return request;
}

async function lockOpenRequest(tx: Tx, organisationId: string, requestId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "RefundRequest" WHERE "id" = ${requestId} AND "organisationId" = ${organisationId} FOR UPDATE`;
  if (rows.length === 0) throw new PaymentError("Refund request not found.");
  const request = await tx.refundRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "OPEN") throw new PaymentError("This request was already dealt with. Reload to see what happened.");
  return request;
}

/** The member calls their request off; the membership carries on. */
export async function withdrawRefundRequest(tx: Tx, args: { org: OrgForPayments; memberId: string; requestId: string; userId: string; now?: Date }) {
  const request = await lockOpenRequest(tx, args.org.id, args.requestId);
  if (request.memberId !== args.memberId) throw new PaymentError("Refund request not found.");
  const done = await tx.refundRequest.update({ where: { id: request.id }, data: { status: "WITHDRAWN", decidedAt: args.now ?? new Date(), decidedById: args.userId } });
  await recordAuditEvent({ action: "REFUND_REQUEST_WITHDRAWN", actorUserId: args.userId, organisationId: args.org.id, targetType: "RefundRequest", targetId: request.id, client: tx });
  return done;
}

/** A manager declines: no money moves and the membership carries on. The member is told why. */
export async function declineRefundRequest(tx: Tx, args: { org: OrgForPayments; requestId: string; note: string; actorUserId: string; now?: Date }) {
  const request = await lockOpenRequest(tx, args.org.id, args.requestId);
  const done = await tx.refundRequest.update({ where: { id: request.id }, data: { status: "DECLINED", decidedAt: args.now ?? new Date(), decidedById: args.actorUserId, decisionNote: args.note.trim().slice(0, 500) } });
  await recordAuditEvent({ action: "REFUND_REQUEST_DECLINED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "RefundRequest", targetId: request.id, client: tx });
  await enqueueOutbox(tx, "refund-notice", { requestId: request.id, organisationId: args.org.id, event: "declined" });
  return done;
}

/**
 * A manager approves: the refund is opened (offline refunds are processed at once; gateway refunds are sent
 * after this commits) and, unless they untick it, the membership ends. The member is told.
 */
export async function approveRefundRequest(tx: Tx, args: { org: OrgForPayments; requestId: string; amountMinor: number; endMembership: boolean; note?: string | null; actorUserId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const request = await lockOpenRequest(tx, args.org.id, args.requestId);
  const created = await createRefund(tx, { org: args.org, paymentId: request.paymentId, amountMinor: args.amountMinor, reason: `Refund request: ${request.reason}`.slice(0, 300), actorUserId: args.actorUserId, now });
  await tx.refundRequest.update({ where: { id: request.id }, data: { status: "APPROVED", decidedAt: now, decidedById: args.actorUserId, decisionNote: args.note?.trim().slice(0, 500) || null, refundId: created.refund.id } });
  const ended = args.endMembership ? await endTermForRefund(tx, args.org, request.termId, args.actorUserId, now) : false;
  await recordAuditEvent({ action: "REFUND_REQUEST_APPROVED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "RefundRequest", targetId: request.id, metadata: { refundId: created.refund.id, amountMinor: args.amountMinor, endedMembership: ended }, client: tx });
  await enqueueOutbox(tx, "refund-notice", { requestId: request.id, organisationId: args.org.id, event: "approved" });
  return { created, ended };
}

/**
 * A manager refunds straight from the payment page. An open request on that payment is closed by it, and the
 * membership ends when they ask for that.
 */
export async function afterDirectRefund(tx: Tx, args: { org: OrgForPayments; paymentId: string; termId: string | null; refundId: string; endMembership: boolean; actorUserId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const open = await tx.refundRequest.findFirst({ where: { organisationId: args.org.id, paymentId: args.paymentId, status: "OPEN" }, select: { id: true } });
  if (open) {
    await tx.refundRequest.update({ where: { id: open.id }, data: { status: "APPROVED", decidedAt: now, decidedById: args.actorUserId, decisionNote: "Refunded from the payment page.", refundId: args.refundId } });
    await enqueueOutbox(tx, "refund-notice", { requestId: open.id, organisationId: args.org.id, event: "approved" });
  }
  return args.endMembership && args.termId ? endTermForRefund(tx, args.org, args.termId, args.actorUserId, now) : false;
}

type MemberRefundState = {
  termId: string;
  policyText: string;
  currency: string;
  offer: { eligible: true; amountMinor: number; deadline: Date } | { eligible: false; reason: string; deadline: Date | null };
  open: { id: string; suggestedMinor: number; createdAt: Date } | null;
  last: { status: "APPROVED" | "DECLINED" | "WITHDRAWN"; decisionNote: string | null; decidedAt: Date | null; refundedMinor: number | null } | null;
};

/**
 * For the member's portal: the live paid term on a plan (newest first), what the policy offers on it, and
 * the open or last refund request. Null when nothing on the plan was paid for and is still running.
 */
export async function memberRefundState(tx: Tx, organisationId: string, memberId: string, terms: Array<{ id: string; status: Parameters<typeof statusAt>[0]["status"]; startsAt: Date | null; endsAt: Date | null; graceUntil: Date | null; createdAt: Date }>, now = new Date()): Promise<MemberRefundState | null> {
  const live = [...terms].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).filter((term) => ["UPCOMING", "ACTIVE", "GRACE"].includes(statusAt(term, now)));
  for (const term of live) {
    const paid = await paidPaymentForTerm(tx, organisationId, term.id);
    if (!paid) continue;
    const found = await refundOfferForPayment(tx, organisationId, paid.id, now);
    if (!found) continue;
    const requests = await tx.refundRequest.findMany({ where: { organisationId, memberId, termId: term.id }, orderBy: { createdAt: "desc" }, take: 2, include: { refund: { select: { amountMinor: true } } } });
    const open = requests.find((request) => request.status === "OPEN") ?? null;
    const last = requests.find((request) => request.status !== "OPEN") ?? null;
    return {
      termId: term.id,
      policyText: found.policyText,
      currency: found.payment.currency,
      offer: found.offer,
      open: open ? { id: open.id, suggestedMinor: open.suggestedMinor, createdAt: open.createdAt } : null,
      last: last ? { status: last.status as "APPROVED" | "DECLINED" | "WITHDRAWN", decisionNote: last.decisionNote, decidedAt: last.decidedAt, refundedMinor: last.refund?.amountMinor ?? null } : null,
    };
  }
  return null;
}

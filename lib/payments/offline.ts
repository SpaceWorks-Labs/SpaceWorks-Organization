import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { queueChatAlerts } from "@/lib/chat/notify";
import { markTermPaid } from "@/lib/membership/service";
import { canTransition, statusAt } from "@/lib/membership/lifecycle";
import { createTermPayment, lockPayment, lockTermForPayment, PaymentError, payable, type OrgForPayments } from "./charges";
import { settlePayment } from "./settle";
import { termTotalMinor } from "./tax";
import type { OfflineMethod } from "./offline-methods";

export { type OfflineMethod } from "./offline-methods";

type Tx = Prisma.TransactionClient;

/**
 * A manager records money received outside the gateway. With maker-checker on, it waits for a different
 * owner, manager or treasurer to confirm; otherwise it is paid and receipted straight away.
 */
export async function recordOfflinePayment(tx: Tx, args: { org: OrgForPayments; termId: string; method: OfflineMethod; utr?: string | null; reference?: string | null; note?: string; actorUserId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const payment = await createTermPayment(tx, {
    org: args.org,
    termId: args.termId,
    provider: "OFFLINE",
    status: "AWAITING_CONFIRMATION",
    method: args.method,
    utr: args.utr ?? null,
    reference: args.reference ?? null,
    note: args.note ?? "",
    recordedById: args.actorUserId,
    now,
  });
  await recordAuditEvent({ action: "PAYMENT_RECORDED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "Payment", targetId: payment.id, metadata: { method: args.method }, client: tx });
  if (args.org.offlineConfirmationRequired) {
    await queueChatAlerts(tx, args.org.id, "payment-to-confirm", { paymentId: payment.id });
    return { payment, settled: false };
  }
  const { payment: settled } = await settlePayment(tx, { org: args.org, paymentId: payment.id, confirmedById: args.actorUserId, now });
  return { payment: settled, settled: true };
}

/** A member says they've paid by UPI or bank transfer. The reference must be new to this organisation. */
export async function claimOfflinePayment(tx: Tx, args: { org: OrgForPayments; termId: string; method: "upi" | "bank_transfer"; utr: string; userId: string | null; now?: Date }) {
  const utr = args.utr.trim().toUpperCase();
  const clash = await tx.payment.findFirst({ where: { organisationId: args.org.id, provider: "OFFLINE", utr, status: { notIn: ["CANCELLED", "FAILED"] } }, select: { id: true } });
  if (clash) throw new PaymentError("That reference has already been submitted.");
  const payment = await createTermPayment(tx, { org: args.org, termId: args.termId, provider: "OFFLINE", status: "AWAITING_CONFIRMATION", method: args.method, utr, recordedById: args.userId, memberClaim: true, note: "Submitted by the member.", now: args.now });
  await enqueueOutbox(tx, "payment-notice", { organisationId: args.org.id, paymentId: payment.id, notice: "claim-received" });
  await queueChatAlerts(tx, args.org.id, "payment-to-confirm", { paymentId: payment.id });
  return payment;
}

/** Confirm an offline payment waiting in the queue. The confirmer may not be the person who recorded it. */
export async function confirmOfflinePayment(tx: Tx, args: { org: OrgForPayments; paymentId: string; actorUserId: string; now?: Date }) {
  const payment = await lockPayment(tx, args.org.id, args.paymentId);
  if (payment.provider !== "OFFLINE" || payment.status !== "AWAITING_CONFIRMATION") throw new PaymentError("This payment isn't waiting for confirmation.");
  if (args.org.offlineConfirmationRequired && payment.recordedById === args.actorUserId) throw new PaymentError("Someone else on the team needs to confirm a payment you recorded.");
  const result = await settlePayment(tx, { org: args.org, paymentId: payment.id, confirmedById: args.actorUserId, now: args.now });
  await recordAuditEvent({ action: "PAYMENT_CONFIRMED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "Payment", targetId: payment.id, client: tx });
  return result.payment;
}

/**
 * Turn down an offline payment or a member's claim. Only a member's own claim emails them, so they can submit
 * a corrected reference; a payment the team recorded is just closed.
 */
export async function rejectOfflinePayment(tx: Tx, args: { org: OrgForPayments; paymentId: string; actorUserId: string; reason: string }) {
  const payment = await lockPayment(tx, args.org.id, args.paymentId);
  if (payment.provider !== "OFFLINE" || payment.status !== "AWAITING_CONFIRMATION") throw new PaymentError("This payment isn't waiting for confirmation.");
  const updated = await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED", note: args.reason.slice(0, 300) } });
  if (payment.memberClaim) await enqueueOutbox(tx, "payment-notice", { organisationId: args.org.id, paymentId: payment.id, notice: "claim-rejected" });
  await recordAuditEvent({ action: "PAYMENT_REJECTED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "Payment", targetId: payment.id, client: tx });
  return updated;
}

/** Cancel an open payment (never a settled one). */
export async function cancelPayment(tx: Tx, args: { org: OrgForPayments; paymentId: string; actorUserId: string | null; reason?: string }) {
  const payment = await lockPayment(tx, args.org.id, args.paymentId);
  if (payment.status !== "PENDING" && payment.status !== "AWAITING_CONFIRMATION") throw new PaymentError("Only an open payment can be cancelled.");
  const updated = await tx.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED", note: (args.reason ?? "Cancelled.").slice(0, 300) } });
  await recordAuditEvent({ action: "PAYMENT_CANCELLED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "Payment", targetId: payment.id, client: tx });
  return updated;
}

/**
 * Waive what a member owes: the membership starts (or continues) with nothing collected. A waived payment
 * records the amount forgiven and has no tax document, since nothing was received.
 */
export async function waiveTermFee(tx: Tx, args: { org: OrgForPayments; termId: string; actorUserId: string; reason: string; now?: Date }) {
  const now = args.now ?? new Date();
  const term = await lockTermForPayment(tx, args.org.id, args.termId);
  if (!payable(term, now)) throw new PaymentError("Nothing is due on this membership.");
  const open = term.payments.filter((payment) => payment.status === "PENDING" || payment.status === "AWAITING_CONFIRMATION");
  if (open.length) await tx.payment.updateMany({ where: { id: { in: open.map((payment) => payment.id) } }, data: { status: "CANCELLED", note: "Closed: the fee was waived." } });
  // The forgiven amount is what the member would have paid, tax included.
  const forgiven = termTotalMinor(term, await tx.orgTaxSettings.findUnique({ where: { organisationId: args.org.id } }), term.currency, term.member.stateCode);
  const payment = await tx.payment.create({
    data: {
      organisationId: args.org.id,
      memberId: term.memberId,
      termId: term.id,
      status: "WAIVED",
      provider: "OFFLINE",
      method: "waiver",
      currency: term.currency,
      amountMinor: forgiven,
      paidAt: now,
      note: args.reason.slice(0, 300),
      recordedById: args.actorUserId,
      confirmedById: args.actorUserId,
      taxSnapshot: {},
    },
  });
  if (canTransition("markPaid", statusAt(term, now))) await markTermPaid(tx, { org: args.org, termId: term.id, actorUserId: args.actorUserId, now });
  await recordAuditEvent({ action: "PAYMENT_WAIVED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "Payment", targetId: payment.id, metadata: { amountMinor: payment.amountMinor, currency: payment.currency }, client: tx });
  return payment;
}

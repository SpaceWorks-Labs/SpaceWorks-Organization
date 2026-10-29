import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { queueChatAlerts } from "@/lib/chat/notify";
import { canTransition, statusAt } from "@/lib/membership/lifecycle";
import { markTermPaid, MembershipError } from "@/lib/membership/service";
import { lockPayment, PaymentError, type OrgForPayments } from "./charges";
import { issuePaymentDocument } from "./documents";

type Tx = Prisma.TransactionClient;

type Capture = { gatewayPaymentId: string | null; amountMinor: number; currency: string; method: string | null };

async function documentPrefix(tx: Tx, organisationId: string) {
  const settings = await tx.orgTaxSettings.findUnique({ where: { organisationId }, select: { receiptPrefix: true } });
  return settings?.receiptPrefix ?? "";
}

/**
 * Money arrived for a payment: mark it PAID, start the membership and issue the document, all in the
 * caller's transaction. Business-rule surprises (late, duplicate, mismatched, suspended organisation)
 * never refuse the money: the payment is still PAID and receipted, and flagged for a manager. A mismatched
 * amount holds the document until a manager decides. Idempotent: a PAID payment is returned unchanged.
 */
export async function settlePayment(tx: Tx, args: { org: OrgForPayments; paymentId: string; capture?: Capture; confirmedById?: string | null; now?: Date }) {
  const now = args.now ?? new Date();
  // Lock order everywhere: the term's payments (by id), then the term, then the document counter. Taking the
  // term lock before reading anything also serialises concurrent settlements of the same membership.
  const link = await tx.payment.findFirst({ where: { id: args.paymentId, organisationId: args.org.id }, select: { termId: true } });
  if (!link) throw new PaymentError("Payment not found.");
  if (link.termId) {
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "organisationId" = ${args.org.id} AND ("id" = ${args.paymentId} OR ("termId" = ${link.termId} AND "status" IN ('PENDING', 'AWAITING_CONFIRMATION'))) ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "MembershipTerm" WHERE "id" = ${link.termId} AND "organisationId" = ${args.org.id} FOR UPDATE`;
  }
  const payment = await lockPayment(tx, args.org.id, args.paymentId);
  if (payment.status === "PAID" || payment.status === "WAIVED") return { payment, flagged: payment.flagReason, alreadySettled: true };

  const flags: string[] = [];
  const capture = args.capture;
  const mismatch = Boolean(capture && (capture.amountMinor !== payment.amountMinor || capture.currency.toUpperCase() !== payment.currency));
  if (mismatch) flags.push("The amount received differs from the amount due.");
  if (payment.status === "CANCELLED" || payment.status === "FAILED") flags.push("Paid after this attempt was closed.");
  if (args.org.status !== "ACTIVE") flags.push("Paid while the organisation was not active.");

  if (payment.termId) {
    const alreadyPaid = await tx.payment.count({ where: { termId: payment.termId, status: { in: ["PAID", "WAIVED"] }, id: { not: payment.id } } });
    if (alreadyPaid > 0) {
      flags.push("This membership was already paid. Consider a refund.");
    } else {
      const term = await tx.membershipTerm.findUniqueOrThrow({ where: { id: payment.termId }, include: { plan: { select: { archivedAt: true, paymentTiming: true } } } });
      if (term.plan.archivedAt) flags.push("The plan was archived when this was paid.");
      const before = statusAt(term, now);
      if (canTransition("markPaid", before)) {
        try {
          await markTermPaid(tx, { org: args.org, termId: term.id, actorUserId: args.confirmedById ?? null, now });
        } catch (error) {
          // E.g. a fixed-end plan that ended before the money arrived. The money is still receipted.
          if (!(error instanceof MembershipError)) throw error;
          flags.push(`The membership couldn't start: ${error.message} Reinstate it or refund.`);
        }
      } else if (!(term.plan.paymentTiming === "ACTIVATE_THEN_CHARGE" && ["UPCOMING", "ACTIVE", "GRACE", "ENDED", "LAPSED"].includes(before))) {
        flags.push(`The membership was ${before.toLowerCase().replace("_", " ")} when this was paid. Reinstate it or refund.`);
      }
      // Any other open gateway attempt for this term is now moot.
      await tx.payment.updateMany({ where: { termId: term.id, status: "PENDING", id: { not: payment.id } }, data: { status: "CANCELLED", note: "Closed: the membership was paid another way." } });
    }
  }

  const updated = await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      paidAt: now,
      gatewayPaymentId: capture?.gatewayPaymentId ?? payment.gatewayPaymentId,
      method: capture?.method ?? payment.method,
      capturedMinor: mismatch ? capture!.amountMinor : null,
      confirmedById: args.confirmedById ?? null,
      flaggedAt: flags.length ? now : null,
      flagReason: flags.length ? flags.join(" ") : null,
      documentHeld: mismatch,
    },
  });
  if (!mismatch) await issuePaymentDocument(tx, args.org, payment.id, await documentPrefix(tx, args.org.id), now);
  await enqueueOutbox(tx, "payment-notice", { organisationId: args.org.id, paymentId: payment.id, notice: "paid" });
  await queueChatAlerts(tx, args.org.id, "payment", { paymentId: payment.id });
  await recordAuditEvent({ action: "PAYMENT_PAID", actorUserId: args.confirmedById ?? null, organisationId: args.org.id, targetType: "Payment", targetId: payment.id, metadata: { provider: payment.provider, flagged: flags.length > 0 }, client: tx });
  return { payment: updated, flagged: updated.flagReason, alreadySettled: false };
}

/** After reviewing a mismatched capture, issue the held document on the amount actually received. */
export async function releaseHeldDocument(tx: Tx, args: { org: OrgForPayments; paymentId: string; actorUserId: string; now?: Date }) {
  const payment = await lockPayment(tx, args.org.id, args.paymentId);
  if (payment.status !== "PAID" || !payment.documentHeld) throw new Error("This payment has no held document.");
  const document = await issuePaymentDocument(tx, args.org, payment.id, await documentPrefix(tx, args.org.id), args.now, payment.capturedMinor ?? payment.amountMinor);
  await tx.payment.update({ where: { id: payment.id }, data: { documentHeld: false } });
  await recordAuditEvent({ action: "PAYMENT_DOCUMENT_RELEASED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "Payment", targetId: payment.id, client: tx });
  return document;
}

/** Clear a payment's review flag once a manager has dealt with it. */
export async function clearPaymentFlag(tx: Tx, args: { org: OrgForPayments; paymentId: string; actorUserId: string }) {
  const payment = await lockPayment(tx, args.org.id, args.paymentId);
  if (!payment.flaggedAt || payment.documentHeld) throw new Error("Nothing to clear on this payment.");
  await tx.payment.update({ where: { id: payment.id }, data: { flaggedAt: null } });
  await recordAuditEvent({ action: "PAYMENT_FLAG_CLEARED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "Payment", targetId: payment.id, metadata: { reason: payment.flagReason }, client: tx });
}

/** A gateway attempt failed or expired. Only an open attempt moves; anything settled stays as it is. */
export async function failPayment(tx: Tx, args: { org: OrgForPayments; paymentId: string; reason: string }) {
  const payment = await lockPayment(tx, args.org.id, args.paymentId);
  if (payment.status !== "PENDING") return payment;
  return tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED", note: args.reason.slice(0, 300) } });
}

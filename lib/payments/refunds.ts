import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { lockPayment, PaymentError, type OrgForPayments } from "./charges";
import { issueCreditNote } from "./documents";

type Tx = Prisma.TransactionClient;

/** What can still be refunded: the amount received less refunds that are pending or processed. */
export async function refundableMinor(tx: Tx, payment: { id: string; amountMinor: number; capturedMinor: number | null }) {
  const refunded = await tx.refund.aggregate({ where: { paymentId: payment.id, status: { in: ["PENDING", "PROCESSED"] } }, _sum: { amountMinor: true } });
  return (payment.capturedMinor ?? payment.amountMinor) - (refunded._sum.amountMinor ?? 0);
}

/**
 * Open a refund. Offline refunds are money already handed back, so they are processed (with a credit note)
 * at once. Gateway refunds stay PENDING until the provider confirms; the caller sends them to the gateway
 * after this transaction commits.
 */
export async function createRefund(tx: Tx, args: { org: OrgForPayments; paymentId: string; amountMinor: number; reason: string; actorUserId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const payment = await lockPayment(tx, args.org.id, args.paymentId);
  if (payment.status !== "PAID") throw new PaymentError("Only a paid payment can be refunded.");
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) throw new PaymentError("Enter an amount to refund.");
  if (args.amountMinor > (await refundableMinor(tx, payment))) throw new PaymentError("That's more than is left to refund on this payment.");
  const refund = await tx.refund.create({
    data: { organisationId: args.org.id, paymentId: payment.id, currency: payment.currency, amountMinor: args.amountMinor, reason: args.reason.slice(0, 300), createdById: args.actorUserId },
  });
  await recordAuditEvent({ action: "REFUND_CREATED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "Refund", targetId: refund.id, metadata: { amountMinor: refund.amountMinor, currency: refund.currency, provider: payment.provider, memberId: payment.memberId, paymentId: payment.id }, client: tx });
  if (payment.provider === "OFFLINE") return { refund: await processRefund(tx, { org: args.org, refundId: refund.id, now }), gateway: null };
  return { refund, gateway: { provider: payment.provider, gatewayPaymentId: payment.gatewayPaymentId } };
}

async function lockRefund(tx: Tx, organisationId: string, refundId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Refund" WHERE "id" = ${refundId} AND "organisationId" = ${organisationId} FOR UPDATE`;
  if (rows.length === 0) throw new PaymentError("Refund not found.");
  return tx.refund.findUniqueOrThrow({ where: { id: refundId } });
}

/** The money went back: mark the refund processed and issue its credit note. Idempotent. */
export async function processRefund(tx: Tx, args: { org: OrgForPayments; refundId: string; gatewayRefundId?: string | null; now?: Date }) {
  const now = args.now ?? new Date();
  const refund = await lockRefund(tx, args.org.id, args.refundId);
  if (refund.status === "PROCESSED") return refund;
  if (refund.status === "FAILED") throw new PaymentError("This refund failed and can't be processed.");
  const updated = await tx.refund.update({ where: { id: refund.id }, data: { status: "PROCESSED", processedAt: now, gatewayRefundId: args.gatewayRefundId ?? refund.gatewayRefundId } });
  const settings = await tx.orgTaxSettings.findUnique({ where: { organisationId: args.org.id }, select: { receiptPrefix: true } });
  await issueCreditNote(tx, args.org, refund.id, settings?.receiptPrefix ?? "", now);
  await enqueueOutbox(tx, "payment-notice", { organisationId: args.org.id, paymentId: refund.paymentId, notice: "refunded" });
  return updated;
}

/** The gateway refused or reversed the refund. */
export async function failRefund(tx: Tx, args: { org: OrgForPayments; refundId: string; reason: string }) {
  const refund = await lockRefund(tx, args.org.id, args.refundId);
  if (refund.status !== "PENDING") return refund;
  return tx.refund.update({ where: { id: refund.id }, data: { status: "FAILED", failureReason: args.reason.slice(0, 300) } });
}

/** Store the gateway's id for a refund once the API call returns (webhooks may already have arrived). */
export async function attachGatewayRefund(tx: Tx, args: { org: OrgForPayments; refundId: string; gatewayRefundId: string }) {
  const refund = await lockRefund(tx, args.org.id, args.refundId);
  if (refund.gatewayRefundId || refund.status !== "PENDING") return refund;
  return tx.refund.update({ where: { id: refund.id }, data: { gatewayRefundId: args.gatewayRefundId } });
}

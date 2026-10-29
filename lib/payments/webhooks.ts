import "server-only";

import type { PaymentProvider, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ORG_FOR_PAYMENTS, type OrgForPayments } from "./charges";
import { credentialsOf, GATEWAYS } from "./config";
import type { GatewayEvent } from "./gateway";
import { failRefund, processRefund } from "./refunds";
import { failPayment, settlePayment } from "./settle";

type Tx = Prisma.TransactionClient;
type WebhookOutcome = { status: number; body: string };

async function findPayment(tx: Tx, organisationId: string, provider: PaymentProvider, paymentId: string | null, orderId: string | null) {
  if (paymentId) {
    const byId = await tx.payment.findFirst({ where: { id: paymentId, organisationId, provider }, select: { id: true } });
    if (byId) return byId;
  }
  if (orderId) return tx.payment.findFirst({ where: { organisationId, provider, gatewayOrderId: orderId }, select: { id: true } });
  return null;
}

async function findRefund(tx: Tx, organisationId: string, refundId: string | null, gatewayRefundId: string) {
  if (refundId) {
    const byId = await tx.refund.findFirst({ where: { id: refundId, organisationId }, select: { id: true, status: true } });
    if (byId) return byId;
  }
  return gatewayRefundId ? tx.refund.findFirst({ where: { organisationId, gatewayRefundId }, select: { id: true, status: true } }) : null;
}

async function unmatched(tx: Tx, org: OrgForPayments, provider: PaymentProvider, event: GatewayEvent) {
  await recordAuditEvent({ action: "PAYMENT_WEBHOOK_UNMATCHED", actorUserId: null, organisationId: org.id, targetType: "Webhook", targetId: event.eventId.slice(0, 120), metadata: { provider, type: event.type }, client: tx });
}

async function apply(tx: Tx, org: OrgForPayments, provider: PaymentProvider, event: GatewayEvent) {
  switch (event.type) {
    case "captured": {
      const payment = await findPayment(tx, org.id, provider, event.paymentId, event.orderId);
      if (!payment) return unmatched(tx, org, provider, event);
      await settlePayment(tx, { org, paymentId: payment.id, capture: { gatewayPaymentId: event.gatewayPaymentId, amountMinor: event.amountMinor, currency: event.currency, method: event.method } });
      return;
    }
    case "failed": {
      const payment = await findPayment(tx, org.id, provider, event.paymentId, event.orderId);
      if (payment) await failPayment(tx, { org, paymentId: payment.id, reason: event.reason });
      return;
    }
    case "refund-processed": {
      const refund = await findRefund(tx, org.id, event.refundId, event.gatewayRefundId);
      // A refund we closed as failed that the provider later completed: record it for a manager, never 5xx.
      if (!refund || refund.status === "FAILED") return unmatched(tx, org, provider, event);
      await processRefund(tx, { org, refundId: refund.id, gatewayRefundId: event.gatewayRefundId });
      return;
    }
    case "refund-failed": {
      const refund = await findRefund(tx, org.id, event.refundId, event.gatewayRefundId);
      if (refund) await failRefund(tx, { org, refundId: refund.id, reason: event.reason });
      return;
    }
    case "ignored":
      return;
  }
}

/**
 * Verify and apply one gateway webhook. Business outcomes always answer 200 (a late or mismatched payment
 * is recorded and flagged, never refused), unknown events are acknowledged, and only infrastructure errors
 * escape as exceptions so the route answers 5xx and the provider retries. Each event applies once.
 */
export async function handleWebhook(provider: Exclude<PaymentProvider, "OFFLINE">, code: string, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return { status: 404, body: "Not found" };
  const settings = await prisma.orgPaymentSettings.findUnique({ where: { webhookPublicCode: code } });
  if (!settings || settings.provider !== provider) return { status: 404, body: "Not found" };
  const credentials = credentialsOf(settings);
  const gateway = GATEWAYS[provider];
  if (!credentials || !gateway.verifyWebhook(credentials, rawBody, headers)) return { status: 401, body: "Invalid signature" };

  let event: GatewayEvent;
  try {
    event = gateway.parseEvent(rawBody, headers);
  } catch {
    return { status: 400, body: "Invalid payload" };
  }
  if (event.type === "ignored" || !event.eventId) return { status: 200, body: "Ignored" };

  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: settings.organisationId }, select: ORG_FOR_PAYMENTS });
  const applied = await prisma.$transaction(async (tx) => {
    const fresh = await tx.processedWebhookEvent.createMany({ data: [{ provider, eventId: event.eventId.slice(0, 200), organisationId: org.id }], skipDuplicates: true });
    if (fresh.count === 0) return false;
    await apply(tx, org, provider, event);
    return true;
  });
  return { status: 200, body: applied ? "OK" : "Duplicate" };
}

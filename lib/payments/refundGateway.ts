import "server-only";

import { prisma } from "@/lib/db";
import { loadGateway } from "./config";
import { GatewayError } from "./gateway";
import type { OrgForPayments } from "./charges";
import { attachGatewayRefund, failRefund, processRefund, type createRefund } from "./refunds";

type RefundOutcome = { ok: true; status: "PENDING" | "PROCESSED" | "FAILED" } | { ok: false; error: string };

/**
 * Send a refund that has just been committed to its payment provider. Offline refunds are already processed.
 * Only the provider's answer decides "refused"; once it has answered, our own bookkeeping never marks the
 * refund failed, because the money may already be on its way back (the webhook or the scheduler settles it).
 */
export async function sendRefundToGateway(org: OrgForPayments, created: Awaited<ReturnType<typeof createRefund>>): Promise<RefundOutcome> {
  if (!created.gateway) return { ok: true, status: "PROCESSED" };
  const refundId = created.refund.id;
  const live = await loadGateway(org.id);
  if (!live || live.provider !== created.gateway.provider || !created.gateway.gatewayPaymentId) {
    await prisma.$transaction((tx) => failRefund(tx, { org, refundId, reason: "The original gateway isn't connected any more." }));
    return { ok: false, error: "The gateway this was paid through isn't connected any more. Refund it from the provider's dashboard, then record it." };
  }
  let result: Awaited<ReturnType<typeof live.gateway.refund>>;
  try {
    result = await live.gateway.refund(live.credentials, { gatewayPaymentId: created.gateway.gatewayPaymentId, amountMinor: created.refund.amountMinor, currency: created.refund.currency, refundId });
  } catch (error) {
    // A timeout or outage may still have refunded: keep it pending for the webhook or the scheduler.
    if (error instanceof GatewayError && error.retryable) return { ok: true, status: "PENDING" };
    await prisma.$transaction((tx) => failRefund(tx, { org, refundId, reason: "The provider refused the refund." }));
    return { ok: false, error: "The payment provider refused the refund. Nothing was refunded." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      if (result.gatewayRefundId) await attachGatewayRefund(tx, { org, refundId, gatewayRefundId: result.gatewayRefundId });
      if (result.status === "processed") await processRefund(tx, { org, refundId, gatewayRefundId: result.gatewayRefundId || null });
      if (result.status === "failed") await failRefund(tx, { org, refundId, reason: "The provider declined the refund." });
    });
  } catch {
    // The provider has the refund; it stays PENDING and the webhook or the scheduler completes it.
    console.error("[refunds] recording a gateway refund failed; left pending");
    return { ok: true, status: "PENDING" };
  }
  return { ok: true, status: result.status === "processed" ? "PROCESSED" : result.status === "failed" ? "FAILED" : "PENDING" };
}

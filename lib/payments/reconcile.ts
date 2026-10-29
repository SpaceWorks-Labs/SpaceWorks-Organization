import "server-only";

import { prisma } from "@/lib/db";
import { refreshGatewayPayment } from "./checkout";

const MINUTE = 60_000;
/** Give webhooks a head start before polling, and keep asking for a week (late captures still settle). */
const POLL_AFTER_MS = 5 * MINUTE;
export const POLL_FOR_MS = 7 * 24 * 60 * MINUTE;
const RUN_EVERY_MS = 5 * MINUTE;
const BATCH = 50;

function state() {
  return globalThis as typeof globalThis & { __sworgReconcileAt?: number };
}

async function closeIfStale(payment: { id: string; createdAt: Date }, now: Date) {
  if (now.getTime() - payment.createdAt.getTime() <= POLL_FOR_MS) return;
  await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", note: "Closed: no payment arrived within a week." } });
}

/**
 * Poll open gateway attempts so a missed webhook never leaves a paid member waiting. Each run takes the
 * attempts checked longest ago (`updatedAt` is touched on every check), so abandoned checkouts cannot starve
 * newer ones. Settling is idempotent, so overlapping runs on several replicas are harmless. Attempts still
 * open after a week are closed as FAILED, even when the provider can't be reached; a capture that arrives
 * later is still receipted and flagged by the webhook path.
 */
export async function reconcileGatewayPayments(now = new Date(), force = false) {
  const runtime = state();
  if (!force && runtime.__sworgReconcileAt && now.getTime() - runtime.__sworgReconcileAt < RUN_EVERY_MS) return { checked: 0, settled: 0, skipped: true };
  runtime.__sworgReconcileAt = now.getTime();

  const open = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      provider: { in: ["RAZORPAY", "STRIPE"] },
      gatewayOrderId: { not: null },
      createdAt: { lte: new Date(now.getTime() - POLL_AFTER_MS) },
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH,
    select: { id: true, organisationId: true, createdAt: true },
  });
  let settled = 0;
  for (const payment of open) {
    await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { updatedAt: now } });
    try {
      const status = await refreshGatewayPayment(payment.organisationId, payment.id);
      if (status === "PAID") settled += 1;
      else if (status === "PENDING") await closeIfStale(payment, now);
    } catch {
      // One organisation's bad keys or a provider outage must not stop the others.
      console.error("[payments reconcile] one payment could not be checked");
      await closeIfStale(payment, now).catch(() => undefined);
    }
  }
  return { checked: open.length, settled, skipped: false };
}

import "server-only";

import { prisma } from "@/lib/db";
import { getRequestOrigin } from "@/lib/publicUrl";
import { createTermPayment, ORG_FOR_PAYMENTS, PaymentError } from "./charges";
import { gatewayTakes, loadGateway } from "./config";
import { allowsGateway } from "./paymentMode";
import { GatewayError, type CheckoutResult } from "./gateway";
import { verifyCheckoutSignature } from "./razorpay";
import { membershipChanged } from "@/lib/membership/afterChange";
import { failPayment, settlePayment } from "./settle";

/**
 * Start an online payment for a term: create the Payment (with its tax lines) first, then the gateway
 * order. A gateway refusal closes the attempt as FAILED, so nothing is left dangling.
 */
export async function startCheckout(args: { organisationId: string; termId: string; customer: { name: string; email: string }; returnPath: string }): Promise<CheckoutResult & { paymentId: string; amountMinor: number; currency: string }> {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: args.organisationId }, select: ORG_FOR_PAYMENTS });
  if (org.status !== "ACTIVE") throw new PaymentError(`${org.name} isn't taking online payments right now.`);
  const live = await loadGateway(org.id);
  if (!live) throw new PaymentError("Online payment isn't set up for this organisation. Use the other ways to pay below.");
  const term = await prisma.membershipTerm.findFirst({ where: { id: args.termId, organisationId: org.id }, select: { currency: true, plan: { select: { name: true, paymentMode: true } } } });
  if (!term) throw new PaymentError("Membership not found.");
  if (!allowsGateway(term.plan.paymentMode)) throw new PaymentError(term.plan.paymentMode === "FREE" ? "There is nothing to pay for this membership." : "This membership is paid in hand. Use the instructions on this page, then tell us you've paid.");
  if (!gatewayTakes(live.provider, term.currency)) throw new PaymentError(`Online payment doesn't take ${term.currency}. Use the other ways to pay below.`);

  const origin = await getRequestOrigin();
  const payment = await prisma.$transaction((tx) => createTermPayment(tx, { org, termId: args.termId, provider: live.provider, status: "PENDING" }));
  try {
    const result = await live.gateway.createCheckout(live.credentials, {
      paymentId: payment.id,
      organisationId: org.id,
      termId: args.termId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      description: `${term.plan.name} · ${org.name}`,
      organisationName: org.name,
      customer: args.customer,
      successUrl: `${origin}${args.returnPath}?payment=${payment.id}`,
      cancelUrl: `${origin}${args.returnPath}?cancelled=1`,
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { gatewayOrderId: result.orderId } });
    return { ...result, paymentId: payment.id, amountMinor: payment.amountMinor, currency: payment.currency };
  } catch (error) {
    await prisma.$transaction((tx) => failPayment(tx, { org, paymentId: payment.id, reason: "The payment provider refused the order." }));
    if (error instanceof GatewayError && !error.retryable) throw new PaymentError("The payment provider couldn't start this payment. Try again later or use the other ways to pay.");
    throw new PaymentError("The payment provider couldn't be reached. Try again in a minute.");
  }
}

/**
 * Ask the gateway where an open attempt stands and settle or fail it. Used when a member returns from
 * checkout and by the reconcile job, so a missed webhook never leaves a paid member waiting.
 */
export async function refreshGatewayPayment(organisationId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, organisationId }, select: { id: true, status: true, provider: true, gatewayOrderId: true } });
  if (!payment || !payment.gatewayOrderId || payment.provider === "OFFLINE") return payment?.status ?? null;
  if (payment.status === "PAID") return "PAID";
  const live = await loadGateway(organisationId);
  if (!live || live.provider !== payment.provider) return payment.status;
  const fetched = await live.gateway.fetchPayment(live.credentials, payment.gatewayOrderId);
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: ORG_FOR_PAYMENTS });
  if (fetched.status === "paid") {
    const { payment: settled } = await prisma.$transaction((tx) => settlePayment(tx, { org, paymentId: payment.id, capture: { gatewayPaymentId: fetched.gatewayPaymentId, amountMinor: fetched.amountMinor, currency: fetched.currency, method: fetched.method } }));
    await membershipChanged(org.id);
    return settled.status;
  }
  if (fetched.status === "failed" && payment.status === "PENDING") {
    await prisma.$transaction((tx) => failPayment(tx, { org, paymentId: payment.id, reason: fetched.reason }));
    return "FAILED";
  }
  return payment.status;
}

/** Razorpay Checkout.js finished in the browser: check its signature, then settle from the provider's record. */
export async function confirmRazorpayCheckout(args: { organisationId: string; paymentId: string; orderId: string; gatewayPaymentId: string; signature: string }) {
  const payment = await prisma.payment.findFirst({ where: { id: args.paymentId, organisationId: args.organisationId, provider: "RAZORPAY" }, select: { gatewayOrderId: true } });
  if (!payment || payment.gatewayOrderId !== args.orderId) throw new PaymentError("Payment not found.");
  const live = await loadGateway(args.organisationId);
  if (!live || live.provider !== "RAZORPAY") throw new PaymentError("Online payment isn't set up for this organisation.");
  if (!verifyCheckoutSignature(live.credentials.secret, args.orderId, args.gatewayPaymentId, args.signature)) throw new PaymentError("The payment couldn't be verified.");
  return refreshGatewayPayment(args.organisationId, args.paymentId);
}

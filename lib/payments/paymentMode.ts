/**
 * How a plan is paid. Pure and client-safe.
 * - FREE: nothing to pay; no Payment row and no receipt number.
 * - ONLINE_OR_IN_HAND: the organisation's gateway when it has one, in hand otherwise.
 * - IN_HAND_ONLY: always in hand (cash, UPI, bank), confirmed by staff; the gateway is never offered.
 */

export const PAYMENT_MODES = ["FREE", "ONLINE_OR_IN_HAND", "IN_HAND_ONLY"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, { label: string; description: string }> = {
  FREE: { label: "Free", description: "No payment step. Joining or renewing starts the membership, after approval if the plan needs it." },
  ONLINE_OR_IN_HAND: { label: "Paid, online or in hand", description: "Members pay online when you have set up a payment service, and in hand otherwise." },
  IN_HAND_ONLY: { label: "Paid, in hand only", description: "Members see your payment instructions and say they've paid. Your team confirms cash, UPI or bank receipt." },
};

export function isPaymentMode(value: unknown): value is PaymentMode {
  return typeof value === "string" && (PAYMENT_MODES as readonly string[]).includes(value);
}

/** Whether the organisation's online payment service may be used for a plan. */
export function allowsGateway(mode: PaymentMode): boolean {
  return mode === "ONLINE_OR_IN_HAND";
}

/** A free plan charges nothing on any line; a paid one charges something. */
export function priceProblems(mode: PaymentMode, prices: { priceNewMinor: number; priceRenewalMinor: number; joiningFeeMinor: number }): Array<{ path: "priceNew" | "priceRenewal" | "joiningFee"; message: string }> {
  const lines = [["priceNew", prices.priceNewMinor], ["priceRenewal", prices.priceRenewalMinor], ["joiningFee", prices.joiningFeeMinor]] as const;
  if (mode === "FREE") return lines.filter(([, minor]) => minor !== 0).map(([path]) => ({ path, message: "A free plan charges nothing. Clear this or choose a paid mode" }));
  if (lines.every(([, minor]) => minor === 0)) return [{ path: "priceNew", message: "A paid plan needs a price above zero, or choose Free" }];
  return [];
}

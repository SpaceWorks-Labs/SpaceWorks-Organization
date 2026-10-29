/**
 * What a member may get back when they cancel, under the organisation's refund policy. Pure and client-safe.
 * - NONE: nothing; cancelling just ends the membership.
 * - FULL: everything still refundable, within the window after payment.
 * - PRO_RATA: the unused share of the membership fee (joining fees are not refunded), within the window.
 *   A lifetime membership has no end to share against, so its whole membership fee is offered.
 */
export type RefundPolicyName = "NONE" | "FULL" | "PRO_RATA";

export const REFUND_POLICY_LABELS: Record<RefundPolicyName, string> = {
  NONE: "No refunds",
  FULL: "Full refund within the window",
  PRO_RATA: "Unused share of the membership fee, within the window",
};

type RefundOfferInput = {
  policy: RefundPolicyName;
  windowDays: number;
  paidAt: Date;
  now: Date;
  /** What is still refundable on the payment (received less pending and processed refunds). */
  refundableMinor: number;
  /** The membership-fee lines of the payment, tax included (joining and rejoining fees excluded). */
  membershipFeeMinor: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type RefundOffer =
  | { eligible: true; amountMinor: number; deadline: Date }
  | { eligible: false; reason: "no-refunds" | "window-closed" | "nothing-left"; deadline: Date | null };

const DAY = 86_400_000;

/** The unused fraction of a term at `now`: 1 before it starts, 0 after it ends. */
export function unusedShare(startsAt: Date | null, endsAt: Date | null, now: Date): number {
  if (!endsAt) return 1;
  const start = startsAt ?? now;
  const length = endsAt.getTime() - start.getTime();
  if (length <= 0) return 0;
  const left = endsAt.getTime() - Math.max(now.getTime(), start.getTime());
  return Math.min(1, Math.max(0, left / length));
}

export function refundOffer(input: RefundOfferInput): RefundOffer {
  if (input.policy === "NONE") return { eligible: false, reason: "no-refunds", deadline: null };
  const deadline = new Date(input.paidAt.getTime() + input.windowDays * DAY);
  if (input.now.getTime() > deadline.getTime()) return { eligible: false, reason: "window-closed", deadline };
  const wanted = input.policy === "FULL"
    ? input.refundableMinor
    : Math.floor(input.membershipFeeMinor * unusedShare(input.startsAt, input.endsAt, input.now));
  const amountMinor = Math.min(wanted, input.refundableMinor);
  if (amountMinor <= 0) return { eligible: false, reason: "nothing-left", deadline };
  return { eligible: true, amountMinor, deadline };
}

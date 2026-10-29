import "server-only";

import type { Organisation, Payment, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { statusAt } from "@/lib/membership/lifecycle";
import { chargeLines, placeOfSupply, resolveTaxSnapshot, sumSplits } from "./tax";

type Tx = Prisma.TransactionClient;
export type OrgForPayments = Pick<Organisation, "id" | "name" | "slug" | "status" | "timezone" | "financialYearStartMonth" | "offlineConfirmationRequired" | "addressLine" | "city" | "stateCode" | "postalCode" | "contactEmail" | "locale" | "logoUrl">;

export const ORG_FOR_PAYMENTS = {
  id: true, name: true, slug: true, status: true, timezone: true, financialYearStartMonth: true, offlineConfirmationRequired: true,
  addressLine: true, city: true, stateCode: true, postalCode: true, contactEmail: true, locale: true, logoUrl: true,
} satisfies Prisma.OrganisationSelect;

export class PaymentError extends Error {
  override name = "PaymentError";
}

const HELD = ["UPCOMING", "ACTIVE", "GRACE", "ENDED", "LAPSED", "REVOKED"] as const;

/** Lock every open payment of a term, then the term itself (lock order: payment, term, counter). */
export async function lockTermForPayment(tx: Tx, organisationId: string, termId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "termId" = ${termId} AND "organisationId" = ${organisationId} AND "status" IN ('PENDING', 'AWAITING_CONFIRMATION') ORDER BY "id" FOR UPDATE`;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "MembershipTerm" WHERE "id" = ${termId} AND "organisationId" = ${organisationId} FOR UPDATE`;
  if (rows.length === 0) throw new PaymentError("Membership not found.");
  return tx.membershipTerm.findUniqueOrThrow({
    where: { id: termId },
    include: { plan: true, member: { select: { id: true, name: true, email: true, stateCode: true, anonymisedAt: true } }, payments: { where: { status: { in: ["PENDING", "AWAITING_CONFIRMATION", "PAID", "WAIVED"] } } } },
  });
}

type LockedTerm = Awaited<ReturnType<typeof lockTermForPayment>>;

/** What is still owed on a term: nothing once a payment is settled or waived. */
export function amountDue(term: Pick<LockedTerm, "priceMinor" | "joiningFeeMinor" | "payments">) {
  if (term.payments.some((payment) => payment.status === "PAID" || payment.status === "WAIVED")) return 0;
  return term.priceMinor + term.joiningFeeMinor;
}

/** Whether a term can take a payment now: unpaid, or started under a plan that charges after activation. */
export function payable(term: LockedTerm, now: Date) {
  const status = statusAt(term, now);
  if (amountDue(term) <= 0 || term.member.anonymisedAt) return false;
  if (status === "PENDING_PAYMENT" || status === "EXPIRED") return true;
  return term.plan.paymentTiming === "ACTIVATE_THEN_CHARGE" && (HELD as readonly string[]).includes(status) && status !== "REVOKED";
}

/**
 * Create the payment for a term with its tax snapshot and lines, cancelling any earlier open gateway
 * attempt. An open offline claim blocks a new payment until a manager decides it.
 */
export async function createTermPayment(
  tx: Tx,
  args: { org: OrgForPayments; termId: string; provider: PaymentProvider; status: Extract<PaymentStatus, "PENDING" | "AWAITING_CONFIRMATION">; method?: string | null; utr?: string | null; reference?: string | null; note?: string; recordedById?: string | null; memberClaim?: boolean; now?: Date },
): Promise<Payment> {
  const now = args.now ?? new Date();
  const term = await lockTermForPayment(tx, args.org.id, args.termId);
  if (!payable(term, now)) throw new PaymentError("Nothing is due on this membership.");
  const open = term.payments.filter((payment) => payment.status === "PENDING" || payment.status === "AWAITING_CONFIRMATION");
  if (open.some((payment) => payment.status === "AWAITING_CONFIRMATION")) throw new PaymentError("A payment is waiting for the team to confirm it.");
  if (open.length > 0) await tx.payment.updateMany({ where: { id: { in: open.map((payment) => payment.id) } }, data: { status: "CANCELLED", note: "Replaced by a new payment attempt." } });

  const settings = await tx.orgTaxSettings.findUnique({ where: { organisationId: args.org.id } });
  const snapshot = resolveTaxSnapshot(settings, term.currency);
  const rejoining = term.kind === "NEW" && term.joiningFeeMinor > 0
    && (await tx.membershipTerm.count({ where: { memberId: term.memberId, planId: term.planId, id: { not: term.id }, status: { in: [...HELD] } } })) > 0;
  const lines = chargeLines({ renewal: term.kind === "RENEWAL", rejoining, priceMinor: term.priceMinor, joiningFeeMinor: term.joiningFeeMinor, planName: term.plan.name }, snapshot, placeOfSupply(term.member.stateCode, snapshot));
  const totals = sumSplits(lines);

  return tx.payment.create({
    data: {
      organisationId: args.org.id,
      memberId: term.memberId,
      termId: term.id,
      status: args.status,
      provider: args.provider,
      method: args.method ?? null,
      currency: term.currency,
      amountMinor: totals.amountMinor,
      utr: args.utr ?? null,
      reference: args.reference ?? null,
      note: args.note ?? "",
      recordedById: args.recordedById ?? null,
      memberClaim: args.memberClaim ?? false,
      taxSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      lines: { create: lines.map((line) => ({ currency: term.currency, ...line })) },
    },
  });
}

/** Lock one payment of the organisation for an update. */
export async function lockPayment(tx: Tx, organisationId: string, paymentId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} AND "organisationId" = ${organisationId} FOR UPDATE`;
  if (rows.length === 0) throw new PaymentError("Payment not found.");
  return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
}

import "server-only";

/**
 * The finance data source: every finance report reads its rows through these loaders and nothing else.
 * Scoping is always the organisation, then the unit subtree through the member, then the plan through the
 * term; never widen it. Rows map onto ./types.ts, which the pure reports depend on.
 * Contract and signatures: docs/REPORTS.md "Finance data contract".
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ReportScope } from "../source";
import { scopedMemberWhere } from "../source";
import type { FinancePayment, FinancePaymentLine, FinancePlan, FinanceRefund, FinanceRows, FinanceTaxDocument, UnpaidTerm } from "./types";
import type { OfflineCollection } from "./cashInHand";

/** The payment tables are wired, so the finance tabs show real figures. */
export const FINANCE_TABLES_READY = true;

function paymentWhere(scope: ReportScope): Prisma.PaymentWhereInput {
  return { organisationId: scope.organisationId, member: { is: scopedMemberWhere(scope) }, ...(scope.planId ? { term: { is: { planId: scope.planId } } } : {}) };
}

const paymentSelect = {
  id: true, memberId: true, termId: true, status: true, provider: true, method: true, currency: true, amountMinor: true, createdAt: true, paidAt: true,
  flaggedAt: true, documentHeld: true, recordedById: true, confirmedById: true, organisationId: true,
  member: { select: { unitId: true } },
  term: { select: { planId: true } },
} satisfies Prisma.PaymentSelect;

function toPayment(row: Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>): FinancePayment {
  return {
    id: row.id,
    memberId: row.memberId,
    termId: row.termId,
    unitId: row.member.unitId,
    planId: row.term?.planId ?? null,
    status: row.status,
    provider: row.provider,
    method: row.method,
    currency: row.currency,
    amountMinor: row.amountMinor,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    flagged: Boolean(row.flaggedAt) || row.documentHeld,
    recordedById: row.recordedById,
    confirmedById: row.confirmedById,
  };
}

/** Payments in scope. */
export async function loadPayments(scope: ReportScope): Promise<FinancePayment[]> {
  const rows = await prisma.payment.findMany({ where: paymentWhere(scope), select: paymentSelect });
  return rows.map(toPayment);
}

/** Lines of the payments in scope. */
export async function loadPaymentLines(scope: ReportScope): Promise<FinancePaymentLine[]> {
  return prisma.paymentLine.findMany({
    where: { organisationId: scope.organisationId, payment: { is: paymentWhere(scope) } },
    select: { paymentId: true, kind: true, currency: true, amountMinor: true, taxableMinor: true, cgstMinor: true, sgstMinor: true, igstMinor: true, otherTaxMinor: true },
  });
}

/** Refunds of the payments in scope. */
export async function loadRefunds(scope: ReportScope): Promise<FinanceRefund[]> {
  return prisma.refund.findMany({
    where: { organisationId: scope.organisationId, payment: { is: paymentWhere(scope) } },
    select: { id: true, paymentId: true, currency: true, amountMinor: true, status: true, createdAt: true, processedAt: true },
  });
}

type SnapshotTax = { tax?: { rateBps?: number }; recipient?: { gstin?: string | null } };

/**
 * Tax documents in scope, credit notes included (they keep their payment's id). The B6 continuity check
 * needs every document of a series, so call it with an unscoped organisation scope for that table;
 * lib/views/*reports__tax* already does.
 */
export async function loadTaxDocuments(scope: ReportScope): Promise<FinanceTaxDocument[]> {
  const rows = await prisma.taxDocument.findMany({
    where: { organisationId: scope.organisationId, ...(scope.unitPath || scope.planId || scope.memberId ? { payment: { is: paymentWhere(scope) } } : {}) },
    orderBy: [{ series: "asc" }, { financialYear: "asc" }, { sequence: "asc" }],
    select: {
      id: true, paymentId: true, refundId: true, kind: true, number: true, series: true, sequence: true, financialYear: true, issuedAt: true, cancelledAt: true, currency: true,
      totalMinor: true, taxableMinor: true, cgstMinor: true, sgstMinor: true, igstMinor: true, otherTaxMinor: true, placeOfSupply: true, sac: true, snapshot: true,
    },
  });
  return rows.map(({ snapshot, sac, ...row }) => {
    const frozen = (snapshot ?? {}) as SnapshotTax;
    return { ...row, sac: sac ?? "", rateBps: frozen.tax?.rateBps ?? 0, recipientGstin: frozen.recipient?.gstin ?? null };
  });
}

/** PENDING_PAYMENT terms with no open or settled payment: money owed that no checkout or claim covers. */
export async function loadUnpaidTerms(scope: ReportScope): Promise<UnpaidTerm[]> {
  const terms = await prisma.membershipTerm.findMany({
    where: {
      organisationId: scope.organisationId,
      status: "PENDING_PAYMENT",
      member: { is: scopedMemberWhere(scope) },
      payments: { none: { status: { in: ["PENDING", "AWAITING_CONFIRMATION", "PAID", "WAIVED"] } } },
      ...(scope.planId ? { planId: scope.planId } : {}),
    },
    select: { id: true, memberId: true, planId: true, currency: true, priceMinor: true, joiningFeeMinor: true, createdAt: true, paymentDueBy: true, member: { select: { unitId: true } } },
  });
  return terms.map((term) => ({ termId: term.id, memberId: term.memberId, planId: term.planId, unitId: term.member.unitId, currency: term.currency, amountMinor: term.priceMinor + term.joiningFeeMinor, createdAt: term.createdAt, paymentDueBy: term.paymentDueBy }));
}

/**
 * Offline money someone recorded (confirmed or waiting), with refunds so far and the member's own account, for cash
 * in hand, recorded within the window. Waivers are excluded by status; member claims are told apart in ./cashInHand.ts.
 */
export async function loadOfflineCollections(scope: ReportScope, window: { from: Date; to: Date }): Promise<OfflineCollection[]> {
  const rows = await prisma.payment.findMany({
    where: { ...paymentWhere(scope), provider: "OFFLINE", status: { in: ["PAID", "AWAITING_CONFIRMATION"] }, recordedById: { not: null }, createdAt: { gte: window.from, lt: window.to } },
    select: {
      id: true, memberId: true, status: true, currency: true, amountMinor: true, createdAt: true, recordedById: true, memberClaim: true,
      member: { select: { unitId: true, userId: true } },
      refunds: { where: { status: { in: ["PENDING", "PROCESSED"] } }, select: { amountMinor: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    memberId: row.memberId,
    unitId: row.member.unitId,
    memberClaim: row.memberClaim,
    recordedById: row.recordedById!,
    status: row.status as OfflineCollection["status"],
    currency: row.currency,
    amountMinor: row.amountMinor,
    refundedMinor: row.refunds.reduce((sum, refund) => sum + refund.amountMinor, 0),
    createdAt: row.createdAt,
  }));
}

/** All finance rows for one scope. */
export async function loadFinanceRows(scope: ReportScope): Promise<FinanceRows> {
  const [payments, lines, refunds, documents, unpaidTerms] = await Promise.all([loadPayments(scope), loadPaymentLines(scope), loadRefunds(scope), loadTaxDocuments(scope), loadUnpaidTerms(scope)]);
  return { payments, lines, refunds, documents, unpaidTerms };
}

/** Plan renewal prices for the forecast. */
export async function loadFinancePlans(organisationId: string): Promise<FinancePlan[]> {
  return prisma.membershipPlan.findMany({ where: { organisationId }, select: { id: true, name: true, currency: true, priceRenewalMinor: true } });
}

/** A4: paid payments across every organisation in a window. */
export async function loadPlatformPayments(window: { from: Date; to: Date }): Promise<Array<FinancePayment & { organisationId: string }>> {
  const rows = await prisma.payment.findMany({ where: { status: "PAID", paidAt: { gte: window.from, lt: window.to } }, select: paymentSelect });
  return rows.map((row) => ({ ...toPayment(row), organisationId: row.organisationId }));
}

/** Start and end of the terms behind the given payments, for subscription income by financial year. */
export async function loadTermPeriods(scope: ReportScope, termIds: string[]): Promise<Array<{ termId: string; startsAt: Date | null; endsAt: Date | null }>> {
  if (termIds.length === 0) return [];
  const terms = await prisma.membershipTerm.findMany({ where: { organisationId: scope.organisationId, id: { in: termIds } }, select: { id: true, startsAt: true, endsAt: true } });
  return terms.map((term) => ({ termId: term.id, startsAt: term.startsAt, endsAt: term.endsAt }));
}

const refundSelect = { id: true, paymentId: true, currency: true, amountMinor: true, status: true, createdAt: true, processedAt: true } satisfies Prisma.RefundSelect;
const refundedIn = (window: { from: Date; to: Date }): Prisma.RefundWhereInput => ({
  status: "PROCESSED",
  OR: [{ processedAt: { gte: window.from, lt: window.to } }, { processedAt: null, createdAt: { gte: window.from, lt: window.to } }],
});

/** H6: money collected in a window: paid payments by `paidAt` and processed refunds by refund date, in scope. */
export async function loadCollections(scope: ReportScope, window: { from: Date; to: Date }): Promise<{ payments: FinancePayment[]; refunds: Array<FinanceRefund & { memberId: string }> }> {
  const [payments, refunds] = await Promise.all([
    prisma.payment.findMany({ where: { ...paymentWhere(scope), status: "PAID", paidAt: { gte: window.from, lt: window.to } }, select: paymentSelect }),
    prisma.refund.findMany({ where: { organisationId: scope.organisationId, payment: { is: paymentWhere(scope) }, ...refundedIn(window) }, select: { ...refundSelect, payment: { select: { memberId: true } } } }),
  ]);
  return { payments: payments.map(toPayment), refunds: refunds.map(({ payment, ...refund }) => ({ ...refund, memberId: payment.memberId })) };
}

/** H6: what is owed now in scope: open payments and unpaid terms with no payment. */
export async function loadOpenCharges(scope: ReportScope): Promise<Pick<FinanceRows, "payments" | "unpaidTerms">> {
  const [payments, unpaidTerms] = await Promise.all([
    prisma.payment.findMany({ where: { ...paymentWhere(scope), status: { in: ["PENDING", "AWAITING_CONFIRMATION"] } }, select: paymentSelect }),
    loadUnpaidTerms(scope),
  ]);
  return { payments: payments.map(toPayment), unpaidTerms };
}

/** H7: processed refunds across every organisation in a window, by refund date. */
export async function loadPlatformRefunds(window: { from: Date; to: Date }): Promise<Array<FinanceRefund & { organisationId: string }>> {
  return prisma.refund.findMany({ where: refundedIn(window), select: { ...refundSelect, organisationId: true } });
}

export type OrgAmount = { organisationId: string; currency: string; amountMinor: number };

/** H7: what each organisation is owed now, per currency: open payments plus unpaid terms with no payment. Amounts only. */
export async function loadPlatformOutstanding(): Promise<OrgAmount[]> {
  const [payments, terms] = await Promise.all([
    prisma.payment.groupBy({ by: ["organisationId", "currency"], where: { status: { in: ["PENDING", "AWAITING_CONFIRMATION"] } }, _sum: { amountMinor: true } }),
    prisma.membershipTerm.groupBy({
      by: ["organisationId", "currency"],
      where: { status: "PENDING_PAYMENT", payments: { none: { status: { in: ["PENDING", "AWAITING_CONFIRMATION", "PAID", "WAIVED"] } } } },
      _sum: { priceMinor: true, joiningFeeMinor: true },
    }),
  ]);
  return [
    ...payments.map((row) => ({ organisationId: row.organisationId, currency: row.currency, amountMinor: row._sum.amountMinor ?? 0 })),
    ...terms.map((row) => ({ organisationId: row.organisationId, currency: row.currency, amountMinor: (row._sum.priceMinor ?? 0) + (row._sum.joiningFeeMinor ?? 0) })),
  ];
}

/** H7: each organisation's latest paid payment, and its failed online payments since `failedSince`. */
export async function loadPlatformPaymentActivity(failedSince: Date): Promise<{ lastPaid: Map<string, Date>; failed: Map<string, number> }> {
  const [last, failed] = await Promise.all([
    prisma.payment.groupBy({ by: ["organisationId"], where: { status: "PAID" }, _max: { paidAt: true } }),
    prisma.payment.groupBy({ by: ["organisationId"], where: { status: "FAILED", createdAt: { gte: failedSince } }, _count: { _all: true } }),
  ]);
  return {
    lastPaid: new Map(last.flatMap((row) => (row._max.paidAt ? [[row.organisationId, row._max.paidAt] as const] : []))),
    failed: new Map(failed.map((row) => [row.organisationId, row._count._all])),
  };
}

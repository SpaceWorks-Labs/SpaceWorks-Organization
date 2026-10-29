/**
 * B5 revenue: money collected by `paidAt`, net of refunds by refund date, per currency. Pure. Definitions:
 * docs/REPORTS.md "Collected" and "Revenue".
 */
import { bucketIndex, type Bucket } from "../period";
import { groupTotals, subtractTotals, totals, type CurrencyTotal } from "../money";
import type { FeeKind, FinancePayment, FinancePaymentLine, FinanceRefund, FinanceRows } from "./types";

export type Window = { from: Date; to: Date };
const inWindow = (instant: Date | null, window: Window): instant is Date => instant !== null && instant >= window.from && instant < window.to;

/** Payments that count as collected in the window: PAID with `paidAt` inside it. Waived payments never do. */
export function collectedPayments(rows: Pick<FinanceRows, "payments">, window: Window): FinancePayment[] {
  return rows.payments.filter((payment) => payment.status === "PAID" && inWindow(payment.paidAt, window));
}

/** Refunds netted in the window: PROCESSED, by the date they were processed (the refund date). */
export function windowRefunds(rows: Pick<FinanceRows, "refunds">, window: Window): FinanceRefund[] {
  return rows.refunds.filter((refund) => refund.status === "PROCESSED" && inWindow(refund.processedAt ?? refund.createdAt, window));
}

export type RevenueSummary = {
  gross: CurrencyTotal[];
  refunds: CurrencyTotal[];
  net: CurrencyTotal[];
  payments: number;
  refundCount: number;
  /** Net ÷ distinct paying members, per currency. */
  perPayingMember: CurrencyTotal[];
  payingMembers: Record<string, number>;
};

export function revenueSummary(rows: FinanceRows, window: Window, primary?: string): RevenueSummary {
  const paid = collectedPayments(rows, window);
  const refunds = windowRefunds(rows, window);
  const gross = totals(paid, (payment) => ({ currency: payment.currency, minor: payment.amountMinor }), primary);
  const refunded = totals(refunds, (refund) => ({ currency: refund.currency, minor: refund.amountMinor }), primary);
  const net = subtractTotals(gross, refunded, primary);
  const payers = new Map<string, Set<string>>();
  for (const payment of paid) payers.set(payment.currency, (payers.get(payment.currency) ?? new Set()).add(payment.memberId));
  const payingMembers = Object.fromEntries([...payers].map(([currency, set]) => [currency, set.size]));
  return {
    gross,
    refunds: refunded,
    net,
    payments: paid.length,
    refundCount: refunds.length,
    perPayingMember: net.filter((entry) => payingMembers[entry.currency]).map((entry) => ({ currency: entry.currency, minor: Math.round(entry.minor / payingMembers[entry.currency]) })),
    payingMembers,
  };
}

type RevenuePoint = { key: string; label: string; gross: CurrencyTotal[]; refunds: CurrencyTotal[]; net: CurrencyTotal[] };

/** Gross, refunds and net per bucket (month or day). */
export function revenueSeries(rows: FinanceRows, buckets: Bucket[], primary?: string): RevenuePoint[] {
  const paidIn = buckets.map(() => [] as FinancePayment[]);
  const refundIn = buckets.map(() => [] as FinanceRefund[]);
  for (const payment of rows.payments) {
    if (payment.status !== "PAID" || !payment.paidAt) continue;
    const index = bucketIndex(buckets, payment.paidAt);
    if (index >= 0) paidIn[index].push(payment);
  }
  for (const refund of rows.refunds) {
    if (refund.status !== "PROCESSED") continue;
    const index = bucketIndex(buckets, refund.processedAt ?? refund.createdAt);
    if (index >= 0) refundIn[index].push(refund);
  }
  return buckets.map((bucket, index) => {
    const gross = totals(paidIn[index], (p) => ({ currency: p.currency, minor: p.amountMinor }), primary);
    const refunds = totals(refundIn[index], (r) => ({ currency: r.currency, minor: r.amountMinor }), primary);
    return { key: bucket.key, label: bucket.label, gross, refunds, net: subtractTotals(gross, refunds, primary) };
  });
}

type RevenueDimension = "plan" | "unit" | "provider" | "method";

/** Net revenue split by plan, unit, provider or method: each refund counts against its payment's group. */
export function revenueBy(rows: FinanceRows, window: Window, dimension: RevenueDimension, primary?: string) {
  const byId = new Map(rows.payments.map((payment) => [payment.id, payment]));
  const keyOf = (payment: FinancePayment) => (dimension === "plan" ? payment.planId : dimension === "unit" ? payment.unitId : dimension === "provider" ? payment.provider : payment.method) ?? "none";
  const entries = [
    ...collectedPayments(rows, window).map((payment) => ({ key: keyOf(payment), currency: payment.currency, minor: payment.amountMinor })),
    ...windowRefunds(rows, window).flatMap((refund) => {
      const payment = byId.get(refund.paymentId);
      return payment ? [{ key: keyOf(payment), currency: refund.currency, minor: -refund.amountMinor }] : [];
    }),
  ];
  return groupTotals(entries, (entry) => entry.key, (entry) => ({ currency: entry.currency, minor: entry.minor }), primary);
}

/**
 * Split an amount across weights in whole minor units (largest remainder), so the parts always add up
 * exactly. Used to apportion a refund across the fee kinds of the payment it reverses.
 */
export function apportion(amount: number, weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return weights.map((_, index) => (index === 0 ? amount : 0));
  const raw = weights.map((weight) => (amount * weight) / total);
  const parts = raw.map(Math.floor);
  let left = amount - parts.reduce((sum, part) => sum + part, 0);
  const order = raw.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index] += 1;
    left -= 1;
  }
  return parts;
}

/** Net revenue by fee kind (term fee, joining fee, rejoin fee); refunds are apportioned pro rata over the payment's lines. */
export function revenueByFeeKind(rows: FinanceRows, window: Window, primary?: string) {
  const linesByPayment = new Map<string, FinancePaymentLine[]>();
  for (const line of rows.lines) linesByPayment.set(line.paymentId, [...(linesByPayment.get(line.paymentId) ?? []), line]);
  const entries: Array<{ key: FeeKind; currency: string; minor: number }> = [];
  for (const payment of collectedPayments(rows, window)) for (const line of linesByPayment.get(payment.id) ?? []) entries.push({ key: line.kind, currency: line.currency, minor: line.amountMinor });
  for (const refund of windowRefunds(rows, window)) {
    const lines = linesByPayment.get(refund.paymentId) ?? [];
    if (!lines.length) continue;
    const parts = apportion(refund.amountMinor, lines.map((line) => line.amountMinor));
    lines.forEach((line, index) => entries.push({ key: line.kind, currency: refund.currency, minor: -parts[index] }));
  }
  return groupTotals(entries, (entry) => entry.key, (entry) => ({ currency: entry.currency, minor: entry.minor }), primary);
}

type PaymentHealth = {
  /** Online (gateway) payments that failed ÷ online payments that were paid or failed, created in the window. */
  failedRate: number | null;
  failed: number;
  onlineAttempts: number;
  waived: number;
  waivedTotals: CurrencyTotal[];
  refunds: FinanceRefund[];
  pendingRefunds: number;
};

export function paymentHealth(rows: FinanceRows, window: Window, primary?: string): PaymentHealth {
  const created = rows.payments.filter((payment) => inWindow(payment.createdAt, window));
  const online = created.filter((payment) => payment.provider !== "OFFLINE" && (payment.status === "PAID" || payment.status === "FAILED"));
  const failed = online.filter((payment) => payment.status === "FAILED").length;
  const waived = created.filter((payment) => payment.status === "WAIVED");
  return {
    failedRate: online.length ? failed / online.length : null,
    failed,
    onlineAttempts: online.length,
    waived: waived.length,
    waivedTotals: totals(waived, (payment) => ({ currency: payment.currency, minor: payment.amountMinor }), primary),
    refunds: rows.refunds.filter((refund) => inWindow(refund.createdAt, window) || inWindow(refund.processedAt, window)),
    pendingRefunds: rows.refunds.filter((refund) => refund.status === "PENDING").length,
  };
}

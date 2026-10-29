import { apportion } from "./revenue";
import type { FinancePayment, FinancePaymentLine, FinanceRefund } from "./types";

/**
 * Subscription income by financial year, the way a society's accounts show it (docs/REPORTS.md):
 * membership fees are earned over the days the membership covers, so a fee received in March for April to
 * March is mostly "received in advance". Joining fees and lifetime memberships are income when received.
 *
 *   earned = received + advance at the start − advance at the end + arrears at the end − arrears at the start
 *
 * Amounts are taxable values (tax is not income), net of processed refunds, in minor units per currency.
 * Each payment's fee is split across before / within / after the year by days, largest remainder first, so
 * the identity above holds to the paisa.
 */

type TermPeriod = { termId: string; startsAt: Date | null; endsAt: Date | null };

export type SubscriptionIncome = {
  currency: string;
  /** Membership fees received during the year. */
  received: number;
  /** Fees received earlier for days inside or after this year. */
  advanceOpening: number;
  /** Fees received by the year end for days after it. */
  advanceClosing: number;
  /** Fees for days before the year start that were received after it. */
  arrearsOpening: number;
  /** Fees for days up to the year end that were received after it. */
  arrearsClosing: number;
  /** Membership fees earned for days inside the year. */
  earned: number;
  /** Joining and rejoining fees, and lifetime memberships, received during the year (income on receipt). */
  receivedOnReceipt: number;
};

const empty = (currency: string): SubscriptionIncome => ({ currency, received: 0, advanceOpening: 0, advanceClosing: 0, arrearsOpening: 0, arrearsClosing: 0, earned: 0, receivedOnReceipt: 0 });

function overlap(start: number, end: number, from: number, to: number) {
  return Math.max(0, Math.min(end, to) - Math.max(start, from));
}

export function subscriptionIncome(
  rows: { payments: FinancePayment[]; lines: FinancePaymentLine[]; refunds: FinanceRefund[] },
  terms: TermPeriod[],
  year: { from: Date; to: Date },
  primary?: string,
): SubscriptionIncome[] {
  const termById = new Map(terms.map((term) => [term.termId, term]));
  const refunded = new Map<string, number>();
  for (const refund of rows.refunds) if (refund.status === "PROCESSED") refunded.set(refund.paymentId, (refunded.get(refund.paymentId) ?? 0) + refund.amountMinor);
  const linesBy = new Map<string, FinancePaymentLine[]>();
  for (const line of rows.lines) linesBy.set(line.paymentId, [...(linesBy.get(line.paymentId) ?? []), line]);
  const out = new Map<string, SubscriptionIncome>();
  const from = year.from.getTime();
  const to = year.to.getTime();

  for (const payment of rows.payments) {
    if (payment.status !== "PAID" || !payment.paidAt) continue;
    const lines = linesBy.get(payment.id) ?? [];
    const keep = payment.amountMinor > 0 ? Math.max(0, 1 - (refunded.get(payment.id) ?? 0) / payment.amountMinor) : 0;
    const fee = Math.round(lines.filter((line) => line.kind === "TERM_FEE").reduce((sum, line) => sum + line.taxableMinor, 0) * keep);
    const joining = Math.round(lines.filter((line) => line.kind !== "TERM_FEE").reduce((sum, line) => sum + line.taxableMinor, 0) * keep);
    const paid = payment.paidAt.getTime();
    const bucket = out.get(payment.currency) ?? empty(payment.currency);
    out.set(payment.currency, bucket);
    const inYear = paid >= from && paid < to;
    if (inYear) bucket.receivedOnReceipt += joining;

    const term = payment.termId ? termById.get(payment.termId) : undefined;
    if (!term?.startsAt || !term.endsAt || term.endsAt <= term.startsAt) {
      // Lifetime or undated: income when received.
      if (inYear) bucket.receivedOnReceipt += fee;
      continue;
    }
    const start = term.startsAt.getTime();
    const end = term.endsAt.getTime();
    const [before, within, after] = apportion(fee, [overlap(start, end, -Infinity, from), overlap(start, end, from, to), overlap(start, end, to, Infinity)]);
    bucket.earned += within;
    if (inYear) bucket.received += fee;
    if (paid < from) bucket.advanceOpening += within + after;
    if (paid < to) bucket.advanceClosing += after;
    if (paid >= from) bucket.arrearsOpening += before;
    if (paid >= to) bucket.arrearsClosing += before + within;
  }
  return [...out.values()].sort((a, b) => (a.currency === primary ? -1 : b.currency === primary ? 1 : a.currency.localeCompare(b.currency)));
}

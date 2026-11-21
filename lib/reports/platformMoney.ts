/**
 * Platform money by currency, pure over grouped rows. Amounts are integer minor units and are never added
 * across currencies: every figure sits under its own currency. Collected is settled (PAID) payments by paid date;
 * refunds are processed refunds by refund date; net is collected less refunds; online is a gateway (Razorpay or
 * Stripe), in hand is an offline payment. Outstanding is what is owed now (open payments and unpaid terms).
 * Definitions: docs/REPORTS.md "Platform analytics".
 */
import type { Bucket } from "./period";
import { compare, type Comparison } from "./platformRange";

/** Settled payments grouped by bucket start, currency and provider (SQL does the grouping). */
export type PaymentGroup = { bucket: Date; currency: string; provider: string; amountMinor: number; count: number };
/** Processed refunds grouped by bucket start and currency. */
export type RefundGroup = { bucket: Date; currency: string; amountMinor: number; count: number };
export type OutstandingRow = { currency: string; amountMinor: number };

export type MoneyPoint = { key: string; label: string; collected: number; refunds: number; net: number; online: number; inHand: number };
export type CurrencyMoney = {
  currency: string;
  collected: number;
  refunds: number;
  net: number;
  online: number;
  inHand: number;
  outstanding: number;
  payments: number;
  comparison: { collected: Comparison; refunds: Comparison; net: Comparison; online: Comparison; inHand: Comparison };
  points: MoneyPoint[];
};

const isOnline = (provider: string) => provider !== "OFFLINE";

/** The bucket key a grouped row's start falls under: YYYY-MM-DD by day, YYYY-MM by month (UTC). */
export function bucketKey(start: Date, unit: "day" | "month"): string {
  return start.toISOString().slice(0, unit === "day" ? 10 : 7);
}

type Sums = { collected: number; refunds: number; online: number; inHand: number; payments: number };
const empty = (): Sums => ({ collected: 0, refunds: 0, online: 0, inHand: 0, payments: 0 });

function addPayment(sums: Sums, row: PaymentGroup) {
  sums.collected += row.amountMinor;
  sums.payments += row.count;
  if (isOnline(row.provider)) sums.online += row.amountMinor;
  else sums.inHand += row.amountMinor;
}

export function platformMoney(input: {
  buckets: Bucket[];
  unit: "day" | "month";
  payments: PaymentGroup[];
  refunds: RefundGroup[];
  previousPayments: PaymentGroup[];
  previousRefunds: RefundGroup[];
  outstanding: OutstandingRow[];
}): CurrencyMoney[] {
  const currencies = new Set<string>();
  for (const row of [...input.payments, ...input.refunds, ...input.previousPayments, ...input.previousRefunds, ...input.outstanding]) currencies.add(row.currency);
  const result = [...currencies].map((currency): CurrencyMoney => {
    const now = empty();
    const before = empty();
    const byKey = new Map<string, Sums>();
    const slot = (key: string) => byKey.get(key) ?? byKey.set(key, empty()).get(key)!;
    for (const row of input.payments) if (row.currency === currency) { addPayment(now, row); addPayment(slot(bucketKey(row.bucket, input.unit)), row); }
    for (const row of input.refunds) if (row.currency === currency) { now.refunds += row.amountMinor; slot(bucketKey(row.bucket, input.unit)).refunds += row.amountMinor; }
    for (const row of input.previousPayments) if (row.currency === currency) addPayment(before, row);
    for (const row of input.previousRefunds) if (row.currency === currency) before.refunds += row.amountMinor;
    const points = input.buckets.map((bucket): MoneyPoint => {
      const sums = byKey.get(bucket.key) ?? empty();
      return { key: bucket.key, label: bucket.label, collected: sums.collected, refunds: sums.refunds, net: sums.collected - sums.refunds, online: sums.online, inHand: sums.inHand };
    });
    return {
      currency,
      collected: now.collected,
      refunds: now.refunds,
      net: now.collected - now.refunds,
      online: now.online,
      inHand: now.inHand,
      outstanding: input.outstanding.filter((row) => row.currency === currency).reduce((sum, row) => sum + row.amountMinor, 0),
      payments: now.payments,
      comparison: {
        collected: compare(now.collected, before.collected),
        refunds: compare(now.refunds, before.refunds),
        net: compare(now.collected - now.refunds, before.collected - before.refunds),
        online: compare(now.online, before.online),
        inHand: compare(now.inHand, before.inHand),
      },
      points,
    };
  });
  return result.sort((a, b) => Math.abs(b.collected) - Math.abs(a.collected) || b.outstanding - a.outstanding || a.currency.localeCompare(b.currency));
}

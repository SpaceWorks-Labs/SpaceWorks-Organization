/**
 * B9 outstanding with ageing, collection rate, and B8 the offline confirmation queue. Pure. Definitions:
 * docs/REPORTS.md "Outstanding", "Collection rate" and "Offline confirmation".
 */
import { median } from "../dataset";
import { totals, type CurrencyTotal } from "../money";
import type { FinancePayment, FinanceRows } from "./types";
import type { Window } from "./revenue";

const DAY_MS = 86_400_000;

const AGEING_BUCKETS = [
  { key: "current", label: "Not yet due", min: -Infinity, max: 0 },
  { key: "0-30", label: "0–30 days", min: 0, max: 31 },
  { key: "31-60", label: "31–60 days", min: 31, max: 61 },
  { key: "61-90", label: "61–90 days", min: 61, max: 91 },
  { key: "90+", label: "Over 90 days", min: 91, max: Infinity },
] as const;
type AgeingKey = (typeof AGEING_BUCKETS)[number]["key"];

type OutstandingItem = {
  kind: "payment" | "unpaid-term";
  id: string;
  memberId: string;
  planId: string | null;
  unitId: string | null;
  status: "PENDING" | "AWAITING_CONFIRMATION" | "UNPAID_TERM";
  currency: string;
  amountMinor: number;
  /** The date the money was due: the term's payment deadline, else when the charge was raised. */
  dueAt: Date;
  /** Whole days past `dueAt` (negative before it is due). */
  daysPastDue: number;
  bucket: AgeingKey;
};

export function ageingBucket(daysPastDue: number): AgeingKey {
  return AGEING_BUCKETS.find((bucket) => daysPastDue >= bucket.min && daysPastDue < bucket.max)?.key ?? "90+";
}

/**
 * Everything owed right now: payments still PENDING or AWAITING_CONFIRMATION, plus PENDING_PAYMENT terms
 * with no Payment row. `termDueBy` gives a payment its term's deadline when it has one.
 */
export function outstandingItems(rows: FinanceRows, now: Date, termDueBy: Map<string, Date | null> = new Map()): OutstandingItem[] {
  const item = (base: Omit<OutstandingItem, "daysPastDue" | "bucket">): OutstandingItem => {
    const daysPastDue = Math.floor((now.getTime() - base.dueAt.getTime()) / DAY_MS);
    return { ...base, daysPastDue, bucket: base.dueAt > now ? "current" : ageingBucket(daysPastDue) };
  };
  const payments = rows.payments
    .filter((payment) => payment.status === "PENDING" || payment.status === "AWAITING_CONFIRMATION")
    .map((payment) => item({
      kind: "payment", id: payment.id, memberId: payment.memberId, planId: payment.planId, unitId: payment.unitId,
      status: payment.status as "PENDING" | "AWAITING_CONFIRMATION", currency: payment.currency, amountMinor: payment.amountMinor,
      dueAt: (payment.termId ? termDueBy.get(payment.termId) : null) ?? payment.createdAt,
    }));
  const terms = rows.unpaidTerms.map((term) => item({
    kind: "unpaid-term", id: term.termId, memberId: term.memberId, planId: term.planId, unitId: term.unitId,
    status: "UNPAID_TERM", currency: term.currency, amountMinor: term.amountMinor, dueAt: term.paymentDueBy ?? term.createdAt,
  }));
  return [...payments, ...terms].sort((a, b) => b.daysPastDue - a.daysPastDue);
}

type AgeingRow = { key: AgeingKey; label: string; count: number; totals: CurrencyTotal[] };

export function ageingTable(items: OutstandingItem[], primary?: string): AgeingRow[] {
  return AGEING_BUCKETS.map((bucket) => {
    const inBucket = items.filter((entry) => entry.bucket === bucket.key);
    return { key: bucket.key, label: bucket.label, count: inBucket.length, totals: totals(inBucket, (entry) => ({ currency: entry.currency, minor: entry.amountMinor }), primary) };
  });
}

/**
 * Collection rate: of the charges raised in the window (payments created, and unpaid terms opened), the
 * share by value already paid, per currency. Cancelled and failed attempts are not charges; a failed
 * attempt is usually retried as a new payment.
 */
export function collectionRate(rows: FinanceRows, window: Window, primary?: string): Array<{ currency: string; raised: number; paid: number; rate: number | null }> {
  const inWindow = (instant: Date) => instant >= window.from && instant < window.to;
  const raised = rows.payments.filter((payment) => inWindow(payment.createdAt) && !["CANCELLED", "FAILED", "WAIVED"].includes(payment.status));
  const raisedTotals = totals([...raised.map((p) => ({ currency: p.currency, minor: p.amountMinor })), ...rows.unpaidTerms.filter((term) => inWindow(term.createdAt)).map((t) => ({ currency: t.currency, minor: t.amountMinor }))], (entry) => entry, primary);
  const paidTotals = totals(raised.filter((payment) => payment.status === "PAID"), (p) => ({ currency: p.currency, minor: p.amountMinor }), primary);
  return raisedTotals.map((entry) => {
    const paid = paidTotals.find((candidate) => candidate.currency === entry.currency)?.minor ?? 0;
    return { currency: entry.currency, raised: entry.minor, paid, rate: entry.minor > 0 ? paid / entry.minor : null };
  });
}

type OfflineQueue = {
  /** Offline claims waiting for a treasurer, oldest first. */
  awaiting: FinancePayment[];
  awaitingTotals: CurrencyTotal[];
  /** Any payment flagged for review (amount mismatch, late capture, suspended organisation…). */
  flagged: FinancePayment[];
  /** Offline payments paid in the window. */
  confirmed: number;
  /** …confirmed by someone other than the person who recorded them (maker-checker held). */
  checkedByAnother: number;
  /** …confirmed by the person who recorded them (allowed only when maker-checker is off). */
  selfConfirmed: number;
  medianHoursToConfirm: number | null;
};

export function offlineQueue(rows: FinanceRows, window: Window, primary?: string): OfflineQueue {
  const awaiting = rows.payments.filter((payment) => payment.status === "AWAITING_CONFIRMATION").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const confirmed = rows.payments.filter((payment) => payment.provider === "OFFLINE" && payment.status === "PAID" && payment.paidAt && payment.paidAt >= window.from && payment.paidAt < window.to);
  const checked = confirmed.filter((payment) => payment.confirmedById && payment.recordedById && payment.confirmedById !== payment.recordedById);
  const self = confirmed.filter((payment) => payment.confirmedById && payment.confirmedById === payment.recordedById);
  return {
    awaiting,
    awaitingTotals: totals(awaiting, (payment) => ({ currency: payment.currency, minor: payment.amountMinor }), primary),
    flagged: rows.payments.filter((payment) => payment.flagged),
    confirmed: confirmed.length,
    checkedByAnother: checked.length,
    selfConfirmed: self.length,
    medianHoursToConfirm: median(confirmed.map((payment) => (payment.paidAt!.getTime() - payment.createdAt.getTime()) / 3_600_000)),
  };
}

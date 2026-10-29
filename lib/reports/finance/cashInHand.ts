/**
 * Cash in hand: offline money the team recorded, per collector and per unit, so treasurers can see who holds what.
 * Pure and client-safe; rows come from lib/reports/finance/source.ts `loadOfflineCollections`. Definition in
 * docs/REPORTS.md "Cash in hand". Every figure is per currency, the organisation's first; currencies never add.
 */
import { totalsByCurrency } from "@/lib/money/currencies";
import { amountIn, type CurrencyTotal } from "../money";

/** One offline payment someone recorded (not a waiver), with the member's own account to tell claims apart. */
export type OfflineCollection = {
  id: string;
  memberId: string;
  /** The member's unit. */
  unitId: string | null;
  /** The member's own account; a payment recorded by it is the member's claim, not staff collection. */
  /** The member's own "I've paid" claim, not money staff took. */
  memberClaim: boolean;
  recordedById: string;
  status: "PAID" | "AWAITING_CONFIRMATION";
  currency: string;
  amountMinor: number;
  /** Refunded (or being refunded) so far, in the payment's currency. */
  refundedMinor: number;
  createdAt: Date;
};

export type CashGroup = {
  key: string;
  /** Recorded money net of refunds, confirmed or not. */
  held: CurrencyTotal[];
  /** The part still waiting for a second person to confirm. */
  awaiting: CurrencyTotal[];
  payments: number;
  /** When the oldest payment in the group was recorded. */
  oldest: Date;
};

type CashInHand = { byCollector: CashGroup[]; byUnit: CashGroup[]; held: CurrencyTotal[]; awaiting: CurrencyTotal[]; payments: number };

/** Money a member of staff took: anything staff recorded, never a member's own claim (even when the member is staff). */
export function staffCollected(row: Pick<OfflineCollection, "memberClaim">): boolean {
  return !row.memberClaim;
}

const net = (row: OfflineCollection) => ({ currency: row.currency, minor: row.amountMinor - row.refundedMinor });

function group(rows: OfflineCollection[], key: (row: OfflineCollection) => string, primary?: string): CashGroup[] {
  const groups = new Map<string, OfflineCollection[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return [...groups.entries()]
    .map(([k, list]) => ({
      key: k,
      held: totalsByCurrency(list.map(net), primary),
      awaiting: totalsByCurrency(list.filter((row) => row.status === "AWAITING_CONFIRMATION").map(net), primary),
      payments: list.length,
      oldest: new Date(list.reduce((least, row) => Math.min(least, row.createdAt.getTime()), Infinity)),
    }))
    .sort((a, b) => (primary ? amountIn(b.held, primary) - amountIn(a.held, primary) : 0) || a.oldest.getTime() - b.oldest.getTime() || a.key.localeCompare(b.key));
}

/** Staff-recorded offline money recorded in [from, to), net of its refunds, per collector and per member's unit. */
export function cashInHand(rows: OfflineCollection[], window: { from: Date; to: Date }, primary?: string): CashInHand {
  const inWindow = rows.filter((row) => staffCollected(row) && row.createdAt >= window.from && row.createdAt < window.to);
  return {
    byCollector: group(inWindow, (row) => row.recordedById, primary),
    byUnit: group(inWindow, (row) => row.unitId ?? "none", primary),
    held: totalsByCurrency(inWindow.map(net), primary),
    awaiting: totalsByCurrency(inWindow.filter((row) => row.status === "AWAITING_CONFIRMATION").map(net), primary),
    payments: inWindow.length,
  };
}

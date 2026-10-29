/**
 * Renewal revenue forecast and forecast vs actual, plus the platform's payment volume (A4) and a member's
 * own payments and receipts (C3). Pure. Definitions: docs/REPORTS.md "Forecast", "A4" and "C3".
 */
import { bucketIndex, type Bucket } from "../period";
import { totals, type CurrencyTotal } from "../money";
import type { FinancePayment, FinancePlan, FinanceRows, PaymentProvider } from "./types";

type ForecastTerm = { id: string; planId: string; memberId: string; endsAt: Date | null; renewed: boolean; active: boolean; renewedFromId: string | null };

type ForecastWindow = { days: number; terms: number; atStake: CurrencyTotal[]; expected: CurrencyTotal[] };

/**
 * Expected renewal revenue in the next 30, 60 and 90 days: active terms ending in that time with nothing
 * renewing them yet, at their plan's renewal price ("at stake"), and that times the trailing renewal rate
 * ("expected"). Free plans add nothing.
 */
export function renewalForecast(terms: ForecastTerm[], plans: FinancePlan[], now: Date, renewalRate: number | null, primary?: string, horizons = [30, 60, 90]): ForecastWindow[] {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  return horizons.map((days) => {
    const limit = now.getTime() + days * 86_400_000;
    const due = terms.filter((term) => term.active && !term.renewed && term.endsAt && term.endsAt.getTime() >= now.getTime() && term.endsAt.getTime() < limit);
    const priced = due.flatMap((term) => {
      const plan = planById.get(term.planId);
      return plan && plan.priceRenewalMinor > 0 ? [{ currency: plan.currency, minor: plan.priceRenewalMinor }] : [];
    });
    const atStake = totals(priced, (entry) => entry, primary);
    return { days, terms: due.length, atStake, expected: atStake.map((entry) => ({ currency: entry.currency, minor: Math.round(entry.minor * (renewalRate ?? 0)) })) };
  });
}

/**
 * For each past month: the renewal value that fell due (terms ending that month, at the plan's renewal
 * price) against what was actually collected for renewals of those terms, by any date.
 */
export function forecastVsActual(terms: ForecastTerm[], plans: FinancePlan[], rows: Pick<FinanceRows, "payments">, buckets: Bucket[], primary?: string) {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const termById = new Map(terms.map((term) => [term.id, term]));
  const due = buckets.map(() => [] as CurrencyTotal[]);
  const actual = buckets.map(() => [] as CurrencyTotal[]);
  for (const term of terms) {
    const plan = planById.get(term.planId);
    if (!term.endsAt || !plan || plan.priceRenewalMinor <= 0) continue;
    const index = bucketIndex(buckets, term.endsAt);
    if (index >= 0) due[index].push({ currency: plan.currency, minor: plan.priceRenewalMinor });
  }
  for (const payment of rows.payments) {
    if (payment.status !== "PAID" || !payment.termId) continue;
    const renewal = termById.get(payment.termId);
    const previous = renewal?.renewedFromId ? termById.get(renewal.renewedFromId) : undefined;
    if (!previous?.endsAt) continue;
    const index = bucketIndex(buckets, previous.endsAt);
    if (index >= 0) actual[index].push({ currency: payment.currency, minor: payment.amountMinor });
  }
  return buckets.map((bucket, index) => ({ key: bucket.key, label: bucket.label, due: totals(due[index], (e) => e, primary), actual: totals(actual[index], (e) => e, primary) }));
}

type VolumeRow = { currency: string; payments: number; minor: number; organisations: number; byProvider: Record<PaymentProvider, number> };

/** A4: paid payment volume across organisations, per currency (never converted). */
export function paymentVolume(payments: Array<FinancePayment & { organisationId: string }>, window: { from: Date; to: Date }): VolumeRow[] {
  const rows = new Map<string, VolumeRow & { orgs: Set<string> }>();
  for (const payment of payments) {
    if (payment.status !== "PAID" || !payment.paidAt || payment.paidAt < window.from || payment.paidAt >= window.to) continue;
    const row = rows.get(payment.currency) ?? { currency: payment.currency, payments: 0, minor: 0, organisations: 0, byProvider: { RAZORPAY: 0, STRIPE: 0, OFFLINE: 0 }, orgs: new Set<string>() };
    row.payments += 1;
    row.minor += payment.amountMinor;
    row.byProvider[payment.provider] += payment.amountMinor;
    row.orgs.add(payment.organisationId);
    rows.set(payment.currency, row);
  }
  return [...rows.values()].map(({ orgs, ...row }) => ({ ...row, organisations: orgs.size })).sort((a, b) => b.payments - a.payments || a.currency.localeCompare(b.currency));
}

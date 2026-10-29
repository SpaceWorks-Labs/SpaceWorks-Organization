/**
 * Small pure shapers for the analytics views (H6 dashboard home, H7 platform pages). Client-safe. Money is
 * always per currency, never added across currencies. Definitions: docs/REPORTS.md "Analytics".
 */
import { addDays, localDate, startOfLocalDay } from "@/lib/membership/periods";
import { amountIn, currenciesOf, type CurrencyTotal } from "./money";

type MoneyPoint = { key: string; label: string; gross: CurrencyTotal[]; refunds: CurrencyTotal[]; net: CurrencyTotal[] };
type CurrencySeries = { currency: string; points: Array<{ key: string; label: string; gross: number; refunds: number; net: number }> };

/** Split per-bucket money lists into one series per currency (default currency first), for one chart each. */
export function seriesByCurrency(points: MoneyPoint[], primary?: string): CurrencySeries[] {
  const currencies = currenciesOf(points.flatMap((point) => [...point.gross, ...point.refunds]), primary);
  return currencies.map((currency) => ({
    currency,
    points: points.map((point) => ({ key: point.key, label: point.label, gross: amountIn(point.gross, currency), refunds: amountIn(point.refunds, currency), net: amountIn(point.net, currency) })),
  }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The end of the "next `days` days" window: local midnight `days` days after today. */
export function dueWindowEnd(now: Date, timezone: string, days = 30): Date {
  return startOfLocalDay(addDays(localDate(now, timezone), days), timezone);
}

/**
 * Memberships ending in the next `days` local days (today included), in week-long buckets of local days (the
 * last one shorter), labelled "29 Oct to 4 Nov".
 */
export function dueByWeek(ends: Date[], now: Date, timezone: string, days = 30): Array<{ label: string; count: number }> {
  const today = localDate(now, timezone);
  const name = (date: { month: number; day: number }) => `${date.day} ${MONTHS[date.month - 1]}`;
  const buckets: Array<{ from: Date; to: Date; label: string; count: number }> = [];
  for (let start = 0; start < days; start += 7) {
    const first = addDays(today, start);
    const last = addDays(today, Math.min(days, start + 7) - 1);
    buckets.push({ from: startOfLocalDay(first, timezone), to: startOfLocalDay(addDays(last, 1), timezone), label: `${name(first)} to ${name(last)}`, count: 0 });
  }
  for (const end of ends) {
    const bucket = buckets.find((entry) => end >= entry.from && end < entry.to);
    if (bucket) bucket.count += 1;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

type DayStock = { day: Date; active: number; grace: number; expired: number; joined: number; lapsed: number; renewed: number };
type MonthWindow = { key: string; label: string; first: Date; last: Date };

/**
 * Monthly points from daily rollup sums (one row per day, units already added): stocks from the month's last
 * rolled-up day, flows summed over the month. A month with no rolled-up day has null stocks.
 */
export function monthlyFromDays(days: DayStock[], months: MonthWindow[]) {
  return months.map((month) => {
    const inside = days.filter((row) => row.day >= month.first && row.day <= month.last).sort((a, b) => a.day.getTime() - b.day.getTime());
    const close = inside.at(-1);
    const sum = (key: "joined" | "lapsed" | "renewed") => inside.reduce((total, row) => total + row[key], 0);
    return { key: month.key, label: month.label, active: close?.active ?? null, grace: close?.grace ?? null, expired: close?.expired ?? null, joined: sum("joined"), lapsed: sum("lapsed"), renewed: sum("renewed") };
  });
}

/** The last `count` calendar months as rollup day ranges (UTC dates, as the rollup stores days), oldest first. */
export function rollupMonths(now: Date, count = 12): MonthWindow[] {
  // Local days run up to a day ahead of UTC, so the current month reaches tomorrow (UTC).
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const out: MonthWindow[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0));
    out.push({ key: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`, label: `${MONTHS[first.getUTCMonth()]} ${String(first.getUTCFullYear()).slice(2)}`, first, last: end > today ? today : end });
  }
  return out;
}

/** Renewal rate from rollup flows: renewals activated ÷ (renewals activated + lapses), or null with nothing decided. */
export function rollupRenewalRate(renewed: number, lapsed: number): number | null {
  return renewed + lapsed > 0 ? renewed / (renewed + lapsed) : null;
}

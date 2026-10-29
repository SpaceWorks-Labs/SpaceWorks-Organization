/**
 * Report periods. Pure and client-safe. A period is a half-open range of instants [from, to) whose
 * boundaries are local midnights in the organisation's timezone, so "FY 2026-27" in Asia/Kolkata runs
 * from 1 April 2026 00:00 IST to 1 April 2027 00:00 IST. Definitions: docs/REPORTS.md.
 */
import { addDays, addMonths, financialYearLabel, financialYearStart, localDate, startOfLocalDay, type CalendarDate } from "@/lib/membership/periods";

export type OrgCalendar = { timezone: string; financialYearStartMonth: number };

const PERIOD_PRESETS = ["fy", "last-fy", "12m", "90d", "30d", "month", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export type ReportPeriod = {
  preset: PeriodPreset;
  from: Date;
  /** Exclusive. Never later than the end of today, so "this year" stops at now. */
  to: Date;
  /** First and last calendar day covered, in the organisation's timezone. */
  firstDay: CalendarDate;
  lastDay: CalendarDate;
  label: string;
  /** The same-length period just before, for deltas. */
  previous: { from: Date; to: Date };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function parseDayKey(value: string | undefined | null): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (check.getUTCMonth() !== date.month - 1 || date.year < 2000 || date.year > 2100) return null;
  return date;
}

function formatDay(date: CalendarDate): string {
  return `${date.day} ${MONTHS[date.month - 1]} ${date.year}`;
}

/** "FY 2026-27" (or "FY 2026" for calendar-year organisations) for the year containing `date`. */
export function fyLabel(date: CalendarDate, startMonth: number): string {
  return `FY ${financialYearLabel(date, startMonth)}`;
}

function compare(a: CalendarDate, b: CalendarDate) {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/**
 * Resolve a period from query parameters. Unknown presets fall back to the current financial year; a
 * custom range needs both days, in order, and at most ten years apart.
 */
export function resolvePeriod(input: { period?: string; from?: string; to?: string }, calendar: OrgCalendar, now: Date): ReportPeriod {
  const tz = calendar.timezone;
  const today = localDate(now, tz);
  const tomorrow = addDays(today, 1);
  let preset: PeriodPreset = (PERIOD_PRESETS as readonly string[]).includes(input.period ?? "") ? (input.period as PeriodPreset) : "fy";
  let first: CalendarDate;
  let endExclusive: CalendarDate;
  let label: string;
  const fyStart = financialYearStart(today, calendar.financialYearStartMonth);
  switch (preset) {
    case "last-fy": {
      first = addMonths(fyStart, -12);
      endExclusive = fyStart;
      label = fyLabel(first, calendar.financialYearStartMonth);
      break;
    }
    case "12m":
      first = addDays(addMonths(today, -12), 1);
      endExclusive = tomorrow;
      label = "Last 12 months";
      break;
    case "90d":
      first = addDays(today, -89);
      endExclusive = tomorrow;
      label = "Last 90 days";
      break;
    case "30d":
      first = addDays(today, -29);
      endExclusive = tomorrow;
      label = "Last 30 days";
      break;
    case "month":
      first = { year: today.year, month: today.month, day: 1 };
      endExclusive = tomorrow;
      label = `${MONTHS[today.month - 1]} ${today.year}`;
      break;
    case "custom": {
      const from = parseDayKey(input.from);
      const to = parseDayKey(input.to);
      if (from && to && compare(from, to) <= 0 && to.year - from.year <= 10) {
        first = from;
        endExclusive = addDays(to, 1);
        label = `${formatDay(from)} to ${formatDay(to)}`;
        break;
      }
      preset = "fy";
      first = fyStart;
      endExclusive = tomorrow;
      label = fyLabel(fyStart, calendar.financialYearStartMonth);
      break;
    }
    default:
      first = fyStart;
      endExclusive = tomorrow;
      label = fyLabel(fyStart, calendar.financialYearStartMonth);
  }
  const from = startOfLocalDay(first, tz);
  const to = startOfLocalDay(endExclusive, tz);
  const span = to.getTime() - from.getTime();
  return {
    preset,
    from,
    to,
    firstDay: first,
    lastDay: addDays(endExclusive, -1),
    label,
    previous: { from: new Date(from.getTime() - span), to: from },
  };
}

export type Bucket = { key: string; label: string; from: Date; to: Date };

/**
 * Calendar buckets covering a period: days for up to 45 days, otherwise months (local midnights).
 * The first and last bucket are clipped to the period.
 */
export function periodBuckets(period: Pick<ReportPeriod, "from" | "to" | "firstDay">, timezone: string, unit?: "day" | "month"): Bucket[] {
  const days = Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000);
  const step = unit ?? (days <= 45 ? "day" : "month");
  const buckets: Bucket[] = [];
  let cursor: CalendarDate = step === "day" ? period.firstDay : { year: period.firstDay.year, month: period.firstDay.month, day: 1 };
  for (let guard = 0; guard < 4000; guard += 1) {
    const next = step === "day" ? addDays(cursor, 1) : addMonths(cursor, 1);
    const start = startOfLocalDay(cursor, timezone);
    const end = startOfLocalDay(next, timezone);
    if (start >= period.to) break;
    buckets.push({
      key: step === "day" ? dayKey(cursor) : `${cursor.year}-${String(cursor.month).padStart(2, "0")}`,
      label: step === "day" ? `${cursor.day} ${MONTHS[cursor.month - 1]}` : `${MONTHS[cursor.month - 1]} ${String(cursor.year).slice(2)}`,
      from: start < period.from ? period.from : start,
      to: end > period.to ? period.to : end,
    });
    cursor = next;
  }
  return buckets;
}

/** Index of the bucket an instant falls in, or -1. Buckets are sorted and contiguous. */
export function bucketIndex(buckets: Bucket[], instant: Date): number {
  const t = instant.getTime();
  let low = 0;
  let high = buckets.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (t < buckets[mid].from.getTime()) high = mid - 1;
    else if (t >= buckets[mid].to.getTime()) low = mid + 1;
    else return mid;
  }
  return -1;
}

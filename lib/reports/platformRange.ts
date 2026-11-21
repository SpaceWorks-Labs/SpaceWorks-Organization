/**
 * The range picker for the platform analytics pages and the period comparison. Pure and client-safe. Ranges run
 * in UTC (the platform has no single timezone): 30 days and 90 days by day, 12 months and the financial year
 * (April to March) by month. The comparison period is the same length just before, so "financial year to date"
 * is set against the same number of days before 1 April. Definitions: docs/REPORTS.md "Platform analytics".
 */
import { periodBuckets, resolvePeriod, type Bucket } from "./period";

export const PLATFORM_RANGES = ["30d", "90d", "12m", "fy"] as const;
export type PlatformRange = (typeof PLATFORM_RANGES)[number];
export const DEFAULT_PLATFORM_RANGE: PlatformRange = "12m";

const CALENDAR = { timezone: "UTC", financialYearStartMonth: 4 } as const;

export type PlatformWindow = {
  range: PlatformRange;
  label: string;
  /** Half-open [from, to), UTC midnights; `to` is the start of tomorrow. */
  from: Date;
  to: Date;
  previous: { from: Date; to: Date };
  unit: "day" | "month";
  buckets: Bucket[];
};

export function parsePlatformRange(value: string | undefined | null): PlatformRange {
  return (PLATFORM_RANGES as readonly string[]).includes(value ?? "") ? (value as PlatformRange) : DEFAULT_PLATFORM_RANGE;
}

export function platformWindow(input: string | undefined | null, now: Date): PlatformWindow {
  const range = parsePlatformRange(input);
  const period = resolvePeriod({ period: range }, CALENDAR, now);
  const unit = range === "30d" || range === "90d" ? "day" : "month";
  return { range, label: period.label, from: period.from, to: period.to, previous: period.previous, unit, buckets: periodBuckets(period, CALENDAR.timezone, unit) };
}

/** A headline number set against the previous period. `delta` is current less previous; `pct` is null when the previous was 0 or missing. */
export type Comparison = { current: number | null; previous: number | null; delta: number | null; pct: number | null };

export function compare(current: number | null, previous: number | null): Comparison {
  const both = current !== null && previous !== null;
  return { current, previous, delta: both ? current - previous : null, pct: both && previous > 0 ? (current - previous) / previous : null };
}

/** A rate (0 to 1) set against the previous period: `delta` is in rate points (0.05 is five points), never a percentage change. */
export function compareRate(current: number | null, previous: number | null): Comparison {
  return { ...compare(current, previous), pct: null };
}

/** `part` over `whole`, or null with nothing to divide by. */
export function rate(part: number, whole: number | null): number | null {
  return whole !== null && whole > 0 ? part / whole : null;
}

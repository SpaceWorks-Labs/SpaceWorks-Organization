/**
 * Time series for the trend charts and cohort retention. Pure. Buckets come from lib/reports/period.ts.
 * Definitions: docs/REPORTS.md "Trends" and "Cohort retention".
 */
import { addMonths, financialYearLabel, financialYearStart, localDate, startOfLocalDay } from "@/lib/membership/periods";
import { bucketIndex, type Bucket } from "../period";
import { ratio, type Dataset } from "../dataset";
import { renewalOutcomes } from "./flows";
import { closingInstant, firstActivation, lapseInstant, standingAt } from "./standing";

type TrendPoint = { key: string; label: string; active: number; grace: number; joined: number; reactivated: number; lapsed: number; due: number; renewed: number; decided: number; renewalRate: number | null };

/** Stocks at each bucket's close and flows inside it. Buckets after `now` are dropped. */
export function membershipTrend(data: Dataset, buckets: Bucket[], now: Date): TrendPoint[] {
  const live = buckets.filter((bucket) => bucket.from <= now);
  const points: TrendPoint[] = live.map((bucket) => ({ key: bucket.key, label: bucket.label, active: 0, grace: 0, joined: 0, reactivated: 0, lapsed: 0, due: 0, renewed: 0, decided: 0, renewalRate: null }));
  if (!live.length) return points;
  for (const [, terms] of data.termsByMember) {
    live.forEach((bucket, index) => {
      const standing = standingAt(terms, closingInstant(bucket.to, now));
      if (standing === "ACTIVE") points[index].active += 1;
      else if (standing === "GRACE") points[index].grace += 1;
    });
    const first = firstActivation(terms);
    const joinedAt = first && first <= now ? bucketIndex(live, first) : -1;
    if (joinedAt >= 0) points[joinedAt].joined += 1;
    const lapsedIn = new Set<number>();
    for (const term of terms) {
      const lapse = lapseInstant(term);
      if (lapse && lapse <= now) {
        const index = bucketIndex(live, lapse);
        if (index >= 0) lapsedIn.add(index);
      }
    }
    for (const index of lapsedIn) points[index].lapsed += 1;
  }
  live.forEach((bucket, index) => {
    const outcomes = renewalOutcomes(data, { from: bucket.from, to: bucket.to }, now);
    points[index].due = outcomes.due.length;
    points[index].renewed = outcomes.renewed.length;
    points[index].decided = outcomes.renewed.length + outcomes.lapsed.length;
    points[index].renewalRate = ratio(outcomes.renewed.length, outcomes.renewed.length + outcomes.lapsed.length);
  });
  return points;
}

type CohortRow = { key: string; label: string; size: number; cells: Array<number | null> };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Join-month cohorts: of the members who first joined in a month, the share still active at the end of
 * each following month (offset 0 is the join month itself). Cells after now are null.
 */
export function cohortRetention(data: Dataset, timezone: string, now: Date, cohorts = 12, offsets = 12): CohortRow[] {
  const today = localDate(now, timezone);
  const firstMonth = addMonths({ year: today.year, month: today.month, day: 1 }, -(cohorts - 1));
  const rows: CohortRow[] = [];
  const byCohort = new Map<string, string[]>();
  for (const [memberId, terms] of data.termsByMember) {
    const first = firstActivation(terms);
    if (!first) continue;
    const day = localDate(first, timezone);
    const key = `${day.year}-${String(day.month).padStart(2, "0")}`;
    byCohort.set(key, [...(byCohort.get(key) ?? []), memberId]);
  }
  for (let index = 0; index < cohorts; index += 1) {
    const month = addMonths(firstMonth, index);
    const key = `${month.year}-${String(month.month).padStart(2, "0")}`;
    const members = byCohort.get(key) ?? [];
    const cells: Array<number | null> = [];
    for (let offset = 0; offset < offsets; offset += 1) {
      const close = startOfLocalDay(addMonths(month, offset + 1), timezone);
      if (startOfLocalDay(addMonths(month, offset), timezone) > now) {
        cells.push(null);
        continue;
      }
      const at = closingInstant(close, now);
      const still = members.filter((id) => standingAt(data.termsByMember.get(id), at) === "ACTIVE").length;
      cells.push(members.length ? still / members.length : null);
    }
    rows.push({ key, label: `${MONTHS[month.month - 1]} ${month.year}`, size: members.length, cells });
  }
  return rows;
}

/**
 * Financial-year cohorts: of the members who first joined in a financial year, the share still active at the
 * end of that year and each later one (offset 0 is the joining year; the current year is read at now).
 */
export function fyCohortRetention(data: Dataset, calendar: { timezone: string; financialYearStartMonth: number }, now: Date, years = 5): CohortRow[] {
  const { timezone, financialYearStartMonth: startMonth } = calendar;
  const current = financialYearStart(localDate(now, timezone), startMonth);
  const firstYear = addMonths(current, -12 * (years - 1));
  const byCohort = new Map<string, string[]>();
  for (const [memberId, terms] of data.termsByMember) {
    const first = firstActivation(terms);
    if (!first) continue;
    const key = financialYearLabel(localDate(first, timezone), startMonth);
    byCohort.set(key, [...(byCohort.get(key) ?? []), memberId]);
  }
  const rows: CohortRow[] = [];
  for (let index = 0; index < years; index += 1) {
    const start = addMonths(firstYear, 12 * index);
    const key = financialYearLabel(start, startMonth);
    const members = byCohort.get(key) ?? [];
    const cells: Array<number | null> = [];
    for (let offset = 0; offset < years; offset += 1) {
      if (startOfLocalDay(addMonths(start, 12 * offset), timezone) > now) {
        cells.push(null);
        continue;
      }
      const at = closingInstant(startOfLocalDay(addMonths(start, 12 * (offset + 1)), timezone), now);
      const still = members.filter((id) => standingAt(data.termsByMember.get(id), at) === "ACTIVE").length;
      cells.push(members.length ? still / members.length : null);
    }
    rows.push({ key, label: `FY ${key}`, size: members.length, cells });
  }
  return rows;
}

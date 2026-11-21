/**
 * Platform growth and health, pure over aggregate rows: the daily rollup summed across organisations, and each
 * organisation's creation date and status. Counts only; nothing about a member. Definitions: docs/REPORTS.md
 * "Platform analytics". Renewal rate is renewals activated over renewals plus lapses (as everywhere in the
 * rollup); churn is lapses over the members active when the period began.
 */
import { rollupRenewalRate } from "./analytics";
import type { Bucket } from "./period";
import { compare, compareRate, rate, type Comparison } from "./platformRange";

/** One rolled-up day summed over every organisation (units and plans already added). */
export type PlatformDay = { day: Date; active: number; grace: number; expired: number; joined: number; reactivated: number; due: number; renewed: number; lapsed: number; applications: number };
export type OrgCreated = { createdAt: Date; status: string };
type Span = { from: Date; to: Date };

const LIVE = new Set(["ACTIVE", "SUSPENDED"]);
const FLOWS = ["joined", "reactivated", "due", "renewed", "lapsed", "applications"] as const;

/** Flows summed over the rollup days inside [from, to). */
export function sumFlows(days: PlatformDay[], span: Span) {
  const sums = { joined: 0, reactivated: 0, due: 0, renewed: 0, lapsed: 0, applications: 0 };
  for (const row of days) {
    if (row.day < span.from || row.day >= span.to) continue;
    for (const key of FLOWS) sums[key] += row[key];
  }
  return sums;
}

/** The latest rolled-up day strictly before `instant`, or null. */
function latestBefore(days: PlatformDay[], instant: Date): PlatformDay | null {
  let best: PlatformDay | null = null;
  for (const row of days) if (row.day < instant && (!best || row.day > best.day)) best = row;
  return best;
}

/** Active members on the latest rolled-up day before `instant` (null with no rollup before it). */
export function activeBefore(days: PlatformDay[], instant: Date): number | null {
  return latestBefore(days, instant)?.active ?? null;
}

/** One period's totals: flows, the active stock at its start and end, renewal rate and churn. */
export function periodTotals(days: PlatformDay[], span: Span) {
  const flows = sumFlows(days, span);
  const activeStart = activeBefore(days, span.from);
  return { ...flows, activeStart, activeEnd: activeBefore(days, span.to), renewalRate: rollupRenewalRate(flows.renewed, flows.lapsed), churnRate: rate(flows.lapsed, activeStart) };
}

/** Per bucket: flows, the closing active and grace stocks, renewal rate and churn against the stock at the bucket's start. */
export function growthSeries(days: PlatformDay[], buckets: Bucket[]) {
  return buckets.map((bucket) => {
    const totals = periodTotals(days, bucket);
    const close = latestBefore(days, bucket.to);
    return {
      key: bucket.key,
      label: bucket.label,
      active: close?.active ?? null,
      grace: close?.grace ?? null,
      joined: totals.joined,
      renewed: totals.renewed,
      lapsed: totals.lapsed,
      reinstated: totals.reactivated,
      renewalRate: totals.renewalRate,
      churnRate: totals.churnRate,
    };
  });
}

/** Organisations created in each bucket, and how many live ones (active or suspended) existed at its end. */
export function organisationSeries(orgs: OrgCreated[], buckets: Bucket[]) {
  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    created: orgs.filter((org) => org.createdAt >= bucket.from && org.createdAt < bucket.to).length,
    live: orgs.filter((org) => LIVE.has(org.status) && org.createdAt < bucket.to).length,
  }));
}

/** Organisations by status now. No history of suspensions is kept, so statuses carry no comparison. */
export function organisationStatuses(orgs: OrgCreated[]) {
  const count = (...statuses: string[]) => orgs.filter((org) => statuses.includes(org.status)).length;
  return { total: orgs.length, active: count("ACTIVE"), suspended: count("SUSPENDED"), pending: count("PENDING_REVIEW", "CHANGES_REQUESTED"), closed: count("REJECTED", "ARCHIVED") };
}

export type GrowthHeadlines = {
  organisationsLive: Comparison;
  organisationsCreated: Comparison;
  membersTotal: Comparison;
  membersActive: Comparison;
  joins: Comparison;
  renewals: Comparison;
  lapses: Comparison;
  reinstatements: Comparison;
  renewalRate: Comparison;
  churnRate: Comparison;
};

/**
 * Every headline number against the previous period. `memberCounts` are all members created before the end of
 * each period (people, never named); `days` must reach back far enough to hold the stock before the previous period.
 */
export function growthHeadlines(input: { days: PlatformDay[]; orgs: OrgCreated[]; memberCounts: { current: number; previous: number }; current: Span; previous: Span }): GrowthHeadlines {
  const now = periodTotals(input.days, input.current);
  const before = periodTotals(input.days, input.previous);
  const live = (end: Date) => input.orgs.filter((org) => LIVE.has(org.status) && org.createdAt < end).length;
  const created = (span: Span) => input.orgs.filter((org) => org.createdAt >= span.from && org.createdAt < span.to).length;
  return {
    organisationsLive: compare(live(input.current.to), live(input.previous.to)),
    organisationsCreated: compare(created(input.current), created(input.previous)),
    membersTotal: compare(input.memberCounts.current, input.memberCounts.previous),
    membersActive: compare(now.activeEnd, before.activeEnd),
    joins: compare(now.joined, before.joined),
    renewals: compare(now.renewed, before.renewed),
    lapses: compare(now.lapsed, before.lapsed),
    reinstatements: compare(now.reactivated, before.reactivated),
    renewalRate: compareRate(now.renewalRate, before.renewalRate),
    churnRate: compareRate(now.churnRate, before.churnRate),
  };
}

/**
 * Applications: the approvals queue, time to approve, and the join funnel. Pure. Definitions:
 * docs/REPORTS.md "Applications".
 */
import { inRange, median, ratio, type Dataset, type PreparedTerm } from "../dataset";
import type { Window } from "./flows";
import { termActiveAt } from "./standing";

const HOUR_MS = 3_600_000;

/** When the term entered PENDING_APPROVAL, and when a manager decided it (approve or decline). */
export function applicationTimes(term: PreparedTerm): { appliedAt: Date | null; decidedAt: Date | null; decision: "approved" | "rejected" | "cancelled" | null } {
  const applied = term.events.find((event) => event.to === "PENDING_APPROVAL");
  if (!applied) return { appliedAt: null, decidedAt: null, decision: null };
  const decided = term.events.find((event) => event.from === "PENDING_APPROVAL" && event.effectiveAt >= applied.effectiveAt);
  if (!decided) return { appliedAt: applied.effectiveAt, decidedAt: null, decision: null };
  const decision = decided.to === "REJECTED" ? "rejected" : decided.to === "CANCELLED" ? "cancelled" : "approved";
  return { appliedAt: applied.effectiveAt, decidedAt: decided.effectiveAt, decision };
}

type ApprovalStats = {
  /** Applications received in the period. */
  received: number;
  approved: number;
  rejected: number;
  withdrawn: number;
  /** Waiting right now, whenever they arrived. */
  waiting: number;
  /** Waiting for more than 7 days right now. */
  waitingOver7Days: number;
  /** Median and 90th percentile hours from application to approval, over approvals decided in the period. */
  medianHoursToApprove: number | null;
  p90HoursToApprove: number | null;
  approvalRate: number | null;
};

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

export function approvalStats(data: Dataset, window: Window, now: Date): ApprovalStats {
  let received = 0;
  let approved = 0;
  let rejected = 0;
  let withdrawn = 0;
  let waiting = 0;
  let waitingOver7Days = 0;
  const hours: number[] = [];
  for (const term of data.terms) {
    const times = applicationTimes(term);
    if (!times.appliedAt) continue;
    if (inRange(times.appliedAt, window.from, window.to)) received += 1;
    if (!times.decision && term.status === "PENDING_APPROVAL") {
      waiting += 1;
      if (now.getTime() - times.appliedAt.getTime() > 7 * 24 * HOUR_MS) waitingOver7Days += 1;
    }
    if (!inRange(times.decidedAt, window.from, window.to)) continue;
    if (times.decision === "approved") {
      approved += 1;
      hours.push((times.decidedAt.getTime() - times.appliedAt.getTime()) / HOUR_MS);
    } else if (times.decision === "rejected") rejected += 1;
    else if (times.decision === "cancelled") withdrawn += 1;
  }
  return {
    received,
    approved,
    rejected,
    withdrawn,
    waiting,
    waitingOver7Days,
    medianHoursToApprove: median(hours),
    p90HoursToApprove: percentile(hours, 0.9),
    approvalRate: ratio(approved, approved + rejected),
  };
}

type FunnelStep = { key: "started" | "approved" | "activated" | "active"; label: string; count: number; dropOff: number | null };

/**
 * New-member terms opened in the period, followed through: started, approved (or needed no approval),
 * activated (paid or free) and still active now. Each step is a subset of the one before.
 */
export function joinFunnel(data: Dataset, window: Window, now: Date): FunnelStep[] {
  const started = data.terms.filter((term) => term.kind === "NEW" && inRange(term.events[0]?.effectiveAt ?? term.createdAt, window.from, window.to));
  const approved = started.filter((term) => {
    const times = applicationTimes(term);
    return times.appliedAt === null ? true : times.decision === "approved";
  });
  const activated = approved.filter((term) => term.activatedAt !== null);
  const active = activated.filter((term) => termActiveAt(term, now));
  const counts = [started.length, approved.length, activated.length, active.length];
  const labels: Array<[FunnelStep["key"], string]> = [["started", "Applied or joined"], ["approved", "Approved"], ["activated", "Paid and started"], ["active", "Active now"]];
  return labels.map(([key, label], index) => ({
    key,
    label,
    count: counts[index],
    dropOff: index === 0 ? null : ratio(counts[index - 1] - counts[index], counts[index - 1]),
  }));
}

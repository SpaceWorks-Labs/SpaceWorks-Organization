/**
 * Period metrics: joined, reactivated, due, renewed, lapsed, churn, retention. Pure. Every count is
 * distinct members except Due/Renewed/Open, which count terms (one per member per plan). Definitions:
 * docs/REPORTS.md "Period metrics".
 */
import { inRange, ratio, type Dataset, type PreparedTerm } from "../dataset";
import { closingInstant, firstActivation, isRenewable, lapseInstant, standingAt } from "./standing";

export const DRILL_METRICS = ["active", "grace", "joined", "reactivated", "due", "renewed", "open", "lapsed", "churned", "revoked"] as const;
export type DrillMetric = (typeof DRILL_METRICS)[number];

export type Window = { from: Date; to: Date };

/** A NEW-kind term activated after the member had already lapsed: they came back. */
export function isReactivation(term: PreparedTerm, all: PreparedTerm[]): boolean {
  if (term.kind !== "NEW" || !term.activatedAt) return false;
  return all.some((other) => {
    if (other.id === term.id || !other.activatedAt || other.activatedAt >= term.activatedAt!) return false;
    const lapsed = lapseInstant(other);
    return lapsed !== null && lapsed <= term.activatedAt!;
  });
}

/** Whether `term` is the member's first held term on its plan (for the first-year renewal rate). */
function isFirstOnPlan(term: PreparedTerm, all: PreparedTerm[]): boolean {
  return !all.some((other) => other.planId === term.planId && other.id !== term.id && other.activatedAt && term.activatedAt && other.activatedAt < term.activatedAt);
}

type PeriodSets = Record<DrillMetric, Set<string>>;

type TermOutcomes = { due: PreparedTerm[]; renewed: PreparedTerm[]; lapsed: PreparedTerm[]; open: PreparedTerm[] };

/**
 * Terms that came up for renewal in the window (end date inside it), and what became of each as of `now`:
 * renewed (a held successor, early renewals included), lapsed (grace over, nothing renewed it) or still open.
 */
export function renewalOutcomes(data: Dataset, window: Window, now: Date): TermOutcomes {
  // Due means the end date has arrived: a term ending later in the window is not due yet, even if renewed early.
  const end = new Date(Math.min(window.to.getTime(), now.getTime() + 1));
  const due = data.terms.filter((term) => isRenewable(term) && inRange(term.endsAt, window.from, end));
  const renewed = due.filter((term) => term.renewed);
  const lapsed = due.filter((term) => !term.renewed && (lapseInstant(term) ?? now) <= now);
  const settled = new Set([...renewed, ...lapsed].map((term) => term.id));
  return { due, renewed, lapsed, open: due.filter((term) => !settled.has(term.id)) };
}

/** The members (or, for due/renewed/open, the members holding the terms) behind every period metric. */
export function periodSets(data: Dataset, window: Window, now: Date): PeriodSets {
  const end = closingInstant(window.to, now);
  const flowEnd = new Date(Math.min(window.to.getTime(), now.getTime()));
  const sets = Object.fromEntries(DRILL_METRICS.map((metric) => [metric, new Set<string>()])) as PeriodSets;
  for (const [memberId, terms] of data.termsByMember) {
    const standing = standingAt(terms, end);
    if (standing === "ACTIVE") sets.active.add(memberId);
    if (standing === "GRACE") sets.grace.add(memberId);
    if (inRange(firstActivation(terms), window.from, flowEnd)) sets.joined.add(memberId);
    else if (terms.some((term) => inRange(term.activatedAt, window.from, flowEnd) && isReactivation(term, terms))) sets.reactivated.add(memberId);
    const lapsedHere = terms.some((term) => inRange(lapseInstant(term), window.from, flowEnd));
    if (lapsedHere) {
      sets.lapsed.add(memberId);
      if (standing === null) sets.churned.add(memberId);
    }
    if (terms.some((term) => inRange(term.revokedAt, window.from, flowEnd))) sets.revoked.add(memberId);
  }
  const outcomes = renewalOutcomes(data, window, now);
  for (const term of outcomes.due) sets.due.add(term.memberId);
  for (const term of outcomes.renewed) sets.renewed.add(term.memberId);
  for (const term of outcomes.open) sets.open.add(term.memberId);
  return sets;
}

export type MembershipSummary = {
  activeStart: number;
  activeEnd: number;
  graceEnd: number;
  netChange: number;
  /** (End − Start) ÷ Start. */
  growthRate: number | null;
  joined: number;
  reactivated: number;
  lapsed: number;
  churned: number;
  revoked: number;
  /** Start + joined + reactivated − churned − revoked, and whatever is left (grace timing, members who moved units). */
  otherChange: number;
  due: number;
  renewed: number;
  dueLapsed: number;
  open: number;
  /** Renewed ÷ (renewed + lapsed) among terms due in the period. Open terms wait. */
  renewalRate: number | null;
  firstYearRenewalRate: number | null;
  /** Churned members ÷ Active at the start. */
  churnRate: number | null;
  /** (End − joined − reactivated) ÷ Start: the share of the starting members still active. */
  retentionRate: number | null;
};

export function membershipSummary(data: Dataset, window: Window, now: Date): MembershipSummary {
  const sets = periodSets(data, window, now);
  const startInstant = new Date(window.from.getTime() - 1);
  let activeStart = 0;
  for (const [, terms] of data.termsByMember) if (standingAt(terms, startInstant) === "ACTIVE") activeStart += 1;
  const outcomes = renewalOutcomes(data, window, now);
  const firstYear = (list: PreparedTerm[]) => list.filter((term) => isFirstOnPlan(term, data.termsByMember.get(term.memberId) ?? [])).length;
  const activeEnd = sets.active.size;
  const joined = sets.joined.size;
  const reactivated = sets.reactivated.size;
  const retained = Math.max(0, activeEnd - joined - reactivated);
  return {
    activeStart,
    activeEnd,
    graceEnd: sets.grace.size,
    netChange: activeEnd - activeStart,
    growthRate: ratio(activeEnd - activeStart, activeStart),
    joined,
    reactivated,
    lapsed: sets.lapsed.size,
    churned: sets.churned.size,
    revoked: sets.revoked.size,
    otherChange: activeEnd - (activeStart + joined + reactivated - sets.churned.size - sets.revoked.size),
    due: outcomes.due.length,
    renewed: outcomes.renewed.length,
    dueLapsed: outcomes.lapsed.length,
    open: outcomes.open.length,
    renewalRate: ratio(outcomes.renewed.length, outcomes.renewed.length + outcomes.lapsed.length),
    firstYearRenewalRate: ratio(firstYear(outcomes.renewed), firstYear(outcomes.renewed) + firstYear(outcomes.lapsed)),
    churnRate: ratio(sets.churned.size, activeStart),
    retentionRate: activeStart > 0 ? Math.min(1, retained / activeStart) : null,
  };
}

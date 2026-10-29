/**
 * The daily rollup's arithmetic. Pure: given an organisation's whole dataset and one local day, the
 * OrgDailyStats rows for it. Rows are per (unit, plan) plus an all-plans row (planId null) per unit, so a
 * unit subtree sums its rows and a plan filter picks that plan's rows. Definitions: docs/REPORTS.md "Daily rollup".
 */
import type { Dataset, PreparedTerm } from "./dataset";
import { isReactivation } from "./metrics/flows";
import { expiredAt, firstActivation, lapseInstant, standingAt } from "./metrics/standing";

type DayStatsRow = {
  unitId: string | null;
  planId: string | null;
  active: number;
  grace: number;
  /** Stock: members whose latest membership ended or lapsed, holding no live one on any plan. */
  expired: number;
  joined: number;
  reactivated: number;
  due: number;
  renewed: number;
  lapsed: number;
  applications: number;
};

type Counter = Omit<DayStatsRow, "unitId" | "planId">;
const empty = (): Counter => ({ active: 0, grace: 0, expired: 0, joined: 0, reactivated: 0, due: 0, renewed: 0, lapsed: 0, applications: 0 });
const within = (instant: Date | null, from: Date, to: Date) => instant !== null && instant >= from && instant < to;

function countMember(counter: Counter, terms: PreparedTerm[], from: Date, to: Date, all: PreparedTerm[]) {
  const close = new Date(to.getTime() - 1);
  const standing = standingAt(terms, close);
  if (standing === "ACTIVE") counter.active += 1;
  else if (standing === "GRACE") counter.grace += 1;
  else if (expiredAt(all, terms, close)) counter.expired += 1;
  // On a plan row, "joined" means new to that plan; on the all-plans row, new to the organisation.
  if (within(firstActivation(terms), from, to)) counter.joined += 1;
  else if (terms.some((term) => within(term.activatedAt, from, to) && isReactivation(term, terms))) counter.reactivated += 1;
  if (terms.some((term) => within(lapseInstant(term), from, to))) counter.lapsed += 1;
  for (const term of terms) {
    if (term.activatedAt && term.endsAt && !term.revokedAt && within(term.endsAt, from, to)) counter.due += 1;
    if (term.kind === "RENEWAL" && within(term.activatedAt, from, to)) counter.renewed += 1;
    if (term.events.some((event) => event.to === "PENDING_APPROVAL" && within(event.effectiveAt, from, to))) counter.applications += 1;
  }
}

/** Rows for the local day [from, to). Rows with nothing in them are left out. */
export function computeDayStats(data: Dataset, from: Date, to: Date): DayStatsRow[] {
  const rows = new Map<string, DayStatsRow>();
  const row = (unitId: string | null, planId: string | null) => {
    const key = `${unitId ?? ""}|${planId ?? ""}`;
    let found = rows.get(key);
    if (!found) {
      found = { unitId, planId, ...empty() };
      rows.set(key, found);
    }
    return found;
  };
  for (const [memberId, terms] of data.termsByMember) {
    const unitId = data.memberById.get(memberId)?.unitId ?? null;
    countMember(row(unitId, null), terms, from, to, terms);
    const byPlan = new Map<string, PreparedTerm[]>();
    for (const term of terms) byPlan.set(term.planId, [...(byPlan.get(term.planId) ?? []), term]);
    for (const [planId, planTerms] of byPlan) countMember(row(unitId, planId), planTerms, from, to, terms);
  }
  return [...rows.values()].filter((entry) => entry.active + entry.grace + entry.expired + entry.joined + entry.reactivated + entry.due + entry.renewed + entry.lapsed + entry.applications > 0);
}

/** Add rows together (a unit subtree, or every organisation for the platform reports). */
export function sumStats<T extends Counter>(rows: T[]): Counter {
  const total = empty();
  for (const entry of rows) for (const key of Object.keys(total) as Array<keyof Counter>) total[key] += entry[key];
  return total;
}

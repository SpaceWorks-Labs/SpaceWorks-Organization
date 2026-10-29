/**
 * H7 platform analytics: the organisation comparison table, its sort and CSV, and the platform trends. Pure
 * over aggregate rows: counts and money per organisation, never a member's name or contact details. Money is
 * per currency and never added across currencies. Definitions: docs/REPORTS.md "Platform analytics".
 */
import { amountIn, csvAmount, totals, type CurrencyTotal } from "./money";
import { ratio } from "./dataset";
import { rollupRenewalRate } from "./analytics";

const DORMANT_DAYS = 60;
const DAY = 86_400_000;

export type OrgFacts = {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  members: number;
  memberLimit: number | null;
  team: number;
  managerLimit: number | null;
  /** Active members on the organisation's latest rolled-up day, and 30 and 90 days before it (null: no rollup). */
  active: number | null;
  active30: number | null;
  active90: number | null;
  /** Rollup flows over the last 12 months. */
  renewed: number;
  lapsed: number;
  revenue: CurrencyTotal[];
  outstanding: CurrencyTotal[];
  lastSignIn: Date | null;
  lastPayment: Date | null;
};

type ComparisonRow = OrgFacts & { growth30: number | null; growth90: number | null; renewalRate: number | null; limitShare: number | null; dormant: boolean };

const growth = (now: number | null, then: number | null) => (now === null || then === null ? null : ratio(now - then, then));

/**
 * Derived columns. Limits used is the fuller of members and team against their limits (null with no limits).
 * Dormant: at least 60 days old, with no staff sign-in and no paid payment in the last 60 days.
 */
export function comparisonRows(facts: OrgFacts[], now: Date): ComparisonRow[] {
  const cutoff = now.getTime() - DORMANT_DAYS * DAY;
  const recent = (date: Date | null) => date !== null && date.getTime() >= cutoff;
  return facts.map((org) => {
    const shares = [org.memberLimit ? org.members / org.memberLimit : null, org.managerLimit ? org.team / org.managerLimit : null].filter((share): share is number => share !== null);
    return {
      ...org,
      growth30: growth(org.active, org.active30),
      growth90: growth(org.active, org.active90),
      renewalRate: rollupRenewalRate(org.renewed, org.lapsed),
      limitShare: shares.length ? Math.max(...shares) : null,
      dormant: org.createdAt.getTime() < cutoff && !recent(org.lastSignIn) && !recent(org.lastPayment),
    };
  });
}

export const SORT_KEYS = ["name", "active", "growth30", "growth90", "renewal", "revenue", "outstanding", "signin", "payment", "limits"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export function parseSort(sort: string | undefined, dir: string | undefined): { key: SortKey; dir: "asc" | "desc" } {
  const key = (SORT_KEYS as readonly string[]).includes(sort ?? "") ? (sort as SortKey) : "active";
  return { key, dir: dir === "asc" || dir === "desc" ? dir : key === "name" ? "asc" : "desc" };
}

/** Sort the table. Money sorts by one currency (the platform's main one); empty values always sort last. */
export function sortComparison(rows: ComparisonRow[], key: SortKey, dir: "asc" | "desc", currency: string): ComparisonRow[] {
  const value = (row: ComparisonRow): number | string | null => {
    switch (key) {
      case "name": return row.name.toLocaleLowerCase("en-GB");
      case "active": return row.active;
      case "growth30": return row.growth30;
      case "growth90": return row.growth90;
      case "renewal": return row.renewalRate;
      case "revenue": return amountIn(row.revenue, currency);
      case "outstanding": return amountIn(row.outstanding, currency);
      case "signin": return row.lastSignIn?.getTime() ?? null;
      case "payment": return row.lastPayment?.getTime() ?? null;
      case "limits": return row.limitShare;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
    return (x < y ? -1 : x > y ? 1 : 0) * sign || a.name.localeCompare(b.name);
  });
}

type Amount = { organisationId: string; currency: string; amountMinor: number };

/** Per organisation, per currency: `plus` less `minus` (collected less refunds; outstanding with no minus). */
export function amountsByOrg(plus: Amount[], minus: Amount[] = []): Map<string, CurrencyTotal[]> {
  const grouped = new Map<string, Array<{ currency: string; minor: number }>>();
  for (const row of plus) grouped.set(row.organisationId, [...(grouped.get(row.organisationId) ?? []), { currency: row.currency, minor: row.amountMinor }]);
  for (const row of minus) grouped.set(row.organisationId, [...(grouped.get(row.organisationId) ?? []), { currency: row.currency, minor: -row.amountMinor }]);
  return new Map([...grouped].map(([id, list]) => [id, totals(list, (entry) => entry)]));
}

/** Every currency in the table, the most collected first, for the money columns and the CSV. */
export function tableCurrencies(rows: Array<Pick<OrgFacts, "revenue" | "outstanding">>): string[] {
  const sums = new Map<string, number>();
  for (const row of rows) for (const entry of [...row.revenue, ...row.outstanding]) sums.set(entry.currency, (sums.get(entry.currency) ?? 0) + Math.abs(entry.minor));
  return [...sums].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([currency]) => currency);
}

const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");
const percentCell = (value: number | null) => (value === null ? "" : (Math.round(value * 1000) / 10).toFixed(1));

/** The comparison table as CSV rows: one revenue and one outstanding column per currency. */
export function comparisonCsv(rows: ComparisonRow[], currencies: string[]) {
  const header = [
    "Organisation", "Status", "Active members", "Growth 30 days %", "Growth 90 days %", "Renewal rate 12 months %",
    ...currencies.map((currency) => `Revenue 12 months ${currency}`), ...currencies.map((currency) => `Outstanding ${currency}`),
    "Members", "Member limit", "Team", "Team limit", "Last staff sign-in", "Last payment", "Dormant",
  ];
  const body = rows.map((row) => [
    row.name, row.status, row.active ?? "", percentCell(row.growth30), percentCell(row.growth90), percentCell(row.renewalRate),
    ...currencies.map((currency) => csvAmount(amountIn(row.revenue, currency), currency)), ...currencies.map((currency) => csvAmount(amountIn(row.outstanding, currency), currency)),
    row.members, row.memberLimit ?? "", row.team, row.managerLimit ?? "", isoDay(row.lastSignIn), isoDay(row.lastPayment), row.dormant ? "Yes" : "No",
  ]);
  return { header, rows: body };
}

export type MonthBucket = { key: string; label: string; from: Date; to: Date };

/** Organisations going live (created by an admin or approved), applications submitted and declined, per month. */
export function applicationsByMonth(reviews: Array<{ action: string; createdAt: Date }>, months: MonthBucket[]) {
  return months.map((month) => {
    const inside = reviews.filter((review) => review.createdAt >= month.from && review.createdAt < month.to);
    const count = (...actions: string[]) => inside.filter((review) => actions.includes(review.action)).length;
    return { key: month.key, label: month.label, live: count("CREATED", "APPROVED"), applied: count("SUBMITTED"), declined: count("REJECTED") };
  });
}

/** Failures per organisation in the window, worst first; organisations with none are left out. */
export function failuresByOrg(names: Map<string, string>, payments: Map<string, number>, webhooks: Map<string, number>, outbox: Map<string, number>) {
  const ids = new Set([...payments.keys(), ...webhooks.keys(), ...outbox.keys()]);
  return [...ids]
    .filter((id) => names.has(id))
    .map((id) => ({ id, name: names.get(id)!, payments: payments.get(id) ?? 0, webhooks: webhooks.get(id) ?? 0, outbox: outbox.get(id) ?? 0 }))
    .map((row) => ({ ...row, total: row.payments + row.webhooks + row.outbox }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** Active members by top-level unit from one day's rollup rows (unit id to top-level ancestor by path). */
export function topLevelBreakdown(rows: Array<{ unitId: string | null; active: number; grace: number; expired: number }>, units: Array<{ id: string; name: string; path: string }>) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const groups = new Map<string, { key: string; name: string; active: number; grace: number; expired: number }>();
  for (const row of rows) {
    const top = row.unitId ? byId.get(byId.get(row.unitId)?.path.split("/")[0] ?? "") : undefined;
    const key = top?.id ?? "none";
    const group = groups.get(key) ?? { key, name: top?.name ?? "No unit", active: 0, grace: 0, expired: 0 };
    group.active += row.active;
    group.grace += row.grace;
    group.expired += row.expired;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
}

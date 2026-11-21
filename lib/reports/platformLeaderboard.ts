/**
 * The organisation leaderboard, pure over one fact row per organisation: filter, sort and paginate. Counts and
 * money per currency only, never a member's details. Money sorts by one chosen currency (never summed across
 * currencies); empty values always sort last. Definitions: docs/REPORTS.md "Platform analytics".
 */
import { rollupRenewalRate } from "./analytics";
import { ratio } from "./dataset";
import { amountIn, type CurrencyTotal } from "./money";

export type LeaderboardFacts = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  /** Every member record ever created. */
  members: number;
  /** Active members when the range began and at its end (rollup; null with no rollup that early). */
  activeStart: number | null;
  activeEnd: number | null;
  renewed: number;
  lapsed: number;
  /** Net revenue in the range (collected less refunds), per currency. */
  revenue: CurrencyTotal[];
  /** Latest of a payment, a staff sign-in and a new member. */
  lastActivityAt: Date | null;
};

export type LeaderboardRow = LeaderboardFacts & {
  /** Change in active members over the range, as a ratio of the starting stock (0.1 is 10 percent); null when it started at 0 or had no rollup. */
  growth: number | null;
  renewalRate: number | null;
  /** The existing per-organisation analytics page. */
  href: string;
};

export const LEADERBOARD_SORTS = ["name", "created", "members", "active", "growth", "renewal", "revenue", "activity"] as const;
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];
export const LEADERBOARD_STATUSES = ["all", "active", "suspended"] as const;
export type LeaderboardStatus = (typeof LEADERBOARD_STATUSES)[number];
export const LEADERBOARD_PAGE_SIZES = [10, 20, 50, 100] as const;

export function leaderboardRows(facts: LeaderboardFacts[]): LeaderboardRow[] {
  return facts.map((org) => ({
    ...org,
    growth: org.activeEnd === null || org.activeStart === null ? null : ratio(org.activeEnd - org.activeStart, org.activeStart),
    renewalRate: rollupRenewalRate(org.renewed, org.lapsed),
    href: `/super-admin/orgs/${org.id}/analytics`,
  }));
}

export type LeaderboardQuery = { sort: LeaderboardSort; dir: "asc" | "desc"; page: number; pageSize: number; status: LeaderboardStatus; currency: string | null };

/** Parse searchParams. Unknown values fall back to the defaults (active members, descending, page 1, 20 a page, all statuses). */
export function parseLeaderboardQuery(input: { sort?: string; dir?: string; page?: string; pageSize?: string; status?: string; currency?: string }): LeaderboardQuery {
  const sort = (LEADERBOARD_SORTS as readonly string[]).includes(input.sort ?? "") ? (input.sort as LeaderboardSort) : "active";
  const size = Number(input.pageSize);
  const page = Math.floor(Number(input.page));
  return {
    sort,
    dir: input.dir === "asc" || input.dir === "desc" ? input.dir : sort === "name" ? "asc" : "desc",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
    pageSize: (LEADERBOARD_PAGE_SIZES as readonly number[]).includes(size) ? size : 20,
    status: (LEADERBOARD_STATUSES as readonly string[]).includes(input.status ?? "") ? (input.status as LeaderboardStatus) : "all",
    currency: /^[A-Za-z]{3}$/.test(input.currency ?? "") ? (input.currency as string).toUpperCase() : null,
  };
}

/** Every currency that has revenue in the rows, the largest first, for the currency picker. */
export function leaderboardCurrencies(rows: Array<Pick<LeaderboardFacts, "revenue">>): string[] {
  const sums = new Map<string, number>();
  for (const row of rows) for (const entry of row.revenue) sums.set(entry.currency, (sums.get(entry.currency) ?? 0) + Math.abs(entry.minor));
  return [...sums].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([currency]) => currency);
}

/** Sort, with empty values last in either direction and the name as the tie-break. */
export function sortLeaderboard(rows: LeaderboardRow[], key: LeaderboardSort, dir: "asc" | "desc", currency: string): LeaderboardRow[] {
  const value = (row: LeaderboardRow): number | string | null => {
    switch (key) {
      case "name": return row.name.toLocaleLowerCase("en-GB");
      case "created": return row.createdAt.getTime();
      case "members": return row.members;
      case "active": return row.activeEnd;
      case "growth": return row.growth;
      case "renewal": return row.renewalRate;
      case "revenue": return row.revenue.some((entry) => entry.currency === currency) ? amountIn(row.revenue, currency) : null;
      case "activity": return row.lastActivityAt?.getTime() ?? null;
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

/** Filter by status, sort and take one page. `page` is clamped to the last page. */
export function pageLeaderboard(rows: LeaderboardRow[], query: LeaderboardQuery) {
  const filtered = query.status === "all" ? rows : rows.filter((row) => row.status === query.status.toUpperCase());
  const currency = query.currency ?? leaderboardCurrencies(filtered)[0] ?? "INR";
  const sorted = sortLeaderboard(filtered, query.sort, query.dir, currency);
  const pageCount = Math.max(1, Math.ceil(sorted.length / query.pageSize));
  const page = Math.min(query.page, pageCount);
  return { rows: sorted.slice((page - 1) * query.pageSize, page * query.pageSize), total: sorted.length, page, pageCount, pageSize: query.pageSize, currency, currencies: leaderboardCurrencies(filtered) };
}

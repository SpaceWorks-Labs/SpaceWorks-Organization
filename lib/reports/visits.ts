/**
 * Web visits (docs/REPORTS.md "Web visits"). Pure over rows of WebVisitDaily: counts of public page views by UTC
 * day and approved route template. No person is ever in these rows.
 */
export type VisitRow = { day: string; route: string; count: number };
export type VisitPoint = { key: string; label: string; count: number };
export type VisitSummary = {
  firstDay: string;
  lastDay: string;
  total: number;
  /** "day" for periods up to 92 days, else "month". */
  unit: "day" | "month";
  trend: VisitPoint[];
  byRoute: Array<{ route: string; label: string; count: number; share: number }>;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;
const MAX_DAYS = 3660;

const ROUTE_LABELS: Record<string, string> = {
  "/": "Home",
  "/about": "About",
  "/features": "Features",
  "/docs": "Docs",
  "/docs/:slug": "Docs article",
  "/organisations": "Organisations",
  "/o/:orgSlug": "Public page",
  "/o/:orgSlug/join/:planSlug": "Join form",
  "/privacy": "Privacy",
  "/terms": "Terms",
};

export const routeLabel = (route: string) => ROUTE_LABELS[route] ?? route;

const parse = (key: string) => Date.parse(`${key}T00:00:00.000Z`);

/** Every day key from first to last inclusive; empty when the range is reversed, invalid or over ten years. */
export function eachDay(firstDay: string, lastDay: string): string[] {
  const first = parse(firstDay), last = parse(lastDay);
  if (Number.isNaN(first) || Number.isNaN(last) || last < first || (last - first) / DAY_MS >= MAX_DAYS) return [];
  const days: string[] = [];
  for (let at = first; at <= last; at += DAY_MS) days.push(new Date(at).toISOString().slice(0, 10));
  return days;
}

function dayLabel(key: string) {
  return `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;
}

/** Totals, a trend with a point for every day (or month, over 92 days) in the range, and the busiest routes first. */
export function summariseVisits(rows: readonly VisitRow[], firstDay: string, lastDay: string): VisitSummary {
  const days = eachDay(firstDay, lastDay);
  const inRange = new Set(days);
  const perDay = new Map<string, number>();
  const perRoute = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (!inRange.has(row.day) || row.count <= 0) continue;
    perDay.set(row.day, (perDay.get(row.day) ?? 0) + row.count);
    perRoute.set(row.route, (perRoute.get(row.route) ?? 0) + row.count);
    total += row.count;
  }
  const unit = days.length > 92 ? "month" : "day";
  const trend: VisitPoint[] = [];
  for (const day of days) {
    const key = unit === "month" ? day.slice(0, 7) : day;
    const count = perDay.get(day) ?? 0;
    const last = trend.at(-1);
    if (last?.key === key) last.count += count;
    else trend.push({ key, label: unit === "month" ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : dayLabel(key), count });
  }
  const byRoute = [...perRoute].map(([route, count]) => ({ route, label: routeLabel(route), count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.route.localeCompare(b.route));
  return { firstDay, lastDay, total, unit, trend, byRoute };
}

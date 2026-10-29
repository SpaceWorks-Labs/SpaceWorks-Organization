/**
 * Pure helpers for the super-admin panel's read-only insight pages. They only
 * shape aggregates the pages have already loaded; nothing here touches the
 * database or handles secrets.
 */

export const DAY_MS = 86_400_000;

/** UTC calendar days (YYYY-MM-DD), oldest first, ending with the day containing `now`. */
export function utcDayKeys(days: number, now: Date = new Date()): string[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(new Date(end - offset * DAY_MS).toISOString().slice(0, 10));
  }
  return keys;
}

/** Start (UTC midnight) of the first day in a `days`-long window ending today. */
export function windowStart(days: number, now: Date = new Date()): Date {
  return new Date(`${utcDayKeys(days, now)[0]}T00:00:00.000Z`);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2026-10-05" -> "Oct 5". */
export function shortDayLabel(key: string): string {
  const [, month, day] = key.split("-");
  return `${MONTHS[Number(month) - 1] ?? "?"} ${Number(day)}`;
}

export type DailyRow = { series: string; day: string; n: number | bigint };
type DailyPoint = { day: string; xLabel: string; y: number };

/**
 * Turns sparse grouped rows (only days with activity) into one zero-filled
 * series per name over the window. Rows outside the window are ignored.
 */
export function fillDailySeries<Name extends string>(rows: DailyRow[], names: readonly Name[], days: number, now: Date = new Date()): Record<Name, DailyPoint[]> {
  const keys = utcDayKeys(days, now);
  const lookup = new Map<string, number>();
  for (const row of rows) lookup.set(`${row.series}|${row.day}`, (lookup.get(`${row.series}|${row.day}`) ?? 0) + Number(row.n));
  const result = {} as Record<Name, DailyPoint[]>;
  for (const name of names) {
    result[name] = keys.map((day) => ({ day, xLabel: shortDayLabel(day), y: lookup.get(`${name}|${day}`) ?? 0 }));
  }
  return result;
}

export function sumPoints(points: DailyPoint[]): number {
  return points.reduce((total, point) => total + point.y, 0);
}

/** Splits a 2n-day series into the previous and current n-day totals. */
export function compareWindows(points: DailyPoint[]): { current: number; previous: number } {
  const half = Math.floor(points.length / 2);
  return { previous: sumPoints(points.slice(0, points.length - half)), current: sumPoints(points.slice(points.length - half)) };
}

/** Percentage change, or null when there is no baseline to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatChange(current: number, previous: number): string {
  const change = percentChange(current, previous);
  if (change == null) return current === 0 ? "—" : "New";
  const rounded = Math.round(change);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** Share as a whole-number percentage ("0%" when the total is empty). */
export function formatShare(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

type OutboxGroup = { kind: string; status: string; count: number };
type OutboxKindRow = { kind: string; pending: number; processing: number; sent: number; failed: number; total: number };

/** Pivots outbox (kind, status) counts into one row per kind, busiest first. */
export function outboxByKind(groups: OutboxGroup[]): OutboxKindRow[] {
  const rows = new Map<string, OutboxKindRow>();
  for (const group of groups) {
    const row = rows.get(group.kind) ?? { kind: group.kind, pending: 0, processing: 0, sent: 0, failed: 0, total: 0 };
    if (group.status === "PENDING") row.pending += group.count;
    else if (group.status === "PROCESSING") row.processing += group.count;
    else if (group.status === "SENT") row.sent += group.count;
    else if (group.status === "FAILED") row.failed += group.count;
    row.total += group.count;
    rows.set(group.kind, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.kind.localeCompare(b.kind));
}

/**
 * Audit actions an operator reviews for account, access, and data-export
 * safety. Kept explicit so new business events do not appear here by accident.
 */
export const SECURITY_AUDIT_ACTIONS = [
  "SUPER_ADMIN_MFA_VERIFIED",
  "PLATFORM_ADMIN_GRANTED",
  "PLATFORM_ADMIN_REVOKED",
  "MFA_ENABLED",
  "MFA_DISABLED",
  "SESSIONS_REVOKED",
  "ACCOUNT_PASSWORD_RESET",
  "NEW_USER_REGISTRATION_SETTING_UPDATED",
  "INSTANCE_SERVICE_SETTINGS_UPDATED",
  "TEAM_ROLE_CHANGED",
  "TEAM_MEMBER_REMOVED",
  "ORGANISATION_DELETED",
  "ORGANISATION_INVITE_CREATED",
  "TEAM_INVITE_ACCEPTED",
  "ORGANISATION_SUSPENDED",
  "ORGANISATION_REACTIVATED",
  "ACCOUNT_DATA_EXPORTED",
  "MEMBERS_EXPORTED",
  "FINANCE_REPORT_EXPORTED",
  "REPORT_EXPORTED",
  "SUPER_ADMIN_ORG_VIEWED",
  "SUPER_ADMIN_ORG_ANALYTICS_VIEWED",
  "PLATFORM_REPORT_EXPORTED",
  "ID_CARDS_EXPORTED",
] as const;

/** The instant `minutes` before `now`. */
export function minutesAgo(minutes: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

/**
 * Links from a report tile to the members behind it. Client-safe. Every tile on every report links to
 * the member directory with `drill` and the report's filters; the directory resolves them through
 * lib/reports/drill.ts, inside the viewer's own unit scope.
 */
import { DRILL_METRICS, type DrillMetric } from "./metrics/flows";

const DRILL_EXTRAS = ["missing-phone", "missing-state", "missing-unit", "missing-photo", "minor-no-guardian"] as const;
export type DrillExtra = (typeof DRILL_EXTRAS)[number];
export type DrillKey = DrillMetric | DrillExtra;

export const DRILL_LABELS: Record<DrillKey, string> = {
  active: "Active",
  grace: "In grace",
  joined: "Joined",
  reactivated: "Came back",
  due: "Due to renew",
  renewed: "Renewed",
  open: "Renewal still open",
  lapsed: "Lapsed",
  churned: "Left (lapsed, not back)",
  revoked: "Revoked",
  "missing-phone": "No phone number",
  "missing-state": "No state",
  "missing-unit": "No unit",
  "missing-photo": "No photo",
  "minor-no-guardian": "Minors without guardian details",
};

export function isDrillKey(value: unknown): value is DrillKey {
  return typeof value === "string" && ((DRILL_METRICS as readonly string[]).includes(value) || (DRILL_EXTRAS as readonly string[]).includes(value));
}

/** The report filters a drill-down carries. Unit is a subtree (`dunit`), unlike the directory's own exact `unit`. */
type DrillFilters = { period?: string; from?: string; to?: string; plan?: string; unit?: string; state?: string; source?: string; role?: string; tenure?: string };

export function drillHref(slug: string, key: DrillKey, filters: DrillFilters = {}): string {
  const params = new URLSearchParams({ drill: key });
  const map: Record<string, string | undefined> = { period: filters.period, from: filters.from, to: filters.to, plan: filters.plan, dunit: filters.unit, dstate: filters.state, dsource: filters.source, role: filters.role, dtenure: filters.tenure };
  for (const [name, value] of Object.entries(map)) if (value) params.set(name, value);
  return `/dashboard/${slug}/members?${params.toString()}`;
}

import type { ReactNode } from "react";
import { NavTabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/display";
import { DEFAULT_PLATFORM_RANGE, type PlatformRange } from "@/lib/reports/platformRange";
import { LinkChoices, Control } from "./parts";
import { withQuery } from "./format";

export type AnalyticsTab = "overview" | "growth" | "money" | "organisations" | "operations" | "web";

const BASE = "/super-admin/analytics";
const TABS: Array<{ key: AnalyticsTab; label: string; path: string; uses?: "range" | "days" }> = [
  { key: "overview", label: "Overview", path: BASE },
  { key: "growth", label: "Growth", path: `${BASE}/growth`, uses: "range" },
  { key: "money", label: "Money", path: `${BASE}/money`, uses: "range" },
  { key: "organisations", label: "Organisations", path: `${BASE}/organisations`, uses: "range" },
  { key: "operations", label: "Operations", path: `${BASE}/operations`, uses: "days" },
  { key: "web", label: "Web", path: `${BASE}/web` },
];

export const RANGE_LABELS: Record<PlatformRange, string> = { "30d": "30 days", "90d": "90 days", "12m": "12 months", fy: "Financial year" };

/** "vs the previous 30 days": the comparison period is always the same length just before (UTC). */
export function previousLabel(range: PlatformRange): string {
  return range === "fy" ? "vs as many days before 1 April" : `vs the previous ${RANGE_LABELS[range].toLowerCase()}`;
}

/** The range for a link: left out when it is the default, so plain links stay plain. */
export const rangeParam = (range: PlatformRange | undefined) => (range && range !== DEFAULT_PLATFORM_RANGE ? range : undefined);
export const daysParam = (days: number | undefined) => (days && days !== 30 ? days : undefined);

/** The range picker for growth, money and the leaderboard. `hrefFor` builds each option's link (the leaderboard keeps its sort). */
export function RangePicker({ ranges, current, hrefFor }: { ranges: readonly PlatformRange[]; current: PlatformRange; hrefFor: (range: PlatformRange) => string }) {
  return (
    <Control label="Range">
      <LinkChoices label="Range" options={ranges.map((range) => ({ href: hrefFor(range), label: RANGE_LABELS[range], current: range === current, title: range === "fy" ? "This financial year, April to March" : undefined }))} />
    </Control>
  );
}

/** The day picker for operations health. */
export function DaysPicker({ options, current, path }: { options: readonly number[]; current: number; path: string }) {
  return (
    <Control label="Days">
      <LinkChoices label="Days" options={options.map((days) => ({ href: withQuery(path, { days: daysParam(days) }), label: `${days} days`, current: days === current }))} />
    </Control>
  );
}

/**
 * Every analytics page: the header, the section tabs (URLs, each carrying the range or days it shares with
 * the page you are on), an optional filter row and the content.
 */
export function AnalyticsShell({ tab, range, days, actions, filters, note, children }: { tab: AnalyticsTab; range?: PlatformRange; days?: number; actions?: ReactNode; filters?: ReactNode; note?: ReactNode; children: ReactNode }) {
  const items = TABS.map((item) => ({
    href: withQuery(item.path, item.uses === "range" ? { range: rangeParam(range) } : item.uses === "days" ? { days: daysParam(days) } : {}),
    label: item.label,
    active: item.key === tab,
  }));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="How the platform and every organisation are doing. Totals only, never a member's name or contact details."
        actions={actions}
      />
      <NavTabs label="Analytics sections" items={items} />
      {filters || note ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-end gap-3">{filters}</div>
          {note ? <p className="text-caption text-ink-muted sm:max-w-sm sm:text-right">{note}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

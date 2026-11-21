"use client";

import Link from "next/link";
import { statsForSection, type LiveStatResult } from "@/lib/publicPage/blockData";
import { MIN_PUBLIC_COUNT } from "@/lib/publicPage/live";
import { GROWTH_DAYS, LIVE_STAT_KINDS, LIVE_STAT_LABELS, MAX_LIVE_STATS, type LiveStatKind, type SectionOf } from "@/lib/publicPage/sections";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { ChoiceCards, ItemList, type SectionProps } from "./shared";
import { IntroFields } from "./MembershipFields";

type Metric = SectionOf<"liveStats">["metrics"][number];

const DISPLAYS = [
  { value: "numbers", label: "Numbers", description: "Big figures, with breakdowns as short lists." },
  { value: "bars", label: "Bars", description: "Breakdowns as bars, longest first." },
  { value: "list", label: "List", description: "Every figure as a plain list." },
] as const;

const BREAKDOWNS = new Set<LiveStatKind>(["byArea", "byPlan", "byGrouping"]);
const number = (value: number) => new Intl.NumberFormat("en-IN").format(value);

/** What the metric shows right now, organisation-wide, in words (never colour alone). */
function readout(metric: Metric, result: LiveStatResult | undefined): string {
  if (!result) return metric.kind === "byGrouping" ? "Choose a grouping to see its figures." : "No figures for this yet.";
  if (BREAKDOWNS.has(metric.kind)) {
    const rows = result.rows.length;
    return rows ? `Now: ${rows} ${rows === 1 ? "row" : "rows"} shown, biggest ${number(result.rows[0]!.count)}. Rows under ${MIN_PUBLIC_COUNT} are hidden.` : `Every row is under ${MIN_PUBLIC_COUNT}, so visitors don't see it.`;
  }
  if (result.value === null) return `Fewer than ${MIN_PUBLIC_COUNT}, so visitors don't see it.`;
  return `Now: ${number(result.value)}${result.percent !== null ? ` (+${result.percent}%)` : ""}`;
}

/**
 * Live numbers: which figures to show and how. The readout under each metric is the organisation-wide figure today;
 * an area page shows its own area's.
 */
export function LiveStatsFields({ section, slug, disabled, error, extras, onChange }: SectionProps<"liveStats">) {
  const { groupings, statsCatalogue } = extras;
  const setKind = (metric: Metric, kind: LiveStatKind): Partial<Metric> => ({
    kind,
    groupingId: kind === "byGrouping" ? metric.groupingId || groupings[0]?.id || "" : "",
  });

  return (
    <div className="flex flex-col gap-4">
      <IntroFields intro={section.intro} disabled={disabled} error={error} onIntro={(intro) => onChange({ ...section, intro })} note="A line above the numbers." />
      <ChoiceCards label="Show them as" value={section.display} options={DISPLAYS} disabled={disabled} onChange={(display) => onChange({ ...section, display })} />
      <ItemList
        items={section.metrics}
        max={MAX_LIVE_STATS}
        noun="metric"
        addLabel="Add a metric"
        empty="Nothing to count yet. Add a metric, like members in total."
        disabled={disabled}
        create={(): Metric => ({ kind: "total", label: "", groupingId: "", days: 90 })}
        onChange={(metrics) => onChange({ ...section, metrics })}
      >
        {(metric, index, set) => {
          const result = statsForSection({ metrics: [metric] }, statsCatalogue)[0];
          return (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="What to count" error={error(`metrics.${index}.kind`)}>
                  <Dropdown value={metric.kind} disabled={disabled} onChange={(event) => set(setKind(metric, event.target.value as LiveStatKind))}>
                    {LIVE_STAT_KINDS.map((kind) => <option key={kind} value={kind}>{LIVE_STAT_LABELS[kind]}</option>)}
                  </Dropdown>
                </Field>
                {metric.kind === "growth" ? (
                  <Field label="Period" error={error(`metrics.${index}.days`)}>
                    <Dropdown value={String(metric.days)} disabled={disabled} onChange={(event) => set({ days: Number(event.target.value) as Metric["days"] })}>
                      {GROWTH_DAYS.map((days) => <option key={days} value={String(days)}>Last {days} days</option>)}
                    </Dropdown>
                  </Field>
                ) : null}
                {metric.kind === "byGrouping" && groupings.length ? (
                  <Field label="Grouping" error={error(`metrics.${index}.groupingId`)}>
                    <Dropdown value={metric.groupingId} disabled={disabled} onChange={(event) => set({ groupingId: event.target.value })}>
                      {metric.groupingId ? null : <option value="" disabled>Choose a grouping</option>}
                      {groupings.map((grouping) => <option key={grouping.id} value={grouping.id}>{grouping.name}</option>)}
                    </Dropdown>
                  </Field>
                ) : null}
              </div>
              {metric.kind === "byGrouping" && !groupings.length ? (
                <p className="text-caption text-ink-muted">
                  You have no groupings yet. Add one in{" "}
                  <Link href={`/dashboard/${slug}/settings/groupings`} className="text-accent-text underline underline-offset-4 hover:text-ink">Settings → Groupings</Link>, then choose it here.
                  {error(`metrics.${index}.groupingId`) ? <span className="block text-danger-fg">{error(`metrics.${index}.groupingId`)}</span> : null}
                </p>
              ) : null}
              <Field label="Label" optional helperText={result ? `Leave it empty to use “${result.label}”.` : "Leave it empty for the standard label."} error={error(`metrics.${index}.label`)}>
                <Input value={metric.label} maxLength={60} disabled={disabled} onChange={(event) => set({ label: event.target.value })} />
              </Field>
              <p className="text-caption text-ink-secondary">{readout(metric, result)}</p>
            </div>
          );
        }}
      </ItemList>
      <p className="text-caption text-ink-muted">
        Only numbers are shown, never names. Any count under {MIN_PUBLIC_COUNT} is hidden so nobody can be picked out, and when one row of a breakdown is
        hidden the next smallest is hidden too. Figures update every few minutes.
      </p>
    </div>
  );
}

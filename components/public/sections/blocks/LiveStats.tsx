import type { LiveStatResult } from "@/lib/publicPage/blockData";
import { MIN_PUBLIC_COUNT, type CountRow } from "@/lib/publicPage/live";
import type { SectionOf } from "@/lib/publicPage/sections";
import { cn } from "@/lib/cn";
import { LEDE } from "../shared";
import { formatCount } from "./icon";

/*
 * Live numbers: single figures (total, joined this year, growth) as stat tiles or rows, and breakdowns (by area,
 * plan, grouping) as numbers, bars or a list. Counts under MIN_PUBLIC_COUNT never arrive: a single figure reads
 * "Fewer than 5" and a breakdown says its smaller groups aren't shown. Bars are decoration over visible counts.
 */

const FEWER = `Fewer than ${MIN_PUBLIC_COUNT}`;
const BREAKDOWNS = new Set<LiveStatResult["kind"]>(["byArea", "byPlan", "byGrouping"]);
const BIG = "font-display font-extrabold leading-none tracking-tight tabular-nums text-ink";
/** Edge on filled chart marks (CR-CHART-01), read from the raw token so the editor's dark preview frame follows. */
const MARK = { backgroundColor: "var(--chart-1)", boxShadow: "inset 0 0 0 1px rgb(var(--sw-chart-edge))" };

type Display = SectionOf<"liveStats">["display"];

function Growth({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  return <span className="inline-flex w-fit items-center rounded-full bg-success-mark px-2.5 py-1 text-[13px] font-semibold leading-4 text-on-success-mark">+{percent}% growth</span>;
}

/** The single figures, as tiles (numbers, bars) or as rows (list). */
function Figures({ results, display, locale }: { results: LiveStatResult[]; display: Display; locale: string | null }) {
  if (!results.length) return null;
  if (display === "list") {
    return (
      <dl className="flex flex-col divide-y divide-line rounded-xl border border-line bg-panel">
        {results.map((result, index) => (
          <div key={index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4">
            <dt className="min-w-0 break-words text-body-ui text-ink">{result.label}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <Growth percent={result.percent} />
              {result.value !== null ? <span className={cn(BIG, "text-h3")}>{formatCount(result.value, locale)}</span> : <span className="text-body-ui text-ink-secondary">{FEWER}</span>}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className="grid grid-cols-1 gap-4 @md:grid-cols-2 @4xl:grid-cols-3">
      {results.map((result, index) => (
        <div key={index} className="flex flex-col-reverse justify-end gap-3 rounded-xl border border-line bg-panel p-6">
          <dt className="text-body-ui text-ink-secondary">{result.label}</dt>
          <dd className="flex flex-col gap-3">
            {result.value !== null
              ? <span className={cn(BIG, "text-[2.75rem] @xl:text-[3.5rem]")}>{formatCount(result.value, locale)}</span>
              : <span className="text-h3 text-ink">{FEWER}</span>}
            <Growth percent={result.percent} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Rows({ rows, display, locale }: { rows: CountRow[]; display: Display; locale: string | null }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (display === "bars") {
    return (
      <ul className="flex flex-col gap-4">
        {rows.map((row) => (
          <li key={row.label} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-4 text-body-ui text-ink">
              <span className="min-w-0 break-words">{row.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatCount(row.count, locale)}</span>
            </span>
            <span aria-hidden className="block h-3 overflow-hidden rounded-full border border-line bg-surface">
              <span className="block h-full rounded-full" style={{ ...MARK, width: `${Math.max(3, Math.round((row.count / max) * 100))}%` }} />
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (display === "list") {
    return (
      <dl className="flex flex-col divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="min-w-0 break-words text-body-ui text-ink">{row.label}</dt>
            <dd className="shrink-0 text-body-ui font-semibold tabular-nums text-ink">{formatCount(row.count, locale)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-panel">
      {rows.map((row) => (
        <li key={row.label} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
          <span className="min-w-0 break-words text-body-ui text-ink">{row.label}</span>
          <span className={cn(BIG, "shrink-0 text-h3")}>{formatCount(row.count, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

/** One breakdown with its heading; with every group under the threshold it says so instead of listing nothing. */
function Breakdown({ result, display, locale }: { result: LiveStatResult; display: Display; locale: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h3 className="text-h4 text-ink">{result.label}</h3>
      {result.rows.length ? (
        <>
          <Rows rows={result.rows} display={display} locale={locale} />
          <p className="text-caption text-ink-muted">Groups with fewer than {MIN_PUBLIC_COUNT} members aren&apos;t shown.</p>
        </>
      ) : <p className="rounded-xl border border-dashed border-line-strong px-5 py-4 text-body-ui text-ink-secondary">Every group has fewer than {MIN_PUBLIC_COUNT} members, so none are shown yet.</p>}
    </div>
  );
}

/** Live numbers for the page's scope: aggregates only, never names. */
export function LiveStats({ section, results, locale }: { section: SectionOf<"liveStats">; results: LiveStatResult[]; locale: string | null }) {
  const figures = results.filter((result) => !BREAKDOWNS.has(result.kind));
  const breakdowns = results.filter((result) => BREAKDOWNS.has(result.kind));
  return (
    <div className="flex flex-col gap-10">
      {section.intro ? <p className={LEDE}>{section.intro}</p> : null}
      <Figures results={figures} display={section.display} locale={locale} />
      {breakdowns.length ? (
        <div className={cn("grid grid-cols-1 gap-10", breakdowns.length > 1 && "@3xl:grid-cols-2")}>
          {breakdowns.map((result, index) => <Breakdown key={`${result.kind}-${result.groupingId ?? ""}-${index}`} result={result} display={section.display} locale={locale} />)}
        </div>
      ) : null}
      <p className="text-caption text-ink-muted">Members with a current membership, updated every few minutes.</p>
    </div>
  );
}

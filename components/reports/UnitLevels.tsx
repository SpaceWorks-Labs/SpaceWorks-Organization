import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { OrgReportsUnits } from "@/lib/views/app__dashboard__orgSlug__reports__units__page";
import { formatValue, signed } from "@/lib/reports/chartScale";
import { formatTotals } from "@/lib/reports/money";
import { EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarList } from "./charts/BarList";
import { ChartFrame } from "./charts/ChartFrame";

const percent = (rate: number) => `${rate > 0 ? "+" : rate < 0 ? "−" : ""}${Math.abs(Math.round(rate * 100))}%`;
/** "+12% (+30)", or just the change when there was nobody to grow from. */
const growth = (rate: number | null, change: number) => (rate === null ? (change ? signed(change) : "—") : `${percent(rate)} (${signed(change)})`);

/**
 * H6 league table for one level: the units below the current one, each counting its whole subtree. A unit with
 * units below it drills down a level; a unit at the bottom opens its active members. Money columns appear for
 * finance roles only and stay per currency.
 */
export function UnitLevels({ view }: { view: OrgReportsUnits }) {
  if (!view.hasUnits) {
    return <EmptyState title="No units yet">Set up areas or branches in Settings → Units and roles to compare them here.</EmptyState>;
  }
  const { rows, levelName } = view;
  return (
    <>
      <nav aria-label="Level" className="flex flex-wrap items-center gap-1 text-label">
        {view.trail.map((step, index) => (
          <span key={step.key} className="inline-flex items-center gap-1">
            {index > 0 ? <ChevronRight aria-hidden className="size-4 text-ink-muted" /> : null}
            {index === view.trail.length - 1 ? (
              <span aria-current="page" className="font-semibold text-ink">{step.label}</span>
            ) : (
              <Link href={step.href} className="text-accent-text underline-offset-4 hover:underline">{step.label}</Link>
            )}
          </span>
        ))}
      </nav>
      <ChartFrame
        title={`Active members by ${levelName.toLowerCase()}`}
        description="Active now, each row counting everything under it. Select a row to go a level down."
        table={{ columns: [levelName, "Active"], rows: rows.map((row) => [row.name, row.active]) }}
      >
        <BarList label={`Active members by ${levelName.toLowerCase()}`} empty="Nothing below this level." items={rows.map((row) => ({ key: row.key, label: row.name, value: row.active, href: row.href, hint: `90 days: ${growth(row.growth90, row.active - row.active90)}` }))} />
      </ChartFrame>
      {rows.length ? (
        <Table label={`${levelName} league table`}>
          <THead>
            <TR>
              <TH>{levelName}</TH>
              <TH className="text-right">Active now</TH>
              <TH className="text-right">30 days</TH>
              <TH className="text-right">90 days</TH>
              <TH className="text-right">Renewal rate</TH>
              {view.finance ? <TH className="text-right">Collected</TH> : null}
              {view.finance ? <TH className="text-right">Outstanding</TH> : null}
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.key}>
                <TD>
                  {row.href ? <Link href={row.href} className="font-semibold text-ink underline-offset-4 hover:underline">{row.name}</Link> : <span className="text-ink-secondary">{row.name}</span>}
                  {row.href ? <span className="block text-caption text-ink-muted">{row.hasChildren ? "Go a level down" : "See members"}</span> : null}
                </TD>
                <TD className="text-right tabular-nums">{row.active.toLocaleString("en-IN")}</TD>
                <TD className="whitespace-nowrap text-right tabular-nums">{growth(row.growth30, row.active - row.active30)}</TD>
                <TD className="whitespace-nowrap text-right tabular-nums">{growth(row.growth90, row.active - row.active90)}</TD>
                <TD className="text-right tabular-nums">{formatValue(row.renewalRate, "percent")}<span className="block text-caption text-ink-muted">{row.decided} decided</span></TD>
                {view.finance ? <TD className="whitespace-nowrap text-right tabular-nums">{formatTotals(row.collected ?? [])}</TD> : null}
                {view.finance ? <TD className="whitespace-nowrap text-right tabular-nums">{formatTotals(row.outstanding ?? [])}</TD> : null}
              </TR>
            ))}
          </TBody>
        </Table>
      ) : null}
      <p className="text-caption text-ink-muted">
        Growth compares active members now with 30 and 90 days ago. The renewal rate and money collected cover the selected period; outstanding is owed now.
        {view.finance ? " Amounts are per currency and never added across currencies." : ""}
      </p>
    </>
  );
}

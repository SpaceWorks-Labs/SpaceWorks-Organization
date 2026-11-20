import Link from "next/link";
import type { Metadata } from "next";
import { loadOrgReportsActivity } from "@/lib/views/app__dashboard__orgSlug__reports__activity__page";
import type { ReportSearch } from "@/lib/reports/context";
import { actionLabel } from "@/lib/reports/activity";
import { ReportShell } from "@/components/reports/ReportShell";
import { CardIssuanceTile } from "@/components/reports/CardIssuanceTile";
import { ChartFrame } from "@/components/reports/charts/ChartFrame";
import { ColumnChart } from "@/components/reports/charts/ColumnChart";
import { EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCount, formatStamp, timeZoneOf } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Team activity", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

export default async function OrgReportsActivityPage({ params, searchParams }: Props) {
  const view = await loadOrgReportsActivity({ params, searchParams });
  const timeZone = timeZoneOf(view);
  const used = view.categories.filter((category) => view.people.some((person) => person.counts[category.key]));
  return (
    <ReportShell shell={view.shell} title="Team activity">
      {view.cards ? <CardIssuanceTile cards={view.cards} /> : null}
      <ChartFrame title="Actions by the team" description={`${formatCount(view.total)} recorded actions in the period${view.capped ? " (showing the latest 5,000)" : ""}.`} table={{ columns: ["Period", "Actions"], rows: view.series.map((p) => [p.label, p.count]) }}>
        <ColumnChart ariaLabel="Team actions in each period" labels={view.series.map((p) => p.label)} series={[{ key: "actions", label: "Actions", slot: 1, values: view.series.map((p) => p.count) }]} />
      </ChartFrame>
      <section aria-labelledby="people-title" className="flex flex-col gap-3">
        <h2 id="people-title" className="text-h4 text-ink">Who did what</h2>
        <Table label="Actions per team member">
          <THead>
            <tr>
              <TH>Team member</TH>
              {used.map((category) => <TH key={category.key} className="text-right">{category.label}</TH>)}
              <TH className="text-right">All</TH>
            </tr>
          </THead>
          <TBody>
            {view.people.map((person) => (
              <TR key={person.userId}>
                <TD><span className="font-semibold text-ink">{person.name}</span><span className="block text-caption text-ink-muted">{person.roleName}</span></TD>
                {used.map((category) => <TD key={category.key} className="text-right tabular-nums">{person.counts[category.key] ?? 0}</TD>)}
                <TD className="text-right font-semibold tabular-nums">{person.total}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>
      <section aria-labelledby="recent-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recent-title" className="text-h4 text-ink">Latest actions</h2>
          <Link href={`/dashboard/${view.shell.org.slug}/activity`} className="text-sm text-ink underline underline-offset-4">View the full activity log</Link>
        </div>
        {view.recent.length ? (
          <Table label="Latest team actions">
            <THead><tr><TH>When</TH><TH>Who</TH><TH>Action</TH></tr></THead>
            <TBody>
              {view.recent.map((event) => (
                <TR key={event.id}>
                  <TD className="whitespace-nowrap text-ink-secondary">{formatStamp(event.when, timeZone)}</TD>
                  <TD>{event.who}</TD>
                  <TD className="text-ink-secondary">{actionLabel(event.action)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState mood="sleepy" title="Quiet period">Nobody on the team recorded an action in this period.</EmptyState>}
      </section>
    </ReportShell>
  );
}

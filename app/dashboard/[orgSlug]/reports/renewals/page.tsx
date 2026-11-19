import Link from "next/link";
import type { Metadata } from "next";
import { loadOrgReportsRenewals } from "@/lib/views/app__dashboard__orgSlug__reports__renewals__page";
import type { ReportSearch } from "@/lib/reports/context";
import { formatValue } from "@/lib/reports/chartScale";
import { ReportShell, ExportLink } from "@/components/reports/ReportShell";
import { RenewalWorklist } from "@/components/reports/RenewalWorklist";
import { ChartFrame, HeatTable } from "@/components/reports/charts/ChartFrame";
import { ColumnChart } from "@/components/reports/charts/ColumnChart";
import { KpiTile } from "@/components/reports/charts/Figures";
import { TrendChart } from "@/components/reports/charts/TrendChart";
import { EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Renewal reports", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

export default async function OrgReportsRenewalsPage({ params, searchParams }: Props) {
  const view = await loadOrgReportsRenewals({ params, searchParams });
  const { summary: s, shell } = view;
  const base = `/dashboard/${shell.org.slug}/reports/renewals`;
  const daysLink = (days: number) => `${base}${shell.query ? `${shell.query}&` : "?"}days=${days}`;
  return (
    <ReportShell shell={shell} title="Renewals">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <KpiTile label="Due to renew" value={s.due} href={view.links.due} hint="Memberships that ended in the period" />
        <KpiTile label="Renewed" value={s.renewed} href={view.links.renewed} hint={s.open ? `${s.open} still open` : "None still open"} />
        <KpiTile label="Renewal rate" value={s.renewalRate} format="percent" href={view.links.renewed} hint={`First-year members: ${formatValue(s.firstYearRenewalRate, "percent")}`} />
        <KpiTile label="Churn" value={s.churnRate} format="percent" href={view.links.churned} hint={`${s.churned} left, not back`} />
        <KpiTile label="Retention" value={s.retentionRate} format="percent" href={view.links.active} hint="Of members active at the start" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Renewal rate by month" description="By the month the membership ended. Months with fewer than 3 decided renewals are left out." table={{ columns: ["Month", "Due", "Renewed", "Rate"], rows: view.trend.map((p) => [p.label, p.due, p.renewed, formatValue(p.renewalRate, "percent")]) }}>
          <TrendChart ariaLabel="Renewal rate by month" format="percent" yMax={1} labels={view.trend.map((p) => p.label)} series={[{ key: "rate", label: "Renewal rate", slot: 1, values: view.trend.map((p) => (p.decided >= 3 ? p.renewalRate : null)) }]} />
        </ChartFrame>
        <ChartFrame title="Coming up" description="Active memberships ending in each of the next 13 weeks, not yet renewed." table={{ columns: ["Week of", "Ending"], rows: view.calendar.map((w) => [w.label, w.count]) }}>
          <ColumnChart ariaLabel="Memberships ending each week" labels={view.calendar.map((w) => w.label)} series={[{ key: "ending", label: "Ending", slot: 1, values: view.calendar.map((w) => w.count) }]} />
        </ChartFrame>
      </div>

      <section aria-labelledby="worklist-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="worklist-title" className="text-h4 text-ink">Renewal worklist</h2>
            <p className="text-label text-ink-muted">In grace now, or ending in the next {view.worklist.days} days, with nothing renewing them yet. {view.worklist.total.toLocaleString("en-IN")} in all.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Worklist window" className="flex gap-1">
              {[7, 30, 60, 90].map((days) => (
                <Link key={days} href={daysLink(days)} aria-current={view.worklist.days === days ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded-control border px-3 text-sm", view.worklist.days === days ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted")}>{days} days</Link>
              ))}
            </nav>
            {shell.canExport ? <ExportLink shell={shell} report="worklist" extra={`days=${view.worklist.days}`} /> : null}
          </div>
        </div>
        {view.worklist.rows.length ? <RenewalWorklist slug={shell.org.slug} rows={view.worklist.rows} canRemind={view.canRemind} /> : <EmptyState mood="sleepy" title="Nothing due">No memberships end in this window, and nobody is in grace.</EmptyState>}
      </section>

      <ChartFrame title="Cohort retention" description="Members by the month they first joined: the share still active at the end of each later month (0 is the joining month)." action={shell.canExport ? <ExportLink shell={shell} report="cohorts" /> : null}>
        <HeatTable label="Share of each joining cohort still active" columns={Array.from({ length: 12 }, (_, i) => String(i))} rows={view.cohorts} />
      </ChartFrame>

      <ChartFrame title="Cohort retention by financial year" description="Members by the financial year they first joined: the share still active at the end of that year and each later one (0 is the joining year).">
        <HeatTable label="Share of each financial-year cohort still active" columns={Array.from({ length: 5 }, (_, i) => String(i))} rows={view.fyCohorts} />
      </ChartFrame>

      <section aria-labelledby="lapsed-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="lapsed-title" className="text-h4 text-ink">Lapsed and not back</h2>
            <p className="text-label text-ink-muted">Lapsed in the period with no membership since: the win-back list. {view.lapsed.total.toLocaleString("en-IN")} in all{view.lapsed.total > 50 ? "; the latest 50 shown" : ""}.</p>
          </div>
          {shell.canExport ? <ExportLink shell={shell} report="lapsed" /> : null}
        </div>
        {view.lapsed.rows.length ? (
          <Table label="Lapsed members">
            <THead><tr><TH>Member</TH><TH>Plan</TH><TH>Lapsed on</TH></tr></THead>
            <TBody>
              {view.lapsed.rows.map((row) => (
                <TR key={row.termId}>
                  <TD><Link href={`/dashboard/${shell.org.slug}/members/${row.memberId}`} className="font-semibold text-ink underline-offset-4 hover:underline">{row.name}</Link><span className="block text-caption text-ink-muted">#{row.memberNumber}</span></TD>
                  <TD className="text-ink-secondary">{row.plan}</TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{row.lapsedOn}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState mood="sleepy" title="Nobody lapsed">No memberships lapsed in this period without coming back.</EmptyState>}
      </section>
    </ReportShell>
  );
}

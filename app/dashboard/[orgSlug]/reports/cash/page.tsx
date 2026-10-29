import type { Metadata } from "next";
import { loadOrgReportsCash, type OrgReportsCash } from "@/lib/views/app__dashboard__orgSlug__reports__cash__page";
import type { ReportSearch } from "@/lib/reports/context";
import { formatTotals } from "@/lib/reports/money";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { ReportShell } from "@/components/reports/ReportShell";
import { KpiTile } from "@/components/reports/charts/Figures";
import { EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "Cash in hand", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

function CashTable({ view, title, who, rows }: { view: OrgReportsCash; title: string; who: string; rows: OrgReportsCash["byCollector"] }) {
  const day = (iso: string) => formatCalendarDate(localDate(new Date(iso), view.timezone));
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-h4 text-ink">{title}</h2>
      <Table label={title}>
        <THead>
          <tr><TH>{who}</TH><TH>Holding</TH><TH className="hidden sm:table-cell">Not yet confirmed</TH><TH className="hidden md:table-cell">Payments</TH><TH>Oldest</TH></tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.key}>
              <TD className="font-semibold text-ink">{row.label}</TD>
              <TD className="tabular-nums">{formatTotals(row.held, view.locale)}</TD>
              <TD className="hidden tabular-nums text-ink-secondary sm:table-cell">{formatTotals(row.awaiting, view.locale)}</TD>
              <TD className="hidden tabular-nums text-ink-secondary md:table-cell">{row.payments}</TD>
              <TD className="whitespace-nowrap text-ink-secondary">{day(row.oldest)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </section>
  );
}

export default async function OrgReportsCashPage({ params, searchParams }: Props) {
  const view = await loadOrgReportsCash({ params, searchParams });
  return (
    <ReportShell shell={view.shell} title="Cash in hand">
      <p className="max-w-[720px] text-body-ui text-ink-secondary">
        Offline money the team recorded in this period, net of refunds, by who took it and by the member&apos;s unit. Payments members submitted themselves are left out.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
        <KpiTile label="Recorded by the team" value={null} display={formatTotals(view.held, view.locale)} hint={`${view.payments} ${view.payments === 1 ? "payment" : "payments"}, net of refunds`} />
        <KpiTile label="Not yet confirmed" value={null} display={formatTotals(view.awaiting, view.locale)} hint="Waiting for a second person" />
      </div>
      {view.byCollector.length ? (
        <>
          <CashTable view={view} title="By collector" who="Collected by" rows={view.byCollector} />
          {view.byUnit.length ? <CashTable view={view} title="By unit" who="Unit" rows={view.byUnit} /> : null}
        </>
      ) : (
        <EmptyState mood="sleepy" title="No cash recorded">Nobody on the team recorded an offline payment in this period.</EmptyState>
      )}
    </ReportShell>
  );
}

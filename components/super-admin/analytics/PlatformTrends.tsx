import Link from "next/link";
import type { SuperAdminAnalyticsView } from "@/lib/views/app__super-admin__analytics__page";
import { formatAmount } from "@/lib/reports/money";
import { ChartFrame } from "@/components/reports/charts/ChartFrame";
import { ColumnChart } from "@/components/reports/charts/ColumnChart";
import { TrendChart } from "@/components/reports/charts/TrendChart";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

/**
 * Platform trends (H7): members across every organisation, organisations going live and the applications
 * funnel, revenue per currency (one chart each, never converted), and failures by organisation.
 */
export function PlatformTrends({ trends }: { trends: SuperAdminAnalyticsView["trends"] }) {
  const { members, applications, revenue, failures } = trends;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Active members, all organisations" description="At each month end, from the daily rollup." table={{ columns: ["Month", "Active", "In grace", "Organisations"], rows: members.map((p) => [p.label, p.active, p.grace, p.tenants]) }}>
          <TrendChart ariaLabel="Active members across all organisations at each month end" area labels={members.map((p) => p.label)} series={[{ key: "active", label: "Active members", slot: 1, values: members.map((p) => p.active) }]} />
        </ChartFrame>
        <ChartFrame title="New organisations and applications" description="Went live (added by an admin or approved), applied and declined, each month." table={{ columns: ["Month", "Went live", "Applied", "Declined"], rows: applications.map((p) => [p.label, p.live, p.applied, p.declined]) }}>
          <ColumnChart
            ariaLabel="Organisations going live, applying and declined each month"
            labels={applications.map((p) => p.label)}
            series={[{ key: "live", label: "Went live", slot: 1, values: applications.map((p) => p.live) }, { key: "applied", label: "Applied", slot: 2, values: applications.map((p) => p.applied) }, { key: "declined", label: "Declined", slot: 3, values: applications.map((p) => p.declined) }]}
          />
        </ChartFrame>
      </div>
      {revenue.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {revenue.map(({ currency, points }) => (
            <ChartFrame key={currency} title={`Revenue each month, ${currency}`} description="Paid across every organisation, by payment date; refunds by the date they were made." table={{ columns: ["Month", "Paid", "Refunded", "Net"], rows: points.map((p) => [p.label, formatAmount(p.gross, currency), formatAmount(p.refunds, currency), formatAmount(p.net, currency)]) }}>
              <ColumnChart ariaLabel={`Money paid and refunded each month in ${currency}`} format={`money:${currency}`} labels={points.map((p) => p.label)} series={[{ key: "gross", label: "Paid", slot: 1, values: points.map((p) => p.gross) }, { key: "refunds", label: "Refunded", slot: 2, values: points.map((p) => p.refunds) }]} />
            </ChartFrame>
          ))}
        </div>
      ) : (
        <ChartFrame title="Revenue each month" description="Paid across every organisation, per currency.">
          <p className="text-label text-ink-muted">No payments in the last 12 months.</p>
        </ChartFrame>
      )}
      <ChartFrame title="Failures by organisation" description="Last 30 days: failed payments, payment webhooks that matched nothing, and emails and messages that gave up.">
        {failures.length ? (
          <Table label="Failures by organisation">
            <THead>
              <TR>
                <TH>Organisation</TH>
                <TH className="text-right">Payments</TH>
                <TH className="text-right">Webhooks</TH>
                <TH className="text-right">Outbox</TH>
              </TR>
            </THead>
            <TBody>
              {failures.map((row) => (
                <TR key={row.id}>
                  <TD><Link href={`/super-admin/orgs/${row.id}/analytics`} className="font-semibold text-ink underline-offset-4 hover:underline">{row.name}</Link></TD>
                  <TD className="text-right tabular-nums">{row.payments}</TD>
                  <TD className="text-right tabular-nums">{row.webhooks}</TD>
                  <TD className="text-right tabular-nums">{row.outbox}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="text-label text-ink-muted">No failures in the last 30 days.</p>
        )}
      </ChartFrame>
    </>
  );
}

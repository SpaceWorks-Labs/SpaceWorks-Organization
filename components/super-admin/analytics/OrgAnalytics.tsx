import type { SuperAdminOrgAnalyticsView } from "@/lib/views/app__super-admin__orgs__orgId__analytics__page";
import { formatAmount, formatTotals } from "@/lib/reports/money";
import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { BarList } from "@/components/reports/charts/BarList";
import { ChartFrame } from "@/components/reports/charts/ChartFrame";
import { ColumnChart } from "@/components/reports/charts/ColumnChart";
import { KpiTile, Meter } from "@/components/reports/charts/Figures";
import { TrendChart } from "@/components/reports/charts/TrendChart";

const day = (date: Date | null) => (date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date)) : "Never");

/** One organisation's aggregates for the platform super admin (H7): counts, unit totals and money per currency. */
export function OrgAnalytics({ view }: { view: SuperAdminOrgAnalyticsView }) {
  const { trend, renewal, revenue, breakdown, limits } = view;
  const latest = [...trend].reverse().find((point) => point.active !== null);
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <KpiTile label="Active members" value={latest?.active ?? null} trend={trend.flatMap((p) => (p.active === null ? [] : [p.active]))} hint={latest ? `${latest.grace ?? 0} in grace · ${latest.expired ?? 0} expired` : "No rollup yet"} />
        <KpiTile label="Renewal rate, 12 months" value={renewal.rate} format="percent" hint={`${renewal.renewed} renewed · ${renewal.lapsed} lapsed`} />
        <KpiTile label="Outstanding now" value={null} display={formatTotals(view.outstanding)} hint="Per currency" />
        <KpiTile label="Last staff sign-in" value={null} display={day(view.lastSignIn)} hint={`Last payment: ${day(view.lastPayment)}`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Members at each month end" description="Active, in grace and expired, from the daily rollup." table={{ columns: ["Month", "Active", "In grace", "Expired"], rows: trend.map((p) => [p.label, p.active ?? "—", p.grace ?? "—", p.expired ?? "—"]) }}>
          <TrendChart
            ariaLabel="Active, in grace and expired members at each month end"
            labels={trend.map((p) => p.label)}
            series={[{ key: "active", label: "Active", slot: 1, values: trend.map((p) => p.active) }, { key: "grace", label: "In grace", slot: 2, values: trend.map((p) => p.grace) }, { key: "expired", label: "Expired", slot: "muted", values: trend.map((p) => p.expired) }]}
          />
        </ChartFrame>
        <ChartFrame title="Joined, renewed and lapsed" description="Each month, from the daily rollup." table={{ columns: ["Month", "Joined", "Renewed", "Lapsed"], rows: trend.map((p) => [p.label, p.joined, p.renewed, p.lapsed]) }}>
          <ColumnChart ariaLabel="Members joined, renewed and lapsed each month" labels={trend.map((p) => p.label)} series={[{ key: "joined", label: "Joined", slot: 1, values: trend.map((p) => p.joined) }, { key: "renewed", label: "Renewed", slot: 2, values: trend.map((p) => p.renewed) }, { key: "lapsed", label: "Lapsed", slot: 3, values: trend.map((p) => p.lapsed) }]} />
        </ChartFrame>
      </div>
      {revenue.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {revenue.map(({ currency, points }) => (
            <ChartFrame key={currency} title={`Revenue each month, ${currency}`} description="By payment date; refunds by the date they were made." table={{ columns: ["Month", "Paid", "Refunded", "Net"], rows: points.map((p) => [p.label, formatAmount(p.gross, currency), formatAmount(p.refunds, currency), formatAmount(p.net, currency)]) }}>
              <ColumnChart ariaLabel={`Money paid and refunded each month in ${currency}`} format={`money:${currency}`} labels={points.map((p) => p.label)} series={[{ key: "gross", label: "Paid", slot: 1, values: points.map((p) => p.gross) }, { key: "refunds", label: "Refunded", slot: 2, values: points.map((p) => p.refunds) }]} />
            </ChartFrame>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title={`Active members by ${view.levelName.toLowerCase()}`} description={view.rollupDay ? `Top level, on ${day(view.rollupDay)}.` : "Fills in after the next rollup."} table={{ columns: [view.levelName, "Active", "In grace", "Expired"], rows: breakdown.map((row) => [row.name, row.active, row.grace, row.expired]) }}>
          <BarList label={`Active members by ${view.levelName.toLowerCase()}`} empty="This organisation has no units." items={breakdown.map((row) => ({ key: row.key, label: row.name, value: row.active, hint: `${row.grace} in grace · ${row.expired} expired` }))} />
        </ChartFrame>
        <AdminPanel title="Limits used" description={`Failed payments in the last 30 days: ${view.failedPayments30}.`}>
          <div className="flex flex-col gap-3">
            <Meter label="Members" value={limits.members} max={limits.memberLimit} />
            <Meter label="Team" value={limits.team} max={limits.managerLimit} />
          </div>
        </AdminPanel>
      </div>
    </>
  );
}

import type { HomeAnalytics } from "@/lib/reports/homeData";
import { formatAmount, formatTotals } from "@/lib/reports/money";
import { ChartFrame } from "@/components/reports/charts/ChartFrame";
import { ColumnChart } from "@/components/reports/charts/ColumnChart";
import { KpiTile } from "@/components/reports/charts/Figures";
import { TrendChart } from "@/components/reports/charts/TrendChart";

/**
 * The dashboard home's charts (H6): active members over 12 months, joined against lapsed, renewals due in the
 * next 30 days, money collected per currency (one chart each, never added together) and outstanding. Every
 * chart keeps the viewer's unit scope and has a table twin.
 */
export function HomeCharts({ slug, analytics }: { slug: string; analytics: HomeAnalytics }) {
  const reports = `/dashboard/${slug}/reports`;
  const { membership, money } = analytics;
  const scopeNote = analytics.scoped ? " Your unit and everything under it." : "";
  return (
    <section aria-labelledby="home-charts" className="flex flex-col gap-4">
      <h2 id="home-charts" className="text-title text-ink">The last 12 months</h2>
      {membership ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartFrame
            title="Active members"
            description={`At each month end; members in grace are not counted.${scopeNote}`}
            drill={{ href: reports, label: "Open reports" }}
            table={{ columns: ["Month", "Active"], rows: membership.months.map((p) => [p.label, p.active]) }}
          >
            <TrendChart ariaLabel="Active members at each month end" area labels={membership.months.map((p) => p.label)} series={[{ key: "active", label: "Active members", slot: 1, values: membership.months.map((p) => p.active) }]} />
          </ChartFrame>
          <ChartFrame
            title="Joined and lapsed each month"
            description="New members against memberships that lapsed after their grace period."
            drill={{ href: `${reports}/renewals`, label: "Renewals report" }}
            table={{ columns: ["Month", "Joined", "Lapsed"], rows: membership.months.map((p) => [p.label, p.joined, p.lapsed]) }}
          >
            <ColumnChart ariaLabel="Members joined and lapsed each month" labels={membership.months.map((p) => p.label)} series={[{ key: "joined", label: "Joined", slot: 1, values: membership.months.map((p) => p.joined) }, { key: "lapsed", label: "Lapsed", slot: 2, values: membership.months.map((p) => p.lapsed) }]} />
          </ChartFrame>
          <ChartFrame
            title="Renewals due in the next 30 days"
            description={`${membership.due.reduce((sum, week) => sum + week.count, 0).toLocaleString("en-IN")} active memberships end with no renewal yet, by week.`}
            drill={{ href: `/dashboard/${slug}/members?status=expiring`, label: "See members" }}
            table={{ columns: ["Week", "Ending"], rows: membership.due.map((week) => [week.label, week.count]) }}
          >
            <ColumnChart ariaLabel="Memberships ending each week over the next 30 days" labels={membership.due.map((week) => week.label)} series={[{ key: "due", label: "Ending", slot: 1, values: membership.due.map((week) => week.count) }]} />
          </ChartFrame>
          {money ? <OutstandingTile reports={reports} money={money} /> : null}
        </div>
      ) : money ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><OutstandingTile reports={reports} money={money} /></div>
      ) : null}
      {money && money.currencies.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {money.currencies.map(({ currency, points }) => (
            <ChartFrame
              key={currency}
              title={`Collected each month, ${currency}`}
              description="By payment date; refunds by the date they were made."
              drill={{ href: `${reports}/money?period=12m`, label: "Money report" }}
              table={{ columns: ["Month", "Collected", "Refunded", "Net"], rows: points.map((p) => [p.label, formatAmount(p.gross, currency), formatAmount(p.refunds, currency), formatAmount(p.net, currency)]) }}
            >
              <ColumnChart ariaLabel={`Money collected and refunded each month in ${currency}`} format={`money:${currency}`} labels={points.map((p) => p.label)} series={[{ key: "gross", label: "Collected", slot: 1, values: points.map((p) => p.gross) }, { key: "refunds", label: "Refunded", slot: 2, values: points.map((p) => p.refunds) }]} />
            </ChartFrame>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OutstandingTile({ reports, money }: { reports: string; money: NonNullable<HomeAnalytics["money"]> }) {
  return (
    <KpiTile
      className="self-start"
      label="Outstanding now"
      value={null}
      display={formatTotals(money.outstanding)}
      hint={money.outstandingCount ? `${money.outstandingCount.toLocaleString("en-IN")} unpaid charge${money.outstandingCount === 1 ? "" : "s"}, per currency` : "Nothing owed"}
      href={`${reports}/money`}
    />
  );
}

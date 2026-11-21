import type { SuperAdminGrowthView } from "@/lib/views/app__super-admin__analytics__growth";
import { ChartFrame } from "@/components/reports/charts/ChartFrame";
import { StackedColumnChart } from "@/components/reports/charts/StackedColumnChart";
import { TrendChart } from "@/components/reports/charts/TrendChart";
import { byWeek, count, percent } from "./format";
import { Empty } from "./parts";

const FLOWS = ["joined", "renewed", "lapsed", "reinstated"] as const;

/**
 * Growth over the range, one bucket per day (30 and 90 days) or month (12 months, financial year): active and
 * grace members, the flows in and out, renewal and churn rates, and organisations created and live. Each
 * chart carries a table with the same numbers.
 */
export function GrowthCharts({ view }: { view: SuperAdminGrowthView }) {
  const { series, organisationSeries: orgs } = view;
  const per = view.unit === "day" ? "day" : "month";
  const rolledUp = series.some((point) => point.active !== null);
  // Four bars a slot cannot fit 30 or 90 daily slots, so daily ranges show the flows a week at a time.
  const flows = view.unit === "day" ? byWeek(series, FLOWS) : series;
  const flowPer = view.unit === "day" ? "week (labelled by its first day)" : "month";
  const rates = series.flatMap((point) => [point.renewalRate, point.churnRate]).filter((value): value is number => value !== null);
  const labels = series.map((point) => point.label);
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Active and in grace"
          description={`Members across every organisation at the end of each ${per}, from the daily rollup.`}
          table={rolledUp ? { columns: [view.unit === "day" ? "Day" : "Month", "Active", "In grace"], rows: series.map((p) => [p.label, count(p.active), count(p.grace)]) } : undefined}
        >
          {rolledUp ? (
            <TrendChart ariaLabel={`Active and in-grace members at the end of each ${per}`} labels={labels} series={[{ key: "active", label: "Active", slot: 1, values: series.map((p) => p.active) }, { key: "grace", label: "In grace", slot: 2, values: series.map((p) => p.grace) }]} />
          ) : (
            <Empty>No rollup for this range yet. The daily report rollup fills this in.</Empty>
          )}
        </ChartFrame>
        <ChartFrame
          title="Joined, renewed, lapsed and reinstated"
          description={`Membership changes each ${flowPer}.`}
          table={{ columns: [view.unit === "day" ? "Week from" : "Month", "Joined", "Renewed", "Lapsed", "Reinstated"], rows: flows.map((p) => [p.label, count(p.joined), count(p.renewed), count(p.lapsed), count(p.reinstated)]) }}
        >
          {flows.some((p) => FLOWS.some((key) => p[key] > 0)) ? (
            <StackedColumnChart
              ariaLabel={`Members joined, renewed, lapsed and reinstated each ${flowPer}`}
              labels={flows.map((p) => p.label)}
              columns={[
                [{ key: "joined", label: "Joined", slot: 1, values: flows.map((p) => p.joined) }],
                [{ key: "renewed", label: "Renewed", slot: 2, values: flows.map((p) => p.renewed) }],
                [{ key: "lapsed", label: "Lapsed", slot: 3, values: flows.map((p) => p.lapsed) }],
                [{ key: "reinstated", label: "Reinstated", slot: 4, values: flows.map((p) => p.reinstated) }],
              ]}
            />
          ) : (
            <Empty>No members joined, renewed, lapsed or were reinstated in this range.</Empty>
          )}
        </ChartFrame>
        <ChartFrame
          title="Organisations created"
          description={`New organisations each ${per}, whatever their status now.`}
          table={{ columns: [view.unit === "day" ? "Day" : "Month", "Created"], rows: orgs.map((p) => [p.label, count(p.created)]) }}
        >
          {orgs.some((p) => p.created > 0) ? (
            <StackedColumnChart ariaLabel={`Organisations created each ${per}`} labels={orgs.map((p) => p.label)} columns={[[{ key: "created", label: "Created", slot: 1, values: orgs.map((p) => p.created) }]]} />
          ) : (
            <Empty>No organisations were created in this range.</Empty>
          )}
        </ChartFrame>
        <ChartFrame
          title="Live organisations"
          description={`Active or suspended organisations at the end of each ${per}, by the date each was created.`}
          table={{ columns: [view.unit === "day" ? "Day" : "Month", "Live"], rows: orgs.map((p) => [p.label, count(p.live)]) }}
        >
          {orgs.some((p) => p.live > 0) ? (
            <TrendChart ariaLabel={`Live organisations at the end of each ${per}`} area labels={orgs.map((p) => p.label)} series={[{ key: "live", label: "Live organisations", slot: 1, values: orgs.map((p) => p.live) }]} />
          ) : (
            <Empty>No live organisations yet.</Empty>
          )}
        </ChartFrame>
      </div>
      <ChartFrame
        title="Renewal and churn rates"
        description={`Each ${per}: renewals against renewals and lapses, and lapses against members active at the start.`}
        table={rates.length ? { columns: [view.unit === "day" ? "Day" : "Month", "Renewal rate", "Churn rate"], rows: series.map((p) => [p.label, percent(p.renewalRate), percent(p.churnRate)]) } : undefined}
      >
        {rates.length ? (
          <TrendChart
            ariaLabel={`Renewal rate and churn rate each ${per}`}
            format="percent"
            yMax={Math.max(0.1, ...rates)}
            labels={labels}
            series={[{ key: "renewal", label: "Renewal rate", slot: 1, values: series.map((p) => p.renewalRate) }, { key: "churn", label: "Churn rate", slot: 2, values: series.map((p) => p.churnRate) }]}
          />
        ) : (
          <Empty>No renewals or lapses to make a rate from in this range.</Empty>
        )}
      </ChartFrame>
    </>
  );
}

import type { VisitSummary } from "@/lib/reports/visits";
import { BarList } from "@/components/reports/charts/BarList";
import { ChartFrame } from "@/components/reports/charts/ChartFrame";
import { ColumnChart } from "@/components/reports/charts/ColumnChart";
import { KpiTile } from "@/components/reports/charts/Figures";

/** Visits over time and by page. Counts only; shared by the organisation report and the super-admin views. */
export function VisitsCharts({ summary, noun = "public pages" }: { summary: VisitSummary; noun?: string }) {
  const perDay = summary.unit === "day" && summary.trend.length ? summary.total / summary.trend.length : null;
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <KpiTile label="Visits" value={summary.total} hint={`Views of ${noun}`} />
        {perDay !== null ? <KpiTile label="Average per day" value={Math.round(perDay * 10) / 10} hint="Across the period" /> : null}
        <KpiTile label="Busiest page" value={null} display={summary.byRoute[0]?.label ?? "None yet"} hint={summary.byRoute[0] ? `${summary.byRoute[0].count} visits` : "Counted from the first visit"} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title={summary.unit === "day" ? "Visits each day" : "Visits each month"} description="Page views, counted without cookies or personal details. Days are UTC days." table={{ columns: [summary.unit === "day" ? "Day" : "Month", "Visits"], rows: summary.trend.map((point) => [point.label, point.count]) }}>
          <ColumnChart ariaLabel={`Visits to ${noun} each ${summary.unit}`} labels={summary.trend.map((point) => point.label)} series={[{ key: "visits", label: "Visits", slot: 1, values: summary.trend.map((point) => point.count) }]} />
        </ChartFrame>
        <ChartFrame title="Visits by page" description="Each kind of page, not each address." table={{ columns: ["Page", "Template", "Visits"], rows: summary.byRoute.map((row) => [row.label, row.route, row.count]) }}>
          <BarList label={`Visits by page on ${noun}`} empty="No visits counted in this period." items={summary.byRoute.map((row) => ({ key: row.route, label: row.label, value: row.count, hint: `${Math.round(row.share * 100)}% of visits` }))} />
        </ChartFrame>
      </div>
    </>
  );
}

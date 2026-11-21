import type { SuperAdminGrowthView } from "@/lib/views/app__super-admin__analytics__growth";
import { StackedBar } from "@/components/reports/charts/BarList";
import { ChartFrame } from "@/components/reports/charts/ChartFrame";
import { previousLabel } from "./AnalyticsShell";
import { ComparedTile, Section, tileGrid } from "./parts";

/**
 * The growth headlines, each against the previous period of the same length, and organisations by status now.
 * Lapses and churn are worse when they rise, so their chips turn red on a rise. Rates compare in points.
 */
export function GrowthTiles({ view }: { view: SuperAdminGrowthView }) {
  const { headlines: h, organisations: o } = view;
  const vs = previousLabel(view.range);
  return (
    <>
      <Section id="growth-headlines" title="Headlines" description={`${view.label}. Members and organisations at the end of the range; joins, renewals and lapses during it.`}>
        <div className={tileGrid}>
          <ComparedTile label="Live organisations" comparison={h.organisationsLive} vs={vs} />
          <ComparedTile label="Organisations created" comparison={h.organisationsCreated} vs={vs} />
          <ComparedTile label="Members, all records" comparison={h.membersTotal} vs={vs} />
          <ComparedTile label="Active members" comparison={h.membersActive} vs={vs} />
          <ComparedTile label="Joined" comparison={h.joins} vs={vs} />
          <ComparedTile label="Renewed" comparison={h.renewals} vs={vs} />
          <ComparedTile label="Lapsed" comparison={h.lapses} vs={vs} higherIsBetter={false} />
          <ComparedTile label="Reinstated" comparison={h.reinstatements} vs={vs} />
          <ComparedTile label="Renewal rate" comparison={h.renewalRate} kind="rate" vs={vs} hint="Renewals against renewals and lapses" />
          <ComparedTile label="Churn rate" comparison={h.churnRate} kind="rate" vs={vs} higherIsBetter={false} hint="Lapses against active at the start" />
        </div>
      </Section>
      <ChartFrame title="Organisations by status" description={`All ${o.total.toLocaleString("en-IN")} organisations now. Closed means not approved or archived. No history of status is kept, so this has no comparison.`}>
        {o.total ? (
          <StackedBar
            label="Organisations by status now"
            segments={[
              { key: "active", label: "Active", value: o.active },
              { key: "suspended", label: "Suspended", value: o.suspended },
              { key: "pending", label: "Under review", value: o.pending },
              { key: "closed", label: "Closed", value: o.closed },
            ]}
          />
        ) : (
          <p className="text-label text-ink-muted">No organisations yet.</p>
        )}
      </ChartFrame>
    </>
  );
}

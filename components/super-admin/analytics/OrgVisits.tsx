import type { SuperAdminOrgVisitsView } from "@/lib/views/app__super-admin__orgs__orgId__analytics__visits";
import { VisitsCharts } from "@/components/reports/visits/VisitsCharts";

/** One organisation's public-page visits over the last 30 days. */
export function OrgVisits({ view }: { view: SuperAdminOrgVisitsView }) {
  return (
    <section aria-labelledby="org-visits" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="org-visits" className="text-title text-ink">Web visits</h2>
        <p className="text-label text-ink-muted">Visits to this organisation&apos;s public pages over the last {view.days} days. Counts only.</p>
      </div>
      <VisitsCharts summary={view.summary} />
    </section>
  );
}

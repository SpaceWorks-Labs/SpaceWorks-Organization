import Link from "next/link";
import type { SuperAdminWebAnalyticsView } from "@/lib/views/app__super-admin__analytics__web";
import type { Purpose } from "@/lib/telemetry/policy";
import { VisitsCharts } from "@/components/reports/visits/VisitsCharts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const PURPOSES: Array<[Purpose, string]> = [["analytics", "Analytics"], ["replay", "Replay"], ["diagnostics", "Diagnostics"]];

/** Platform visit totals and the organisations that have outside providers set up. Aggregates and provider names only. */
export function WebAnalytics({ view }: { view: SuperAdminWebAnalyticsView }) {
  return (
    <section aria-labelledby="web-analytics" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="web-analytics" className="text-title text-ink">Web analytics</h2>
        <p className="text-label text-ink-muted">
          Visits to the platform&apos;s own public pages over the last {view.days} days, counted by this site without cookies or personal details. Organisations&apos; public pages made {view.organisationVisits.toLocaleString("en-IN")} visits in the same time.
        </p>
      </div>
      <VisitsCharts summary={view.platform} noun="platform pages" />
      <h3 className="text-label font-semibold text-ink">Organisations with outside providers</h3>
      {view.organisations.length ? (
        <Table label="Organisations with outside web analytics">
          <THead>
            <TR>
              <TH>Organisation</TH>
              {PURPOSES.map(([, label]) => <TH key={label}>{label}</TH>)}
              <TH className="text-right">Visits, {view.days} days</TH>
            </TR>
          </THead>
          <TBody>
            {view.organisations.map((org) => (
              <TR key={org.id}>
                <TD><Link href={`/dashboard/${org.slug}/settings/analytics`} className="font-semibold text-ink underline-offset-4 hover:underline">{org.name}</Link></TD>
                {PURPOSES.map(([purpose]) => <TD key={purpose}>{org.providers.filter((item) => item.purpose === purpose).map((item) => item.name).join(", ") || "None"}</TD>)}
                <TD className="text-right tabular-nums">{org.visits.toLocaleString("en-IN")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <p className="text-label text-ink-muted">No organisation has set up an outside provider.</p>
      )}
    </section>
  );
}

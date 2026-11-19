import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminMonitoringView } from "@/lib/views/app__super-admin__monitoring__page";
import { CheckCircle2, XCircle } from "lucide-react";
import { Histogram } from "@/components/super-admin/Histogram";
import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { Chip, EmptyState, PageHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

function OkChip(props: { ok: boolean; labelOk?: string; labelBad?: string; }) {
  return (
    <Chip tone={props.ok ? "success" : "danger"} icon={props.ok ? <CheckCircle2 /> : <XCircle />}>
      {props.ok ? props.labelOk ?? "OK" : props.labelBad ?? "Error"}
    </Chip>
  );
}

export default async function SuperAdminMonitoringPage() {
  await requireSuperAdmin();
  const { dbName, dbOk, configuredDbUrl, configuredAuthSecret, configuredSuperAdmin, snapshot } = await loadSuperAdminMonitoringView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Monitoring" description="Health checks and API request stats for this server." />

      <AdminPanel title="Health checks">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip tone="outline">{`DB: ${dbName ?? "unknown"}`}</Chip>
            <OkChip ok={dbOk} labelOk="DB reachable" labelBad="DB down" />
            <OkChip ok={configuredDbUrl} labelOk="DATABASE_URL set" labelBad="DATABASE_URL missing" />
            <OkChip ok={configuredAuthSecret} labelOk="AUTH_SECRET set" labelBad="AUTH_SECRET missing" />
            <OkChip ok={configuredSuperAdmin} labelOk="SUPER_ADMIN_EMAIL set" labelBad="SUPER_ADMIN_EMAIL missing" />
          </div>
          <p className="text-sm text-ink-muted">
            For external uptime monitors: use <code className="code-text text-[0.9em] text-ink">/api/health</code> and <code className="code-text text-[0.9em] text-ink">/api/health/db</code>.
          </p>
        </div>
      </AdminPanel>

      <AdminPanel title="API request stats (in-memory)" description="These stats reset on server restart and are not shared across multiple instances.">
        {snapshot.routes.length === 0 ? (
          <EmptyState mood="sleepy">No traffic observed yet.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            <Table label="API request stats">
              <THead>
                <tr>
                  <TH>Route</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Errors (5xx)</TH>
                  <TH>Last error</TH>
                  <TH>Last seen</TH>
                </tr>
              </THead>
              <TBody>
                {snapshot.routes.map((r) => (
                  <TR key={r.routeId}>
                    <TD className="tabular-nums text-sm">{r.routeId}</TD>
                    <TD className="text-right tabular-nums">{r.total.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">{r.errors.toLocaleString()}</TD>
                    <TD className="text-ink-secondary">{r.lastErrorAt ? `${new Date(r.lastErrorAt).toLocaleString()} · ${r.lastErrorMessage ?? ""}` : "—"}</TD>
                    <TD className="text-ink-secondary">{r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {snapshot.routes.map((r) => (
                <Histogram
                  key={`${r.routeId}:hist`}
                  title={`${r.routeId} · latency buckets`}
                  buckets={Object.entries(r.buckets).map(([label, count]) => ({ label, count }))}
                />
              ))}
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

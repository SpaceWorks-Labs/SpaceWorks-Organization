import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminReportsView } from "@/lib/views/app__super-admin__reports__page";
import { formatBytes } from "@/lib/superAdminInsights";
import { formatHours, formatValue } from "@/lib/reports/chartScale";
import { formatAmount } from "@/lib/reports/money";
import { actionLabel } from "@/lib/reports/activity";
import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { OrganisationStatusChip } from "@/components/org/OrganisationStatusChip";
import { BarList, StackedBar } from "@/components/reports/charts/BarList";
import { ChartFrame, DataTable } from "@/components/reports/charts/ChartFrame";
import { KpiTile, Meter } from "@/components/reports/charts/Figures";
import { TrendChart } from "@/components/reports/charts/TrendChart";
import { Chip, PageHeader } from "@/components/ui/display";
import { cn } from "@/lib/cn";

type Props = { searchParams: Promise<{ window?: string }> };

const WINDOW_LABELS = { "30d": "30 days", "90d": "90 days", "12m": "12 months" } as const;
const JOB_LABELS: Record<string, string> = { "outbox-scheduler": "Email and membership sweep", "report-rollup": "Report rollup" };
const when = (date: Date | null) => (date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date)) : "Never");

export default async function SuperAdminReportsPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const view = await loadSuperAdminReportsView({ searchParams });
  const { pipeline, tenants, health } = view;
  const latest = tenants.series.at(-1);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Platform reports" description="Organisations, members across them, usage, payments and the health of the instance. Counts only, never personal data." />
      <nav aria-label="Window" className="flex flex-wrap gap-2">
        {(Object.keys(WINDOW_LABELS) as Array<keyof typeof WINDOW_LABELS>).map((key) => (
          <Link key={key} href={`/super-admin/reports?window=${key}`} aria-current={view.window === key ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded-control border px-3.5 text-sm", view.window === key ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted")}>Last {WINDOW_LABELS[key]}</Link>
        ))}
      </nav>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <KpiTile label="Organisations with active members" value={latest?.tenants ?? 0} trend={tenants.series.map((p) => p.tenants)} />
        <KpiTile label="Active members, all organisations" value={latest?.active ?? 0} trend={tenants.series.map((p) => p.active)} hint={`${latest?.grace ?? 0} in grace`} />
        <KpiTile label="Applications received" value={pipeline.submitted} hint={`${pipeline.approved} approved, ${pipeline.rejected} declined`} href="/super-admin/orgs?status=PENDING_REVIEW" />
        <KpiTile label="Time to approve an organisation" value={null} display={formatHours(pipeline.medianHoursToApprove)} hint="Median, submitted to approved" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Members across organisations" description="Active at each month end, from the daily rollup." table={{ columns: ["Month", "Active", "In grace", "Organisations"], rows: tenants.series.map((p) => [p.label, p.active, p.grace, p.tenants]) }}>
          <TrendChart ariaLabel="Active members across all organisations" area labels={tenants.series.map((p) => p.label)} series={[{ key: "active", label: "Active members", slot: 1, values: tenants.series.map((p) => p.active) }]} />
        </ChartFrame>
        <ChartFrame title="Organisations by status" description="A1 tenant pipeline, right now.">
          <StackedBar label="Organisations by status" segments={pipeline.byStatus.map((row) => ({ key: row.status, label: row.status.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()), value: row.count, href: `/super-admin/orgs?status=${row.status}` }))} />
          {pipeline.waiting.length ? (
            <ul className="mt-4 flex flex-col divide-y divide-line border-t border-line">
              {pipeline.waiting.map((org) => (
                <li key={org.id}><Link href={`/super-admin/orgs/${org.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-label hover:text-accent-text"><span className="min-w-0 truncate">{org.name}</span><span className="flex items-center gap-2"><OrganisationStatusChip status={org.status} /><span className="text-caption text-ink-muted">since {when(org.updatedAt)}</span></span></Link></li>
              ))}
            </ul>
          ) : null}
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Largest organisations" description="A2: active members at the latest rollup.">
          <BarList label="Organisations by active members" items={tenants.top.map((org) => ({ key: org.id, label: org.name, value: org.active, href: `/super-admin/orgs/${org.id}` }))} empty="No rollup yet. It fills in on the next sweep." />
        </ChartFrame>
        <AdminPanel title="Usage against limits" description="A5: members and team against each organisation's limits, fullest first.">
          <div className="flex flex-col gap-3">
            {view.usage.map((org) => (
              <div key={org.id} className="flex flex-col gap-1.5">
                <Link href={`/super-admin/orgs/${org.id}`} className="text-label font-semibold text-ink underline-offset-4 hover:underline">{org.name}</Link>
                <Meter label="Members" value={org.members} max={org.memberLimit} />
                <Meter label="Team" value={org.managers} max={org.managerLimit} />
              </div>
            ))}
          </div>
        </AdminPanel>
      </div>

      <ChartFrame title="Payment volume" description={`A4: paid in the last ${WINDOW_LABELS[view.window]}, per currency, never converted.`}>
        {view.volume.length ? (
          <DataTable table={{ columns: ["Currency", "Payments", "Total", "Organisations", "Razorpay", "Stripe", "Offline"], rows: view.volume.map((row) => [row.currency, row.payments, formatAmount(row.minor, row.currency), row.organisations, formatAmount(row.byProvider.RAZORPAY, row.currency), formatAmount(row.byProvider.STRIPE, row.currency), formatAmount(row.byProvider.OFFLINE, row.currency)]) }} />
        ) : <p className="text-label text-ink-muted">{view.financeReady ? "No payments in this window." : "Payments are not recorded on this instance yet."}</p>}
      </ChartFrame>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminPanel title="Email outbox" description="A6. Details on the Email page.">
          <StackedBar label="Outbox messages by status" segments={health.outbox.map((row) => ({ key: row.status, label: row.status.toLowerCase().replace(/^./, (c) => c.toUpperCase()), value: row.count }))} />
          <p className="mt-3 text-label text-ink-secondary">{health.stuck} queued over 15 minutes · {formatValue(health.failureRate14d, "percent")} failed in 14 days · <Link href="/super-admin/email" className="underline underline-offset-4">Email</Link></p>
        </AdminPanel>
        <AdminPanel title="System health" description="A7: jobs, database and storage. Details on Operations and Storage.">
          <ul className="flex flex-col gap-2 text-label">
            {health.jobs.map((job) => (
              <li key={job.key} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink">{JOB_LABELS[job.key] ?? job.key}</span>
                <span className="flex items-center gap-2"><Chip size="sm" tone={job.fresh ? "success" : "warning"}>{job.fresh ? "Running" : "Late"}</Chip><span className="text-caption text-ink-muted">last ran {when(job.lastSucceededAt)}</span></span>
              </li>
            ))}
            <li className="flex justify-between gap-2"><span className="text-ink">Database</span><span className="text-ink-secondary">{health.databaseOk ? formatBytes(health.databaseBytes) : "Not reachable"}</span></li>
            <li className="flex justify-between gap-2"><span className="text-ink">Stored files</span><span className="text-ink-secondary">{health.storageObjects.toLocaleString("en-IN")} · {formatBytes(health.storageBytes)}</span></li>
            <li className="flex justify-between gap-2"><span className="text-ink">Payment webhooks</span><span className="text-ink-secondary">{view.financeReady ? "See Operations" : "Not in use yet"}</span></li>
          </ul>
        </AdminPanel>
      </div>

      <AdminPanel title="Platform admin activity" description="A8: what platform admins did, including opening an organisation's data. The full trail is on the Audit log.">
        <DataTable table={{ columns: ["When", "Who", "Action", "Organisation"], rows: view.audit.map((event) => [when(event.createdAt), event.actor?.name ?? event.actor?.email ?? "—", actionLabel(event.action), event.organisation?.name ?? "—"]) }} />
      </AdminPanel>
    </div>
  );
}

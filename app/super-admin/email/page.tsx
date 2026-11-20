import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminEmailView } from "@/lib/views/app__super-admin__email__page";
import Link from "next/link";
import { EMAIL_SERIES } from "@/lib/superAdminSeries";
import { formatShare, sumPoints } from "@/lib/superAdminInsights";
import { SparklineCard } from "@/components/super-admin/Sparkline";
import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { StatusPill } from "@/components/super-admin/StatusPill";
import { Chip, EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCount } from "@/lib/format/datetime";

const WINDOW_DAYS = 14;

const seriesLabels: Record<(typeof EMAIL_SERIES)[number], string> = {
  queued: "Queued",
  sent: "Delivered",
  failed: "Failed",
};

export default async function SuperAdminEmailPage() {
  await requireSuperAdmin();
  const { totals, stuckPending, stuckProcessing, daily, kinds, provider } = await loadSuperAdminEmailView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Email"
        description="Email volume from the outbox queue. Recipients and message contents are never shown."
        actions={<Link href="/super-admin/operations" className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline underline-offset-4 hover:text-ink-secondary">Delivery controls in Operations</Link>}
      />

      <AdminPanel title="Provider" description="How the platform sends email, and whether it is working. Shown as unavailable when it is not set up or its last test failed.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-label text-ink">{provider.label}</span>
            <StatusPill state={!provider.setUp ? "not_set_up" : provider.lastError ? "unavailable" : "available"} />
            <span className="text-caption text-ink-muted">{!provider.setUp ? "No email is sent until it is set up." : provider.lastError ? `Last test failed: ${provider.lastError}` : provider.testedAt ? "Last test went through." : "Not tested yet."}</span>
          </div>
          <p className="text-body-ui text-ink-secondary">Suppressed addresses: {formatCount(provider.bounced)} bounced, {formatCount(provider.complained)} complained. Sends skip them.</p>
          <Link href="/super-admin/settings" className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-ink underline underline-offset-4 hover:text-ink-secondary">Provider settings</Link>
        </div>
      </AdminPanel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Queued now" value={formatCount(totals.pending)} />
        <StatTile label="Waiting over 15 min" value={formatCount(stuckPending + stuckProcessing)} tone={stuckPending + stuckProcessing > 0 ? "attention" : "default"} hint={stuckProcessing > 0 ? `${stuckProcessing} locked by a worker` : undefined} />
        <StatTile label="Failed" value={formatCount(totals.failed)} tone={totals.failed > 0 ? "attention" : "default"} hint={`${formatShare(totals.failed, totals.total)} of all messages`} />
        <StatTile label="Delivered (retained)" value={formatCount(totals.sent)} hint="Link-bearing messages are deleted after delivery" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {EMAIL_SERIES.map((name) => (
          <SparklineCard key={name} title={seriesLabels[name]} subtitle={`Last ${WINDOW_DAYS} days`} total={sumPoints(daily[name])} points={daily[name]} />
        ))}
      </div>

      <AdminPanel title="By message type" description="Every message still in the outbox, grouped by kind. Messages that carry a reset, verification or invite link are deleted once delivered, so delivered counts are a lower bound.">
        {kinds.length === 0 ? (
          <EmptyState mood="sleepy">No messages in the outbox.</EmptyState>
        ) : (
          <Table label="Outbox messages by kind">
            <THead>
              <tr>
                <TH>Kind</TH>
                <TH className="text-right">Queued</TH>
                <TH className="text-right">Sending</TH>
                <TH className="text-right">Delivered</TH>
                <TH className="text-right">Failed</TH>
                <TH className="text-right">Failure rate</TH>
              </tr>
            </THead>
            <TBody>
              {kinds.map((row) => (
                <TR key={row.kind}>
                  <TD className="tabular-nums text-sm">{row.kind}</TD>
                  <TD className="text-right tabular-nums">{formatCount(row.pending)}</TD>
                  <TD className="text-right tabular-nums">{formatCount(row.processing)}</TD>
                  <TD className="text-right tabular-nums">{formatCount(row.sent)}</TD>
                  <TD className="text-right tabular-nums">{row.failed > 0 ? <Chip size="sm" tone="danger">{formatCount(row.failed)}</Chip> : "0"}</TD>
                  <TD className="text-right tabular-nums text-ink-secondary">{formatShare(row.failed, row.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </AdminPanel>

    </div>
  );
}

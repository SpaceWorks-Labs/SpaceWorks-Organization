import Link from "next/link";
import type { OrgReportsMoney } from "@/lib/views/app__dashboard__orgSlug__reports__money__page";
import { formatHours, formatValue } from "@/lib/reports/chartScale";
import { formatCount, formatDayMonth, timeZoneOf } from "@/lib/format/datetime";
import { amountIn, formatAmount, formatTotals } from "@/lib/reports/money";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarList, StackedBar } from "./charts/BarList";
import { ChartFrame } from "./charts/ChartFrame";
import { ColumnChart } from "./charts/ColumnChart";
import { KpiTile } from "./charts/Figures";
import { ExportLink } from "./ReportShell";

type View = OrgReportsMoney;

export function FinancePending({ view }: { view: View }) {
  if (view.shell.tabs.financeReady) return null;
  return (
    <Callout tone="info" title="Payments are not recorded on this instance yet">
      Collected money, refunds and receipts appear here once payments are switched on. Memberships waiting for payment are already counted as outstanding.
    </Callout>
  );
}

export function MoneyKpis({ view }: { view: View }) {
  const s = view.summary;
  const rate = view.collection.find((row) => row.currency === view.primary) ?? view.collection[0];
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
      <KpiTile label="Collected, net of refunds" value={null} display={formatTotals(s.net, view.locale)} hint={`${s.payments} payments, ${s.refundCount} refunds`} />
      <KpiTile label="Average per paying member" value={null} display={formatTotals(s.perPayingMember, view.locale)} hint="Net collected ÷ members who paid" />
      <KpiTile label="Collection rate" value={rate?.rate ?? null} format="percent" hint={rate ? `Of ${formatAmount(rate.raised, rate.currency, view.locale)} raised in the period` : "Nothing raised in the period"} />
      <KpiTile label="Failed online payments" value={view.health.failedRate} format="percent" hint={`${view.health.failed} of ${view.health.onlineAttempts} attempts`} />
    </div>
  );
}

export function RevenueCharts({ view }: { view: View }) {
  if (!view.series.length) return null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {view.series.map(({ currency, points }) => (
        <ChartFrame key={currency} title={`Collected each month, ${currency}`} description="By payment date; refunds by the date they were made." table={{ columns: ["Month", "Collected", "Refunded", "Net"], rows: points.map((p) => [p.label, formatAmount(p.gross, currency, view.locale), formatAmount(p.refunds, currency, view.locale), formatAmount(p.net, currency, view.locale)]) }}>
          <ColumnChart ariaLabel={`Money collected and refunded each month in ${currency}`} format={`money:${currency}`} labels={points.map((p) => p.label)} series={[{ key: "gross", label: "Collected", slot: 1, values: points.map((p) => p.gross) }, { key: "refunds", label: "Refunded", slot: 2, values: points.map((p) => p.refunds) }]} />
        </ChartFrame>
      ))}
    </div>
  );
}

function MoneyList({ title, rows, view, empty }: { title: string; rows: View["byPlan"]; view: View; empty: string }) {
  return (
    <ChartFrame title={title} description={`Net of refunds. Bars compare ${view.primary}.`} table={{ columns: ["Group", "Net", "Payments"], rows: rows.map((row) => [row.label, formatTotals(row.totals, view.locale), row.count]) }}>
      <BarList label={title} empty={empty} items={rows.map((row) => ({ key: row.key, label: row.label, value: Math.max(0, amountIn(row.totals, view.primary)), display: formatTotals(row.totals, view.locale) }))} />
    </ChartFrame>
  );
}

export function RevenueBreakdowns({ view }: { view: View }) {
  const empty = "Nothing collected in this period.";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MoneyList title="By plan" rows={view.byPlan} view={view} empty={empty} />
      {view.byUnit.length ? <MoneyList title="By unit" rows={view.byUnit} view={view} empty={empty} /> : null}
      <MoneyList title="By fee" rows={view.byFee} view={view} empty={empty} />
      <MoneyList title="By provider" rows={view.byProvider} view={view} empty={empty} />
      <MoneyList title="By method" rows={view.byMethod} view={view} empty={empty} />
    </div>
  );
}

export function ForecastSection({ view }: { view: View }) {
  const fva = view.forecastVsActual;
  return (
    <section aria-labelledby="forecast-title" className="flex flex-col gap-3">
      <div>
        <h2 id="forecast-title" className="text-h4 text-ink">Renewals ahead</h2>
        <p className="text-label text-ink-muted">Active memberships ending soon at their renewal price. Expected applies the last 12 months&apos; renewal rate ({formatValue(view.trailingRenewalRate, "percent")}).</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
        {view.forecast.map((window) => (
          <KpiTile key={window.days} label={`Next ${window.days} days`} value={null} display={formatTotals(window.expected, view.locale)} hint={`${window.terms} memberships · ${formatTotals(window.atStake, view.locale)} at stake`} />
        ))}
      </div>
      {fva.length ? (
        <ChartFrame title={`Renewal value due and collected, ${view.primary}`} description="By the month the old membership ended." table={{ columns: ["Month", "Due", "Collected"], rows: fva.map((p) => [p.label, formatTotals(p.due, view.locale), formatTotals(p.actual, view.locale)]) }}>
          <ColumnChart ariaLabel="Renewal value due against renewal money collected" format={`money:${view.primary}`} labels={fva.map((p) => p.label)} series={[{ key: "due", label: "Due", slot: "muted", values: fva.map((p) => amountIn(p.due, view.primary)) }, { key: "actual", label: "Collected", slot: 1, values: fva.map((p) => amountIn(p.actual, view.primary)) }]} />
        </ChartFrame>
      ) : null}
    </section>
  );
}

const STATUS_LABEL = { PENDING: "Checkout started", AWAITING_CONFIRMATION: "Waiting for confirmation", UNPAID_TERM: "Not paid yet" } as const;

export function OutstandingSection({ view }: { view: View }) {
  const slug = view.shell.org.slug;
  return (
    <section aria-labelledby="outstanding-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="outstanding-title" className="text-h4 text-ink">Outstanding</h2>
          <p className="text-label text-ink-muted">Owed right now, by days past the due date. {formatCount(view.outstandingTotal)} items.</p>
        </div>
        {view.shell.canExportFinance ? <ExportLink shell={view.shell} report="outstanding" /> : null}
      </div>
      <div className="rounded-xl border border-line bg-panel p-4 sm:p-5">
        {/* Sized by the organisation's currency when it has any outstanding; otherwise by item count. */}
        <StackedBar ordinal label="Outstanding by age" segments={view.ageing.map((row) => ({ key: row.key, label: row.label, value: view.ageing.some((r) => amountIn(r.totals, view.primary) > 0) ? amountIn(row.totals, view.primary) : row.count, display: `${row.count} · ${formatTotals(row.totals, view.locale)}` }))} />
      </div>
      {view.outstanding.length ? (
        <Table label="Outstanding items">
          <THead><tr><TH>Member</TH><TH>Owed</TH><TH className="hidden sm:table-cell">Status</TH><TH>Age</TH></tr></THead>
          <TBody>
            {view.outstanding.map((item) => (
              <TR key={`${item.kind}-${item.id}`}>
                <TD><Link href={`/dashboard/${slug}/members/${item.memberId}`} className="font-semibold text-ink underline-offset-4 hover:underline">{item.name}</Link><span className="block text-caption text-ink-muted">#{item.memberNumber} · {item.plan}</span></TD>
                <TD className="whitespace-nowrap tabular-nums">{formatAmount(item.amountMinor, item.currency, view.locale)}</TD>
                <TD className="hidden text-ink-secondary sm:table-cell">{STATUS_LABEL[item.status]}</TD>
                <TD className="whitespace-nowrap">{item.daysPastDue < 0 ? <span className="text-ink-muted">Due in {-item.daysPastDue} days</span> : item.daysPastDue > 60 ? <Chip size="sm" tone="warning">{item.daysPastDue} days</Chip> : <span className="text-ink-secondary">{item.daysPastDue} days</span>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : <EmptyState mood="sleepy" title="Nothing outstanding">Every membership in this view is paid or free.</EmptyState>}
    </section>
  );
}

export function OfflineSection({ view }: { view: View }) {
  const o = view.offline;
  return (
    <section aria-labelledby="offline-title" className="flex flex-col gap-3">
      <h2 id="offline-title" className="text-h4 text-ink">Offline payments and checks</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <KpiTile label="Waiting for confirmation" value={o.awaiting.length} display={o.awaiting.length ? `${o.awaiting.length} · ${formatTotals(o.awaitingTotals, view.locale)}` : "0"} />
        <KpiTile label="Flagged for review" value={o.flagged.length} />
        <KpiTile label="Checked by a second person" value={o.confirmed ? o.checkedByAnother / o.confirmed : null} format="percent" hint={`${o.checkedByAnother} of ${o.confirmed} offline payments; ${o.selfConfirmed} self-confirmed`} />
        <KpiTile label="Time to confirm" value={null} display={formatHours(o.medianHoursToConfirm)} hint="Median, claim to confirmation" />
        <KpiTile label="Waived" value={view.health.waived} display={view.health.waived ? `${view.health.waived} · ${formatTotals(view.health.waivedTotals, view.locale)}` : "0"} hint={`${view.health.pendingRefunds} refunds still processing`} />
      </div>
      {o.awaiting.length || o.flagged.length ? (
        <Table label="Offline claims and flagged payments">
          <THead><tr><TH>Member</TH><TH>Amount</TH><TH>Why it is here</TH><TH className="hidden sm:table-cell">Since</TH></tr></THead>
          <TBody>
            {[...o.awaiting.map((p) => ({ ...p, why: "Waiting for confirmation" })), ...o.flagged.map((p) => ({ ...p, why: "Flagged for review" }))].map((p) => (
              <TR key={`${p.why}-${p.id}`}>
                <TD>{p.name}</TD>
                <TD className="whitespace-nowrap tabular-nums">{formatAmount(p.amountMinor, p.currency, view.locale)}</TD>
                <TD className="text-ink-secondary">{p.why}</TD>
                <TD className="hidden whitespace-nowrap text-ink-secondary sm:table-cell">{formatDayMonth(p.createdAt, timeZoneOf(view))}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : null}
    </section>
  );
}

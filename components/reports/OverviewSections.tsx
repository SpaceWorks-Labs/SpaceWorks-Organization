import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { OrgReportsOverview } from "@/lib/views/app__dashboard__orgSlug__reports__page";
import { formatHours, formatValue } from "@/lib/reports/chartScale";
import { formatTotals } from "@/lib/reports/money";
import { cn } from "@/lib/cn";
import { ChartFrame } from "./charts/ChartFrame";
import { ColumnChart } from "./charts/ColumnChart";
import { KpiTile } from "./charts/Figures";
import { StackedBar } from "./charts/BarList";
import { TrendChart } from "./charts/TrendChart";

type View = OrgReportsOverview;

/**
 * The period's membership change as one reading line: start, plus joined and came back, minus left and
 * revoked, any remainder, equals end. Each step is a link to the people in it.
 */
export function MembershipBridge({ view }: { view: View }) {
  const s = view.summary;
  const steps: Array<{ label: string; value: number; sign: "" | "+" | "−"; href?: string; strong?: boolean }> = [
    { label: "Active at the start", value: s.activeStart, sign: "" },
    { label: "Joined", value: s.joined, sign: "+", href: view.links.joined },
    { label: "Came back", value: s.reactivated, sign: "+", href: view.links.reactivated },
    { label: "Left", value: s.churned, sign: "−", href: view.links.churned },
    ...(s.revoked ? [{ label: "Revoked", value: s.revoked, sign: "−" as const, href: view.links.revoked }] : []),
    ...(s.otherChange ? [{ label: "Grace and timing", value: Math.abs(s.otherChange), sign: s.otherChange > 0 ? ("+" as const) : ("−" as const), href: view.links.grace }] : []),
    { label: "Active now", value: s.activeEnd, sign: "", href: view.links.active, strong: true },
  ];
  return (
    <section aria-labelledby="bridge-title" className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="bridge-title" className="text-title text-ink">Membership change</h2>
        <p className="text-label text-ink-muted">
          {s.netChange === 0 ? "No net change" : `${s.netChange > 0 ? "Up" : "Down"} ${Math.abs(s.netChange).toLocaleString("en-IN")}`}
          {s.growthRate !== null ? ` (${s.growthRate > 0 ? "+" : ""}${Math.round(s.growthRate * 100)}%)` : ""} over {view.shell.period.label.toLowerCase().startsWith("fy") ? view.shell.period.label : `the ${view.shell.period.label.toLowerCase()}`}
        </p>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:flex sm:flex-wrap sm:items-stretch sm:gap-0">
        {steps.map((step, index) => {
          const body = (
            <>
              <span className="block text-label text-ink-secondary">{step.label}</span>
              <span className={cn("mt-0.5 block font-semibold leading-tight text-ink", step.strong ? "text-[30px]" : "text-[24px]")}>
                {step.sign ? <span aria-hidden className="mr-0.5 text-ink-muted">{step.sign}</span> : null}
                <span className="sr-only">{step.sign === "+" ? "plus " : step.sign === "−" ? "minus " : ""}</span>
                {step.value.toLocaleString("en-IN")}
              </span>
            </>
          );
          return (
            <li key={step.label} className={cn("min-w-0 sm:flex sm:items-stretch", index > 0 && "sm:border-l sm:border-line sm:pl-4", index < steps.length - 1 && "sm:pr-4", step.strong && "col-span-2 sm:ml-auto")}>
              {step.href ? <Link href={step.href} className="block rounded-md underline-offset-4 hover:underline">{body}</Link> : <div>{body}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function OverviewKpis({ view }: { view: View }) {
  const s = view.summary;
  const vs = "vs previous period";
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
      <KpiTile label="Renewal rate" value={s.renewalRate} format="percent" href={view.links.renewed} hint={`${s.renewed} of ${s.renewed + s.dueLapsed} decided${s.open ? ` · ${s.open} still open` : ""}`} delta={s.renewalRate !== null && view.previous.renewalRate !== null ? { value: s.renewalRate - view.previous.renewalRate, format: "percent", vs } : undefined} />
      <KpiTile label="Churn" value={s.churnRate} format="percent" href={view.links.churned} hint={`${s.churned} left of ${s.activeStart} at the start`} delta={s.churnRate !== null && view.previous.churnRate !== null ? { value: s.churnRate - view.previous.churnRate, format: "percent", vs, goodWhenUp: false } : undefined} />
      <KpiTile label="Joined" value={s.joined} href={view.links.joined} delta={{ value: s.joined - view.previous.joined, vs }} trend={view.trend.map((point) => point.joined)} />
      <KpiTile label="Time to approve" value={null} display={formatHours(view.approvals.medianHoursToApprove)} hint="Median, application to approval" href={view.links.approval} />
    </div>
  );
}

export function OverviewTrends({ view }: { view: View }) {
  const labels = view.trend.map((point) => point.label);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <ChartFrame
        className="lg:col-span-3"
        title="Active members"
        description={`At the end of each ${view.bucketUnit}. Grace is not counted.`}
        drill={{ href: view.links.active }}
        table={{ columns: ["Period", "Active", "In grace"], rows: view.trend.map((point) => [point.label, point.active, point.grace]) }}
      >
        <TrendChart ariaLabel="Active members over the period" labels={labels} area series={[{ key: "active", label: "Active", slot: 1, values: view.trend.map((point) => point.active) }]} />
      </ChartFrame>
      <ChartFrame
        className="lg:col-span-2"
        title="Joined and lapsed"
        description="New members against memberships that ran out."
        table={{ columns: ["Period", "Joined", "Lapsed"], rows: view.trend.map((point) => [point.label, point.joined, point.lapsed]) }}
      >
        <ColumnChart ariaLabel="Members joined and lapsed in each period" labels={labels} series={[{ key: "joined", label: "Joined", slot: 1, values: view.trend.map((point) => point.joined) }, { key: "lapsed", label: "Lapsed", slot: 2, values: view.trend.map((point) => point.lapsed) }]} />
      </ChartFrame>
    </div>
  );
}

export function OverviewNow({ view }: { view: View }) {
  const n = view.standing;
  const attention = [
    { label: "Applications waiting for a decision", value: view.approvals.waiting, hint: view.approvals.waitingOver7Days ? `${view.approvals.waitingOver7Days} over 7 days` : undefined, href: view.links.approval },
    { label: "Waiting for payment", value: n.pendingPayment, href: view.links.payment },
    { label: "Ending in the next 30 days", value: view.expiringSoon, href: view.links.expiring },
    { label: "In grace now", value: n.grace, href: view.links.graceNow },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <ChartFrame className="lg:col-span-3" title="Renewal rate" description="Renewed ÷ (renewed + lapsed), by the month the membership ended. Months with fewer than 3 decided renewals are left out." table={{ columns: ["Period", "Due", "Renewed", "Rate"], rows: view.trend.map((point) => [point.label, point.due, point.renewed, formatValue(point.renewalRate, "percent")]) }}>
        <TrendChart ariaLabel="Renewal rate over the period" labels={view.trend.map((point) => point.label)} format="percent" yMax={1} series={[{ key: "rate", label: "Renewal rate", slot: 1, values: view.trend.map((point) => (point.decided >= 3 ? point.renewalRate : null)) }]} />
      </ChartFrame>
      <section aria-labelledby="now-title" className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4 sm:p-5 lg:col-span-2">
        <h2 id="now-title" className="text-title text-ink">Right now</h2>
        <StackedBar label="Members by standing" segments={[
          { key: "active", label: "Active", value: n.active, href: view.links.active },
          { key: "grace", label: "In grace", value: n.grace, href: view.links.graceNow },
          { key: "upcoming", label: "Starts soon", value: n.upcoming },
          { key: "pending", label: "Waiting to join", value: n.pendingApproval + n.pendingPayment, href: view.links.approval },
        ]} />
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {attention.map((item) => (
            <li key={item.label}>
              <Link href={item.href} className="flex min-h-11 items-center gap-3 py-2 text-label text-ink hover:text-accent-text">
                <span className="min-w-0 flex-1">
                  {item.label}
                  {item.hint ? <span className="block text-caption text-ink-muted">{item.hint}</span> : null}
                </span>
                <span className={cn("tabular-nums font-semibold", item.value === 0 && "text-ink-muted")}>{item.value.toLocaleString("en-IN")}</span>
                <ArrowRight aria-hidden className="size-4 text-ink-muted" />
              </Link>
            </li>
          ))}
          {view.finance ? (
            <li className="flex min-h-11 items-center justify-between gap-3 py-2 text-label">
              <span className="text-ink">Collected, net of refunds</span>
              <span className="font-semibold tabular-nums text-ink">{formatTotals(view.finance.net, view.locale)}</span>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

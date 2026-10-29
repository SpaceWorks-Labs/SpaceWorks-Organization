import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList, Search, Settings } from "lucide-react";
import { loadPaymentsDirectory } from "@/lib/views/app__dashboard__orgSlug__payments__page";
import { money } from "@/lib/membership/describe";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { methodLabel, PAYMENT_FILTER_LABELS, PAYMENT_FILTERS, PROVIDER_LABELS } from "@/lib/payments/labels";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { PaymentStatusChip } from "@/components/payments/PaymentStatusChip";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ status?: string; q?: string; page?: string }> };

export default async function PaymentsPage({ params, searchParams }: Props) {
  const view = await loadPaymentsDirectory({ params, searchParams });
  const { org, filter, counts, payments, page, pages } = view;
  const base = `/dashboard/${org.slug}/payments`;
  const query = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ status: filter === "all" ? "" : filter, q: view.q, ...patch })) if (value) next.set(key, String(value));
    const text = next.toString();
    return text ? `${base}?${text}` : base;
  };
  const day = (date: Date) => formatCalendarDate(localDate(date, org.timezone));

  return (
    <div className="flex flex-col gap-5">
      <OrgPageHeader
        organisation={org}
        title="Payments"
        description={view.gateway ? <>Online payments by {PROVIDER_LABELS[view.gateway.provider as "RAZORPAY" | "STRIPE"]}{view.gateway.testMode ? <Chip size="sm" tone="warning" className="ml-2 align-middle">Test mode</Chip> : null}</> : "Offline payments only. Connect Razorpay or Stripe to take payments online."}
        actions={view.canManage || view.canConfigure ? (
          <>
            {view.canManage ? (
              <Link href={`/dashboard/${org.slug}/payments/collect`} className={buttonClasses({ variant: "secondary" })}>
                <ClipboardList aria-hidden className="size-4" />
                Collection sheet
              </Link>
            ) : null}
            {view.canConfigure ? (
              <Link href={`/dashboard/${org.slug}/settings/payments`} className={buttonClasses({ variant: "secondary" })}>
                <Settings aria-hidden className="size-4" />
                Payment settings
              </Link>
            ) : null}
          </>
        ) : null}
      />

      <nav aria-label="Filter payments" className="flex flex-wrap gap-2">
        {PAYMENT_FILTERS.map((key) => (
          <Link
            key={key}
            href={query({ status: key === "all" ? "" : key, page: "" })}
            aria-current={filter === key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
              filter === key ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted",
              key !== "all" && counts[key] === 0 && filter !== key && "opacity-60",
            )}
          >
            {PAYMENT_FILTER_LABELS[key]} <span className="tabular-nums">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      <form role="search" action={base} className="flex max-w-[560px] gap-2">
        {filter !== "all" ? <input type="hidden" name="status" value={filter} /> : null}
        <label htmlFor="payment-search" className="sr-only">Search payments</label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="payment-search" name="q" defaultValue={view.q} placeholder="Name, member no., UTR or receipt no." className="min-h-11 w-full rounded-control border border-line-strong bg-panel pl-10 pr-4 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]" />
        </div>
        <button type="submit" className={buttonClasses({ variant: "secondary" })}>Search</button>
      </form>

      {counts.confirm > 0 && filter !== "confirm" && view.canManage ? (
        <Callout tone="info" action={<Link href={query({ status: "confirm", page: "" })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Review</Link>}>
          {counts.confirm} {counts.confirm === 1 ? "payment is" : "payments are"} waiting to be confirmed.
        </Callout>
      ) : null}
      {counts.requests > 0 && filter !== "requests" && view.canManage ? (
        <Callout tone="warning" action={<Link href={query({ status: "requests", page: "" })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Review</Link>}>
          {counts.requests} {counts.requests === 1 ? "member has" : "members have"} asked to cancel with a refund.
        </Callout>
      ) : null}
      {view.stuckRefunds > 0 && view.canManage ? (
        <Callout tone="warning" title="Refunds still pending">
          {view.stuckRefunds} {view.stuckRefunds === 1 ? "refund has" : "refunds have"} waited more than a day for the payment provider. We keep checking; if it doesn&apos;t clear, look it up in the provider&apos;s dashboard.
        </Callout>
      ) : null}
      {counts.flagged > 0 && filter !== "flagged" && view.canManage ? (
        <Callout tone="warning" action={<Link href={query({ status: "flagged", page: "" })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Review</Link>}>
          {counts.flagged} {counts.flagged === 1 ? "payment needs" : "payments need"} a look: paid late, twice, or for a different amount.
        </Callout>
      ) : null}

      {payments.length === 0 ? (
        <EmptyState {...(counts.all === 0 ? { patch: true } : { mood: "sleepy" as const })} title={counts.all === 0 ? "No payments yet" : "Nothing matches"}>
          {counts.all === 0 ? "Payments appear here when members pay online, or when you record one on a member's page." : "Try another filter or search."}
        </EmptyState>
      ) : (
        <Table label="Payments">
          <THead>
            <tr>
              <TH>Member</TH>
              <TH>For</TH>
              <TH className="text-right">Amount</TH>
              <TH>How</TH>
              <TH>Status</TH>
              <TH>Date</TH>
              <TH>Document</TH>
            </tr>
          </THead>
          <TBody>
            {payments.map((payment) => {
              const refunded = payment.refunds.filter((refund) => refund.status === "PROCESSED").reduce((sum, refund) => sum + refund.amountMinor, 0);
              return (
                <TR key={payment.id}>
                  <TD>
                    <Link href={`${base}/${payment.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">{payment.member.name}</Link>
                    <span className="block text-caption tabular-nums text-ink-muted">No. {payment.member.memberNumber}</span>
                  </TD>
                  <TD className="text-ink-secondary">{payment.term?.plan.name ?? "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {money(payment.amountMinor, payment.currency, org.locale)}
                    {refunded ? <span className="block text-caption text-ink-muted">{money(refunded, payment.currency, org.locale)} refunded</span> : null}
                  </TD>
                  <TD className="text-ink-secondary">{payment.provider === "OFFLINE" ? methodLabel(payment.method) ?? "Offline" : PROVIDER_LABELS[payment.provider]}{payment.utr ? <span className="block text-caption tabular-nums text-ink-muted">{payment.utr}</span> : null}</TD>
                  <TD><PaymentStatusChip status={payment.status} flagged={Boolean(payment.flaggedAt) || payment.documentHeld} /></TD>
                  <TD className="whitespace-nowrap text-ink-secondary">{day(payment.paidAt ?? payment.createdAt)}</TD>
                  <TD>{payment.documents[0] ? <a href={`/api/documents/${payment.documents[0].id}`} target="_blank" rel="noopener" className="tabular-nums text-ink underline-offset-4 hover:underline">{payment.documents[0].number}</a> : <span className="text-ink-muted">—</span>}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">Page {page} of {pages}</span>
          <span className="flex gap-2">
            {page > 1 ? <Link href={query({ page: page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Previous</Link> : null}
            {page < pages ? <Link href={query({ page: page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Next</Link> : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}

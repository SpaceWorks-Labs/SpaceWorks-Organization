import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, FileText } from "lucide-react";
import { loadPaymentView } from "@/lib/views/app__dashboard__orgSlug__payments__paymentId__page";
import { money } from "@/lib/membership/describe";
import { formatCalendarDate, lastValidDay, localDate } from "@/lib/membership/periods";
import { isCurrencyCode } from "@/lib/money/currencies";
import { methodLabel, PROVIDER_LABELS, REFUND_STATUS_LABELS } from "@/lib/payments/labels";
import { DOCUMENT_KIND_LABELS } from "@/lib/payments/numbering";
import { PaymentActions } from "@/components/payments/PaymentActions";
import { RefundRequestReview } from "@/components/payments/RefundRequestReview";
import { PaymentStatusChip } from "@/components/payments/PaymentStatusChip";
import { Callout, Card, CardHeader, DetailList } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };

const REQUEST_LABELS = { OPEN: "Open", APPROVED: "Approved", DECLINED: "Declined", WITHDRAWN: "Withdrawn by the member" } as const;

export default async function PaymentPage({ params }: { params: Promise<{ orgSlug: string; paymentId: string }> }) {
  const { org, payment, names, refundableMinor, canManage, isRecorder, termLive } = await loadPaymentView({ params });
  const openRequest = payment.refundRequests.find((request) => request.status === "OPEN");
  const decidedRequests = payment.refundRequests.filter((request) => request.status !== "OPEN");
  const amount = (minor: number) => money(minor, payment.currency, org.locale);
  const day = (date: Date) => formatCalendarDate(localDate(date, org.timezone));
  const taxed = payment.lines.some((line) => line.cgstMinor + line.sgstMinor + line.igstMinor + line.otherTaxMinor > 0);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/dashboard/${org.slug}/payments`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Payments
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-caption text-ink-muted">{payment.term?.plan.name ?? "Payment"} · <Link href={`/dashboard/${org.slug}/members/${payment.member.id}`} className="underline-offset-4 hover:underline">{payment.member.name}</Link> (no. {payment.member.memberNumber})</p>
          <h1 className="text-h1 tabular-nums text-ink">{amount(payment.amountMinor)}</h1>
        </div>
        <PaymentStatusChip status={payment.status} flagged={Boolean(payment.flaggedAt) || payment.documentHeld} size="md" />
      </header>

      {payment.flagReason && (payment.flaggedAt || payment.documentHeld) ? <Callout tone="warning" title="Needs review">{payment.flagReason}</Callout> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card as="section" className="rounded-xl">
            <CardHeader title="Charged" />
            <Table label="Payment lines">
              <THead>
                <tr>
                  <TH>Item</TH>
                  {taxed ? <TH className="text-right">Taxable</TH> : null}
                  {taxed ? <TH className="text-right">Tax</TH> : null}
                  <TH className="text-right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {payment.lines.map((line) => (
                  <TR key={line.id}>
                    <TD>{line.description}</TD>
                    {taxed ? <TD className="text-right tabular-nums">{amount(line.taxableMinor)}</TD> : null}
                    {taxed ? <TD className="text-right tabular-nums">{amount(line.cgstMinor + line.sgstMinor + line.igstMinor + line.otherTaxMinor)}</TD> : null}
                    <TD className="text-right tabular-nums">{amount(line.amountMinor)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {payment.capturedMinor !== null ? <p className="mt-3 text-caption text-ink-muted">Received {amount(payment.capturedMinor)}.</p> : null}
          </Card>

          <Card as="section" className="rounded-xl">
            <CardHeader title="Documents" />
            {payment.documents.length === 0 ? (
              <p className="text-body-ui text-ink-muted">{payment.status === "WAIVED" ? "Nothing was received, so no document is issued." : payment.documentHeld ? "Held until the amount is reviewed." : "Issued when the payment is confirmed."}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {payment.documents.map((document) => (
                  <li key={document.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <FileText aria-hidden className="size-4 text-ink-muted" />
                    <a href={`/api/documents/${document.id}`} target="_blank" rel="noopener" className="font-semibold tabular-nums text-ink underline-offset-4 hover:underline">{document.number}</a>
                    <span className="text-caption text-ink-muted">{DOCUMENT_KIND_LABELS[document.kind]} · {day(document.issuedAt)} · {amount(document.totalMinor)}{document.cancelledAt ? " · cancelled" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {decidedRequests.length ? (
            <Card as="section" className="rounded-xl">
              <CardHeader title="Refund requests" />
              <ul className="flex flex-col divide-y divide-line">
                {decidedRequests.map((request) => (
                  <li key={request.id} className="flex flex-col gap-0.5 py-2.5">
                    <span className="text-label font-semibold text-ink">{REQUEST_LABELS[request.status]} · asked {day(request.createdAt)} for {amount(request.suggestedMinor)}</span>
                    <span className="text-caption text-ink-muted">“{request.reason}”{request.decidedById && request.status !== "WITHDRAWN" ? ` · by ${names[request.decidedById] ?? "someone"}` : ""}{request.decisionNote ? ` · ${request.decisionNote}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {payment.refunds.length ? (
            <Card as="section" className="rounded-xl">
              <CardHeader title="Refunds" />
              <ul className="flex flex-col divide-y divide-line">
                {payment.refunds.map((refund) => (
                  <li key={refund.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span className="font-semibold tabular-nums text-ink">{amount(refund.amountMinor)}</span>
                    <span className="text-caption text-ink-muted">{REFUND_STATUS_LABELS[refund.status]} · {day(refund.processedAt ?? refund.createdAt)}{refund.createdById ? ` · by ${names[refund.createdById] ?? "someone"}` : ""}{refund.reason ? ` · “${refund.reason}”` : ""}{refund.failureReason ? ` · ${refund.failureReason}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {canManage && openRequest && isCurrencyCode(payment.currency) ? (
            <RefundRequestReview
              slug={org.slug}
              requestId={openRequest.id}
              currency={payment.currency}
              reason={openRequest.reason}
              askedOn={day(openRequest.createdAt)}
              suggestedMinor={openRequest.suggestedMinor}
              suggested={amount(openRequest.suggestedMinor)}
              refundableMinor={refundableMinor}
              refundable={amount(refundableMinor)}
              termLive={termLive}
              gateway={payment.provider !== "OFFLINE"}
            />
          ) : openRequest ? <Callout tone="info" title="Refund requested">The member asked on {day(openRequest.createdAt)} to cancel with a refund of {amount(openRequest.suggestedMinor)}.</Callout> : null}
          {canManage && isCurrencyCode(payment.currency) ? (
            <PaymentActions
              canEndMembership={termLive}
              slug={org.slug}
              paymentId={payment.id}
              status={payment.status}
              provider={payment.provider}
              currency={payment.currency}
              flagged={Boolean(payment.flaggedAt)}
              documentHeld={payment.documentHeld}
              memberClaim={payment.memberClaim}
              refundableMinor={refundableMinor}
              refundable={amount(refundableMinor)}
              blockedConfirm={org.offlineConfirmationRequired && isRecorder ? "You recorded this payment, so someone else on the team confirms it." : null}
            />
          ) : null}
          <Card as="section" className="rounded-xl">
            <CardHeader title="Details" />
            <DetailList
              items={[
                { label: "Paid through", value: payment.provider === "OFFLINE" ? `Offline${payment.method ? `, ${methodLabel(payment.method)}` : ""}` : `${PROVIDER_LABELS[payment.provider]}${payment.method ? `, ${methodLabel(payment.method)}` : ""}` },
                { label: "Reference", value: payment.utr ?? payment.gatewayPaymentId ?? payment.reference ?? "—" },
                { label: "Started", value: day(payment.createdAt) },
                { label: "Paid", value: payment.paidAt ? day(payment.paidAt) : "—" },
                ...(payment.term?.startsAt ? [{ label: "Membership", value: `${day(payment.term.startsAt)} – ${payment.term.endsAt ? formatCalendarDate(lastValidDay(payment.term.endsAt, org.timezone)) : "lifetime"}` }] : []),
                ...(payment.recordedById ? [{ label: "Recorded by", value: names[payment.recordedById] ?? "A member" }] : []),
                ...(payment.confirmedById ? [{ label: "Confirmed by", value: names[payment.confirmedById] ?? "Someone" }] : []),
                ...(payment.note ? [{ label: "Note", value: payment.note }] : []),
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

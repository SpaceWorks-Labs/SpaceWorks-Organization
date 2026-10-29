import Link from "next/link";
import QRCode from "react-qr-code";
import { FileText } from "lucide-react";
import type { buildPayView } from "@/lib/payments/payView";
import { money } from "@/lib/membership/describe";
import { TERM_STATUS_LABELS } from "@/lib/membership/lifecycle";
import { OnlinePayButton } from "@/components/payments/OnlinePayButton";
import { PaymentClaimForm } from "@/components/payments/PaymentClaimForm";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip, OrgLogo } from "@/components/ui/display";

type PayView = Awaited<ReturnType<typeof buildPayView>>;

/** What is due on one membership and every way to pay it; shared by the account page and pay links. */
export function PayPageBody({ view, payToken }: { view: PayView; payToken?: string }) {
  const { org, term, total, lines } = view;
  const amount = (minor: number) => money(minor, term.currency, org.locale);
  const taxed = total.amountMinor !== total.taxableMinor;
  // No gateway and the member belongs to a unit: the fee goes to the unit.
  const toUnit = Boolean(view.offline?.offlineOnly && view.offline.unitName);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <header className="flex items-center gap-4">
        <OrgLogo name={org.name} src={org.logoUrl} size="lg" />
        <div className="min-w-0">
          <p className="text-caption text-ink-muted">{org.name}</p>
          <h2 className="text-h1 text-ink">{term.kind === "RENEWAL" ? "Renew" : "Pay for"} {term.planName}</h2>
        </div>
      </header>

      {view.cancelled ? <Callout tone="info">Payment cancelled. Nothing was charged.</Callout> : null}

      {view.paid ? (
        <Callout tone="success" title={view.paid.status === "WAIVED" ? "Nothing to pay" : "Paid, thank you"} action={payToken ? undefined : <Link href="/account" className={buttonClasses({ variant: "secondary", size: "sm" })}>Your account</Link>}>
          {view.paid.status === "WAIVED" ? `${org.name} waived the fee for this membership.` : "Your membership is sorted."}
          {view.paid.document ? (
            <a href={`/api/documents/${view.paid.document.id}`} target="_blank" rel="noopener" className="mt-2 flex w-fit items-center gap-1.5 font-semibold underline underline-offset-4">
              <FileText aria-hidden className="size-4" />
              Receipt {view.paid.document.number}
            </a>
          ) : null}
        </Callout>
      ) : null}

      {view.checking ? (
        <Callout tone="info" title="We're checking your payment">
          {org.name} will confirm your transfer{view.checking.utr ? ` (reference ${view.checking.utr})` : ""} and email your receipt.
        </Callout>
      ) : null}
      {view.rejected && view.payable ? (
        <Callout tone="warning" title="Your last reference couldn't be matched">
          {view.rejected.note || `${org.name} couldn't find reference ${view.rejected.utr}.`} Check it and submit again below.
        </Callout>
      ) : null}

      {!view.paid ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="Amount due" action={<Chip tone="outline">{TERM_STATUS_LABELS[term.status]}</Chip>} />
          <dl className="flex flex-col gap-2 text-body-ui">
            {lines.map((line) => (
              <div key={line.kind} className="flex justify-between gap-4">
                <dt className="text-ink-secondary">{line.description}</dt>
                <dd className="tabular-nums text-ink">{amount(taxed ? line.taxableMinor : line.amountMinor)}</dd>
              </div>
            ))}
            {taxed ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-secondary">{view.taxName}</dt>
                <dd className="tabular-nums text-ink">{amount(total.amountMinor - total.taxableMinor)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between gap-4 border-t border-line pt-3">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="text-h3 tabular-nums text-ink">{amount(total.amountMinor)}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {view.payable && !view.checking ? (
        <>
          {view.online ? (
            <Card as="section" className="rounded-xl">
              <CardHeader title="Pay online" description={view.online.provider === "RAZORPAY" ? "UPI, cards and netbanking, through Razorpay." : "Cards and more, on Stripe's secure checkout page."} action={view.online.testMode ? <Chip tone="warning">Test mode</Chip> : undefined} />
              <OnlinePayButton termId={term.id} payToken={payToken} label={`Pay ${amount(total.amountMinor)}`} organisationName={org.name} description={term.planName} />
            </Card>
          ) : null}
          {view.offline && (view.offline.upiUri || view.offline.instructions) ? (
            <Card as="section" className="rounded-xl">
              <CardHeader title={view.online ? "Or pay directly" : toUnit ? "Pay your fee to your unit" : "How to pay"} description={toUnit ? `${view.offline.unitName}. If you pay by transfer, tell us the reference so the team can match it.` : "Then tell us the reference so the team can match your payment."} />
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                {view.offline.upiUri ? (
                  <figure className="flex shrink-0 flex-col items-center gap-2">
                    <div className="rounded-xl border border-line bg-white p-3">
                      <QRCode value={view.offline.upiUri} size={168} title={`UPI payment of ${amount(total.amountMinor)}`} />
                    </div>
                    <figcaption className="text-caption tabular-nums text-ink-muted">{view.offline.upiVpa}</figcaption>
                  </figure>
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  {view.offline.upiUri ? <p className="text-body-ui text-ink-secondary">Scan with any UPI app. The amount is filled in for you.</p> : null}
                  {view.offline.instructions ? <p className="whitespace-pre-wrap text-body-ui text-ink-secondary">{view.offline.instructions}</p> : null}
                  <PaymentClaimForm termId={term.id} payToken={payToken} />
                </div>
              </div>
            </Card>
          ) : null}
          {!view.online && !(view.offline && (view.offline.upiUri || view.offline.instructions)) ? (
            toUnit ? (
              <Callout tone="info" title="Pay your fee to your unit">Pay {view.offline?.unitName} directly. They&apos;ll record it and your receipt arrives by email.</Callout>
            ) : (
              <Callout tone="info" title="Pay the organisation directly">{org.name} hasn&apos;t set up online payments. Contact them to pay; they&apos;ll record it and your receipt arrives by email.</Callout>
            )
          ) : null}
        </>
      ) : null}

      {!view.payable && !view.paid && !view.checking ? (
        <Callout tone="info">{org.status !== "ACTIVE" ? `${org.name} isn't taking payments right now.` : "Nothing is due on this membership."}</Callout>
      ) : null}
    </div>
  );
}

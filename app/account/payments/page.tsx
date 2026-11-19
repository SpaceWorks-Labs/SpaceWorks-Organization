import Link from "next/link";
import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { loadAccountPaymentsView } from "@/lib/views/app__account__payments__page";
import { money } from "@/lib/membership/describe";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { methodLabel, PROVIDER_LABELS } from "@/lib/payments/labels";
import { DOCUMENT_KIND_LABELS } from "@/lib/payments/numbering";
import { PaymentStatusChip } from "@/components/payments/PaymentStatusChip";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState, SectionHeading } from "@/components/ui/display";

export const metadata: Metadata = { title: "Payments and receipts", robots: { index: false, follow: false } };

export default async function AccountPaymentsPage() {
  const { emailVerified, payments } = await loadAccountPaymentsView();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Payments and receipts" description="What you've paid each organisation, with every receipt and credit note." />
      {!emailVerified ? (
        <Callout tone="warning" title="Verify your email to see your payments" action={<Link href="/account/profile" className={buttonClasses({ variant: "secondary", size: "sm" })}>Verify your email</Link>}>
          Organisations know you by your email address, so your payments show once it&apos;s verified.
        </Callout>
      ) : payments.length === 0 ? (
        <EmptyState mood="waiting" title="No payments yet">When you pay for a membership, the payment and its receipt show up here.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-panel px-5">
          {payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
              <span className="min-w-0 flex-[1_1_240px]">
                <span className="block text-label font-semibold text-ink">{payment.organisation.name}</span>
                <span className="text-caption text-ink-muted">
                  {[payment.planName, payment.provider === "OFFLINE" ? methodLabel(payment.method) : PROVIDER_LABELS[payment.provider], formatCalendarDate(localDate(payment.when, payment.organisation.timezone))].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="text-right tabular-nums">
                <span className="block text-label text-ink">{money(payment.amountMinor, payment.currency, payment.organisation.locale)}</span>
                {payment.refundedMinor ? <span className="text-caption text-ink-muted">{money(payment.refundedMinor, payment.currency, payment.organisation.locale)} refunded</span> : null}
              </span>
              <PaymentStatusChip status={payment.status} />
              <span className="flex flex-wrap gap-x-3">
                {payment.documents.map((document) => (
                  <a key={document.id} href={`/api/documents/${document.id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 text-caption font-semibold tabular-nums text-ink underline-offset-4 hover:underline">
                    <FileText aria-hidden className="size-3.5" />
                    <span className="sr-only">{DOCUMENT_KIND_LABELS[document.kind]} </span>
                    {document.number}
                  </a>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

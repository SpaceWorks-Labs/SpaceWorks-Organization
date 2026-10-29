import { FileText } from "lucide-react";
import { WalletCard as CardViewer } from "@/components/cards/WalletCard";
import { PaymentStatusChip } from "@/components/payments/PaymentStatusChip";
import { Card, CardHeader } from "@/components/ui/display";
import { money } from "@/lib/membership/describe";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { methodLabel, PROVIDER_LABELS, type PaymentStatusName } from "@/lib/payments/labels";
import { DOCUMENT_KIND_LABELS } from "@/lib/payments/numbering";
import type { WalletCard as MemberCardData } from "@/lib/cards/wallet";

/**
 * The card and receipts parts of the member portal: the member's card inside each wallet entry, and their
 * payments with downloadable documents on the membership page.
 */

/** The member's card for one plan, folded away until opened so the wallet stays scannable. */
export function CardSlot({ card }: { card: MemberCardData | null }) {
  if (!card) return null;
  return (
    <details className="group rounded-xl border border-line bg-subtle">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-label font-semibold text-ink">
        <span>Your card <span className="font-normal tabular-nums text-ink-muted">· {card.cardNumber}</span></span>
        <span aria-hidden className="text-ink-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-4 pb-4">
        <CardViewer design={card.design} holder={card.holder} branding={card.branding} label={`${card.organisation.name} membership card`} downloads={card.downloads} verifyPath={card.verifyPath} />
      </div>
    </details>
  );
}

type ReceiptRow = {
  id: string;
  status: PaymentStatusName;
  provider: "RAZORPAY" | "STRIPE" | "OFFLINE";
  method: string | null;
  currency: string;
  amountMinor: number;
  when: Date;
  planName: string | null;
  documents: Array<{ id: string; number: string; kind: keyof typeof DOCUMENT_KIND_LABELS }>;
};

/** Payments and receipts with this organisation. Each document opens as a PDF. */
export function ReceiptsSlot({ receipts, timeZone, locale }: { receipts: ReceiptRow[]; timeZone: string; locale: string | null }) {
  if (receipts.length === 0) return null;
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Payments and receipts" />
      <ul className="flex flex-col divide-y divide-line">
        {receipts.map((receipt) => (
          <li key={receipt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-label tabular-nums text-ink">{money(receipt.amountMinor, receipt.currency, locale)}</span>
              <span className="text-caption text-ink-muted">
                {[receipt.planName, receipt.provider === "OFFLINE" ? methodLabel(receipt.method) : PROVIDER_LABELS[receipt.provider], formatCalendarDate(localDate(receipt.when, timeZone))].filter(Boolean).join(" · ")}
              </span>
            </span>
            <PaymentStatusChip status={receipt.status} />
            {receipt.documents.map((document) => (
              <a key={document.id} href={`/api/documents/${document.id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 text-caption font-semibold tabular-nums text-ink underline-offset-4 hover:underline">
                <FileText aria-hidden className="size-3.5" />
                <span className="sr-only">{DOCUMENT_KIND_LABELS[document.kind]} </span>
                {document.number}
              </a>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The pay page for an unpaid term (PENDING_PAYMENT). The wallet and detail page link here. */
export function payHref(termId: string) {
  return `/account/pay/${termId}`;
}

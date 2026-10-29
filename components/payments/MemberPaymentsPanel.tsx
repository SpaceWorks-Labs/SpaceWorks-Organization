"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PaymentStatusChip } from "@/components/payments/PaymentStatusChip";
import { RecordPaymentDialog, type DueItem } from "@/components/payments/RecordPaymentDialog";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import type { PaymentStatusName } from "@/lib/payments/labels";

type MemberPaymentRow = {
  id: string;
  status: PaymentStatusName;
  flagged: boolean;
  amount: string;
  label: string;
  when: string;
  documents: Array<{ id: string; number: string; kind: string }>;
};

/** What a member owes and has paid, with record, waive and receipt links for the finance team. */
export function MemberPaymentsPanel({ slug, due, payments, canManage, makerChecker }: { slug: string; due: Array<DueItem & { awaiting: boolean }>; payments: MemberPaymentRow[]; canManage: boolean; makerChecker: boolean }) {
  const [dialog, setDialog] = useState<{ item: DueItem; mode: "record" | "waive" } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Payments" action={<Link href={`/dashboard/${slug}/payments`} className="text-caption font-semibold text-ink underline-offset-4 hover:underline">All payments</Link>} />
      <div className="flex flex-col gap-4">
        {message ? <Callout tone="success" role="status">{message}</Callout> : null}
        {due.map((item) => (
          <div key={item.termId} className="flex flex-wrap items-center gap-3 rounded-xl border border-line-strong bg-subtle p-4">
            <span className="min-w-0 flex-1">
              <span className="block text-label font-semibold text-ink">{item.amount} due</span>
              <span className="text-caption text-ink-muted">{item.planName}{item.awaiting ? " · a payment is waiting to be confirmed" : ""}</span>
            </span>
            {canManage && !item.awaiting ? (
              <span className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => setDialog({ item, mode: "record" })}>Record payment</Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog({ item, mode: "waive" })}>Waive</Button>
              </span>
            ) : null}
          </div>
        ))}
        {payments.length === 0 ? (
          <p className="text-body-ui text-ink-muted">No payments yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                <Link href={`/dashboard/${slug}/payments/${payment.id}`} className="min-w-0 flex-1 rounded-md underline-offset-4 hover:underline">
                  <span className="block text-label tabular-nums text-ink">{payment.amount}</span>
                  <span className="text-caption text-ink-muted">{payment.label} · {payment.when}</span>
                </Link>
                <PaymentStatusChip status={payment.status} flagged={payment.flagged} />
                {payment.documents.map((document) => (
                  <a key={document.id} href={`/api/documents/${document.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-caption font-semibold tabular-nums text-ink underline-offset-4 hover:underline">
                    <FileText aria-hidden className="size-3.5" />
                    {document.number}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      {dialog ? (
        <RecordPaymentDialog
          slug={slug}
          due={dialog.item}
          mode={dialog.mode}
          makerChecker={makerChecker}
          onClose={(text) => {
            setDialog(null);
            if (text) setMessage(text);
          }}
        />
      ) : null}
    </Card>
  );
}

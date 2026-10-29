"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { voidLedgerEntry } from "@/app/actions/accounts";
import { LedgerEntryDialog } from "@/components/accounts/LedgerEntryDialog";
import { LEDGER_METHOD_LABELS, type LedgerMethod } from "@/lib/accounts/categories";
import { money } from "@/lib/membership/describe";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip, EmptyState } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";

type LedgerRow = { id: string; direction: "RECEIPT" | "PAYMENT"; date: string; category: string; party: string; description: string; currency: string; amountMinor: number; method: string; reference: string | null; voided: { reason: string } | null };

/** The year's ledger entries, with record and void for the finance team. */
export function LedgerPanel({ slug, rows, currencies, today, locale, canManage }: { slug: string; rows: LedgerRow[]; currencies: string[]; today: string; locale: string | null; canManage: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState<"RECEIPT" | "PAYMENT" | null>(null);
  const [voiding, setVoiding] = useState<LedgerRow | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader
        title="Other receipts and payments"
        description="Everything that isn't a membership payment. Membership fees and refunds are added from Payments automatically."
        action={canManage ? (
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAdding("RECEIPT")}><Plus aria-hidden className="size-4" />Money received</Button>
            <Button size="sm" variant="primary" onClick={() => setAdding("PAYMENT")}><Minus aria-hidden className="size-4" />Payment made</Button>
          </span>
        ) : undefined}
      />
      {message ? <Callout tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"} className="mb-3">{message.text}</Callout> : null}
      {rows.length === 0 ? (
        <EmptyState mood="sleepy" title="Nothing recorded this year">Record donations, grants, rent, equipment and other money in and out to complete the accounts.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3", row.voided && "opacity-60")}>
              <span className="min-w-0 flex-[1_1_220px]">
                <span className={cn("block text-label font-semibold text-ink", row.voided && "line-through")}>{row.category}{row.party ? ` · ${row.party}` : ""}</span>
                <span className="text-caption text-ink-muted">
                  {[row.date, LEDGER_METHOD_LABELS[row.method as LedgerMethod] ?? row.method, row.reference, row.description].filter(Boolean).join(" · ")}
                  {row.voided ? ` · voided: ${row.voided.reason}` : ""}
                </span>
              </span>
              <span className={cn("text-right text-label tabular-nums", row.direction === "RECEIPT" ? "text-ink" : "text-ink-secondary", row.voided && "line-through")}>
                {row.direction === "RECEIPT" ? "+" : "−"}{money(row.amountMinor, row.currency, locale)}
              </span>
              <Chip size="sm" tone={row.voided ? "outline" : row.direction === "RECEIPT" ? "success" : "outline"}>{row.voided ? "Voided" : row.direction === "RECEIPT" ? "Received" : "Paid"}</Chip>
              {canManage && !row.voided ? <Button size="sm" variant="quiet" onClick={() => setVoiding(row)}>Void</Button> : null}
            </li>
          ))}
        </ul>
      )}
      {adding ? <LedgerEntryDialog slug={slug} direction={adding} currencies={currencies} today={today} onClose={(saved) => { setAdding(null); if (saved) setMessage({ ok: true, text: "Recorded." }); }} /> : null}
      <ConfirmDialog
        open={Boolean(voiding)}
        title="Void this entry?"
        message="It stays in the list, struck through, and drops out of the accounts. Record it again if the details were wrong."
        confirmLabel="Void entry"
        loading={pending}
        onCancel={() => { setVoiding(null); setReason(""); }}
        onConfirm={() => startTransition(async () => {
          const result = await voidLedgerEntry({ organisationSlug: slug, entryId: voiding!.id, reason });
          setMessage(result.ok ? { ok: true, text: "Entry voided." } : { ok: false, text: result.error });
          setVoiding(null);
          setReason("");
          router.refresh();
        })}
      >
        <Field label="Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={300} /></Field>
      </ConfirmDialog>
    </Card>
  );
}

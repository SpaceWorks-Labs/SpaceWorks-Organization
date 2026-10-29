"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOpenPayment, clearFlag, confirmPayment, rejectPayment, releaseDocument } from "@/app/actions/payments";
import { refundPayment } from "@/app/actions/refunds";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CheckboxField } from "@/components/ui/choice";
import { parseAmount, toInputValue, type CurrencyCode } from "@/lib/money/currencies";

type Props = {
  slug: string;
  paymentId: string;
  status: string;
  provider: string;
  currency: CurrencyCode;
  flagged: boolean;
  documentHeld: boolean;
  refundableMinor: number;
  refundable: string;
  blockedConfirm: string | null;
  /** The member said they'd paid, so turning it down emails them. */
  memberClaim: boolean;
  /** The membership this paid for is still running, so a refund may end it. */
  canEndMembership: boolean;
};

type Pending = "reject" | "cancel" | "refund" | "release" | null;

/** What a finance manager can do with one payment, given its state. */
export function PaymentActions(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(toInputValue(props.refundableMinor, props.currency));
  const [endMembership, setEndMembership] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const ref = { organisationSlug: props.slug, paymentId: props.paymentId };
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await work();
      setMessage(result.ok ? { ok: true, text: success } : { ok: false, text: result.error ?? "Couldn't save." });
      setOpen(null);
      setReason("");
      router.refresh();
    });

  const awaiting = props.status === "AWAITING_CONFIRMATION";
  const openAttempt = props.status === "PENDING" || awaiting;
  const paid = props.status === "PAID";
  const refundMinor = parseAmount(amount, props.currency);
  if (!awaiting && !openAttempt && !(paid && (props.refundableMinor > 0 || props.flagged || props.documentHeld))) return null;

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Actions" />
      <div className="flex flex-col gap-3">
        {message ? <Callout tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"}>{message.text}</Callout> : null}
        {props.documentHeld ? (
          <Callout tone="warning" title="Receipt held">The amount received differs from what was due. Issue the receipt on what was received, or refund it.</Callout>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {awaiting ? (
            <>
              <Button variant="primary" loading={busy} disabled={Boolean(props.blockedConfirm)} onClick={() => run(() => confirmPayment(ref), "Confirmed and receipted.")}>Confirm payment</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setOpen("reject")}>Not received</Button>
            </>
          ) : null}
          {props.status === "PENDING" ? <Button variant="secondary" disabled={busy} onClick={() => setOpen("cancel")}>Cancel attempt</Button> : null}
          {props.documentHeld ? <Button variant="primary" disabled={busy} onClick={() => setOpen("release")}>Issue receipt on amount received</Button> : null}
          {paid && props.flagged && !props.documentHeld ? <Button variant="secondary" loading={busy} onClick={() => run(() => clearFlag(ref), "Marked as reviewed.")}>Mark as reviewed</Button> : null}
          {paid && props.refundableMinor > 0 ? <Button variant="dangerOutline" disabled={busy} onClick={() => setOpen("refund")}>Refund</Button> : null}
        </div>
        {props.blockedConfirm && awaiting ? <p className="text-caption text-ink-muted">{props.blockedConfirm}</p> : null}
      </div>

      <ConfirmDialog open={open === "reject"} title="Mark as not received?" message={props.memberClaim ? "The member is emailed and can submit a corrected reference." : "The payment is closed. The member isn't emailed."} confirmLabel="Mark not received" loading={busy} onCancel={() => setOpen(null)} onConfirm={() => run(() => rejectPayment({ ...ref, reason }), "Marked as not received.")}>
        <Field label="Reason" helperText={props.memberClaim ? "Shown to the member." : "Kept with the payment."}><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={300} /></Field>
      </ConfirmDialog>
      <ConfirmDialog open={open === "cancel"} title="Cancel this payment attempt?" message="Only an unfinished attempt is cancelled. A capture that still arrives later is receipted and flagged." confirmLabel="Cancel attempt" loading={busy} onCancel={() => setOpen(null)} onConfirm={() => run(() => cancelOpenPayment(ref), "Attempt cancelled.")} />
      <ConfirmDialog open={open === "release"} title="Issue the receipt on the amount received?" message="The receipt's lines are shared out across the amount actually received." confirmLabel="Issue receipt" destructive={false} loading={busy} onCancel={() => setOpen(null)} onConfirm={() => run(() => releaseDocument(ref), "Receipt issued.")} />
      <ConfirmDialog
        open={open === "refund"}
        title="Refund this payment?"
        message={props.provider === "OFFLINE" ? "Record money you've already handed back. A credit note is issued straight away." : "The refund is sent to the payment provider. The credit note is issued once it goes through."}
        confirmLabel="Refund"
        loading={busy}
        onCancel={() => setOpen(null)}
        onConfirm={() => refundMinor && run(() => refundPayment({ ...ref, amountMinor: refundMinor, reason, endMembership: props.canEndMembership && endMembership }), props.provider === "OFFLINE" ? "Refund recorded and credit note issued." : "Refund sent to the provider.")}
      >
        <Field label={`Amount (${props.currency})`} helperText={`Up to ${props.refundable}.`} error={amount && !refundMinor ? "Enter an amount" : refundMinor && refundMinor > props.refundableMinor ? "That's more than is left to refund" : undefined}>
          <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={300} /></Field>
        {props.canEndMembership ? <CheckboxField checked={endMembership} onCheckedChange={(checked) => setEndMembership(checked === true)} label="Also end the membership" description="The membership this paid for is cancelled now and its card stops verifying." /> : null}
      </ConfirmDialog>
    </Card>
  );
}

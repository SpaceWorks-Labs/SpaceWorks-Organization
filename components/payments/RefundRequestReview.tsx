"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveRefund, declineRefund } from "@/app/actions/refunds";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { CheckboxField } from "@/components/ui/choice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { parseAmount, toInputValue, type CurrencyCode } from "@/lib/money/currencies";

type Props = {
  slug: string;
  requestId: string;
  currency: CurrencyCode;
  reason: string;
  askedOn: string;
  suggestedMinor: number;
  suggested: string;
  refundableMinor: number;
  refundable: string;
  termLive: boolean;
  gateway: boolean;
};

/** A member's open request to cancel with a refund: approve (refund and end the membership) or decline. */
export function RefundRequestReview(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<"approve" | "decline" | null>(null);
  const [amount, setAmount] = useState(toInputValue(Math.min(props.suggestedMinor, props.refundableMinor), props.currency));
  const [endMembership, setEndMembership] = useState(props.termLive);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const amountMinor = parseAmount(amount, props.currency);
  const tooMuch = amountMinor !== null && amountMinor > props.refundableMinor;

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) => startTransition(async () => {
    const result = await work();
    setMessage(result.ok ? { ok: true, text: success } : { ok: false, text: result.error ?? "Couldn't save." });
    setOpen(null);
    router.refresh();
  });

  return (
    <Card as="section" className="rounded-xl border-warning-fg">
      <CardHeader title="Refund requested" description={`The member asked on ${props.askedOn} to cancel and get ${props.suggested} back under your refund policy.`} />
      {message ? <Callout tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"} className="mb-3">{message.text}</Callout> : null}
      <blockquote className="mb-4 whitespace-pre-line border-l-2 border-line-strong pl-3 text-body-ui text-ink-secondary">{props.reason}</blockquote>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setOpen("approve")}>Approve refund</Button>
        <Button variant="secondary" onClick={() => setOpen("decline")}>Decline</Button>
      </div>

      <ConfirmDialog
        open={open === "approve"}
        title="Approve this refund?"
        message={props.gateway ? "The refund is sent to the payment provider. The credit note is issued once it goes through." : "Record money you've handed back. A credit note is issued straight away."}
        confirmLabel="Approve refund"
        destructive={false}
        loading={busy}
        onCancel={() => setOpen(null)}
        onConfirm={() => amountMinor && !tooMuch && run(() => approveRefund({ organisationSlug: props.slug, requestId: props.requestId, amountMinor, endMembership: props.termLive && endMembership, note }), props.gateway ? "Approved. Refund sent to the provider." : "Approved. Refund recorded and credit note issued.")}
      >
        <Field label={`Amount (${props.currency})`} helperText={`The policy offers ${props.suggested}; up to ${props.refundable} is left.`} error={amount && !amountMinor ? "Enter an amount" : tooMuch ? "That's more than is left to refund" : undefined}>
          <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        {props.termLive ? <CheckboxField checked={endMembership} onCheckedChange={(checked) => setEndMembership(checked === true)} label="End the membership" description="What the member asked for. Untick to refund and let the membership run on." /> : null}
        <Field label="Note to the member" optional><Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={500} /></Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={open === "decline"}
        title="Decline this request?"
        message="No money moves and the membership carries on. The member gets your note by email."
        confirmLabel="Decline request"
        loading={busy}
        onCancel={() => setOpen(null)}
        onConfirm={() => run(() => declineRefund({ organisationSlug: props.slug, requestId: props.requestId, note }), "Request declined. The member has been told.")}
      >
        <Field label="Why" helperText="Sent to the member."><Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} /></Field>
      </ConfirmDialog>
    </Card>
  );
}

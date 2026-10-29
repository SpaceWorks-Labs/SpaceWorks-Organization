"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestMembershipRefund, withdrawMembershipRefund } from "@/app/actions/portal";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";

type RefundPanelProps = {
  organisationSlug: string;
  organisationName: string;
  planName: string;
  termId: string;
  policyText: string;
  /** The amount on offer, formatted, when the member may ask now. */
  offer: string | null;
  deadline: string | null;
  windowClosed: boolean;
  open: { id: string; amount: string; date: string } | null;
  last: { status: "APPROVED" | "DECLINED" | "WITHDRAWN"; note: string | null; amount: string | null } | null;
};

/** Cancel a paid membership with a refund under the organisation's policy, or follow a request already made. */
export function RefundRequestPanel(props: RefundPanelProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [asking, setAsking] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, startTransition] = useTransition();
  const { organisationName: org, planName } = props;

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done: string, close: () => void) => startTransition(async () => {
    const result = await work();
    showToast(result.ok ? done : result.error ?? "Couldn't do that. Try again.", result.ok ? "success" : "error");
    if (result.ok) {
      close();
      setReason("");
      router.refresh();
    }
  });

  if (props.open) {
    return (
      <Callout tone="info" title="Refund requested">
        <span className="flex flex-col gap-3">
          <span>You asked on {props.open.date} to cancel {planName} and get {props.open.amount} back. {org} will review it; you stay a member until they decide.</span>
          <span><Button size="sm" variant="secondary" onClick={() => setWithdrawing(true)}>Withdraw request</Button></span>
        </span>
        <ConfirmDialog
          open={withdrawing}
          title="Withdraw your refund request?"
          message={`Nothing changes: you stay on ${planName}. You can ask again while the refund window is open.`}
          confirmLabel="Withdraw request"
          cancelLabel="Keep it"
          destructive={false}
          loading={busy}
          onCancel={() => setWithdrawing(false)}
          onConfirm={() => run(() => withdrawMembershipRefund({ organisationSlug: props.organisationSlug, requestId: props.open!.id }), "Refund request withdrawn.", () => setWithdrawing(false))}
        />
      </Callout>
    );
  }

  const outcome = props.last?.status === "APPROVED"
    ? `${org} approved a refund${props.last.amount ? ` of ${props.last.amount}` : ""}.`
    : props.last?.status === "DECLINED"
      ? `${org} declined your last refund request${props.last.note ? `: ${props.last.note}` : "."}`
      : null;
  const policyLine = props.offer
    ? `You can cancel and ask for ${props.offer} back until ${props.deadline}.`
    : props.windowClosed ? `The window to ask for a refund closed on ${props.deadline}.` : null;
  if (!props.offer && !outcome && !policyLine && !props.policyText) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle px-4 py-3">
      <p className="text-label font-semibold text-ink">Refunds</p>
      {props.policyText ? <p className="whitespace-pre-line text-body-ui text-ink-secondary">{props.policyText}</p> : null}
      {outcome ? <p className="text-body-ui text-ink-secondary">{outcome}</p> : null}
      {policyLine ? <p className="text-body-ui text-ink-secondary">{policyLine}</p> : null}
      {props.offer ? <div><Button size="sm" variant="dangerOutline" onClick={() => setAsking(true)}>Cancel and request a refund</Button></div> : null}
      <ConfirmDialog
        open={asking}
        title={`Cancel ${planName} with a refund?`}
        message={`${org} reviews every request. If they approve it, ${props.offer} goes back to you and your membership ends. Until then nothing changes.`}
        confirmLabel="Send request"
        cancelLabel="Keep my membership"
        loading={busy}
        onCancel={() => setAsking(false)}
        onConfirm={() => run(() => requestMembershipRefund({ organisationSlug: props.organisationSlug, termId: props.termId, reason }), `Sent to ${org}.`, () => setAsking(false))}
      >
        <Field label="Why are you cancelling?" helperText={`Only ${org}'s team sees this.`}>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

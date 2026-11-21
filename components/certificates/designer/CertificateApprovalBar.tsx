"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Clock, FilePen } from "lucide-react";
import { approveCertificateDesign, discardCertificateDraft } from "@/app/actions/certificate-designs";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout, Chip } from "@/components/ui/display";

export type CertificateApproval = { pending: boolean; live: boolean; hasDraft: boolean; draftUpdatedAt: string | null; approvedAt: string | null; canApprove: boolean; timeZone?: string };

const when = (iso: string | null, timeZone?: string) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", ...(timeZone ? { timeZone } : {}) }) : null);

/**
 * Where the design stands. Changes are a draft until the owner approves them; only approved designs can be issued,
 * and issued certificates are always drawn from the approved version. Discarding a design that was never approved
 * deletes it, so that asks first. `flush` saves any edit still waiting.
 */
export function CertificateApprovalBar({ state, pending, target, designName, flush, onDeleted }: {
  state: CertificateApproval;
  pending: boolean;
  target: { organisationSlug: string; designId: string };
  designName: string;
  flush: () => Promise<boolean>;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const run = (action: typeof approveCertificateDesign, after: () => void) => startTransition(async () => {
    setError(null);
    if (!(await flush())) return setError("Save the design before approving it: fix the problem above, then try again.");
    const result = await action(target);
    if (result.ok) after();
    else setError(result.error);
  });
  const discard = () => run(discardCertificateDraft, () => {
    setConfirming(false);
    if (state.live) router.refresh();
    else onDeleted();
  });
  const approved = when(state.approvedAt, state.timeZone);
  return (
    <div className="flex flex-col gap-2 border-b border-line bg-canvas px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {pending ? (
          <Chip tone="warning" icon={state.live ? <Clock /> : <FilePen />}>{state.live ? "Changes waiting for approval" : "Draft, not approved yet"}</Chip>
        ) : (
          <Chip tone="success" icon={<BadgeCheck />}>Live: certificates are issued from this</Chip>
        )}
        <p className="min-w-0 flex-[1_1_16rem] text-caption text-ink-muted">
          {pending
            ? state.live
              ? state.canApprove ? "Certificates keep the approved version until you approve these changes." : "Certificates keep the approved version until the owner approves these changes."
              : state.canApprove ? "Approve it to start issuing certificates from it." : "The owner approves it before anyone can issue certificates from it."
            : approved ? `Approved ${approved}. Changes you make wait for the owner's approval.` : "Changes you make wait for the owner's approval."}
        </p>
        {pending ? (
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => (state.live ? discard() : setConfirming(true))}>{state.live ? "Discard changes" : "Discard draft…"}</Button>
            {state.canApprove ? <Button size="sm" variant="primary" loading={busy && !confirming} onClick={() => run(approveCertificateDesign, () => router.refresh())}>Approve and publish</Button> : null}
          </span>
        ) : null}
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <ConfirmDialog
        open={confirming}
        title={`Discard ${designName || "this design"}?`}
        message="It has never been approved, so discarding the draft deletes the design. This can't be undone."
        confirmLabel="Delete design"
        loading={busy}
        onConfirm={discard}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

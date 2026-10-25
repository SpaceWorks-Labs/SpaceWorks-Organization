"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Clock } from "lucide-react";
import { approveCardDesign, discardCardDraft } from "@/app/actions/card-design";
import { Button } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";

export type ApprovalState = { pending: boolean; live: boolean; draftUpdatedAt: string | null; approvedAt: string | null; canApprove: boolean };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : null);

/**
 * Where the design stands: changes are a draft until the organisation's owner approves them, and only
 * then does every member's card (of this scope) use them. `flush` saves any edit still waiting.
 */
export function ApprovalBar({ state, pending, scope, flush }: { state: ApprovalState; pending: boolean; scope: { organisationSlug: string; planId: string | null; roleId: string | null }; flush: () => Promise<void> }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: typeof approveCardDesign) => startTransition(async () => {
    setError(null);
    await flush();
    const result = await action(scope);
    if (result.ok) router.refresh();
    else setError(result.error);
  });
  const approved = when(state.approvedAt);
  return (
    <div className="flex flex-col gap-2 border-b border-line bg-canvas px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {pending ? (
          <Chip tone="warning" icon={<Clock />}>Waiting for the owner&apos;s approval</Chip>
        ) : (
          <Chip tone="success" icon={<BadgeCheck />}>{state.live ? "On members' cards" : "Not on any cards yet"}</Chip>
        )}
        <p className="text-caption text-ink-muted">
          {pending
            ? state.canApprove ? "Members' cards keep the approved design until you approve these changes." : "Members' cards keep the approved design until the owner approves these changes."
            : approved ? `Approved ${approved}.` : "Changes you make here wait for the owner's approval."}
        </p>
        {pending ? (
          <span className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => run(discardCardDraft)}>Discard changes</Button>
            {state.canApprove ? <Button size="sm" variant="primary" loading={busy} onClick={() => run(approveCardDesign)}>Approve and publish</Button> : null}
          </span>
        ) : null}
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
    </div>
  );
}

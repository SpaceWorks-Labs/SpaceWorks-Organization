"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOwnershipTransfer, startOwnershipTransfer } from "@/app/actions/ownership";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Dropdown, Field } from "@/components/ui/field";

/**
 * The owner offers the organisation to someone on the team who holds their role for the whole organisation, and picks
 * the role they keep. Nothing changes until that person accepts; until then the owner can cancel.
 */
export function TransferOwnershipPanel({ organisationSlug, candidates, keepRoles, defaultKeepRoleId, pending: waiting }: {
  organisationSlug: string;
  candidates: Array<{ userId: string; name: string }>;
  keepRoles: Array<{ id: string; name: string }>;
  defaultKeepRoleId: string | null;
  /** The offer already waiting for an answer. */
  pending: { toName: string; expiresLabel: string } | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [targetUserId, setTargetUserId] = useState("");
  const [keepRoleId, setKeepRoleId] = useState(defaultKeepRoleId ?? keepRoles[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const target = candidates.find((candidate) => candidate.userId === targetUserId);
  const kept = keepRoles.find((role) => role.id === keepRoleId);

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => startTransition(async () => {
    const res = await action();
    if (!res.ok) {
      showToast(res.error, "error");
      return;
    }
    setConfirming(false);
    showToast(done, "success");
    router.refresh();
  });

  return (
    <section aria-labelledby="transfer-title" className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-panel p-5">
      <div>
        <h2 id="transfer-title" className="text-h4 text-ink">Transfer ownership</h2>
        <p className="text-body-ui text-ink-secondary">Offer the organisation to someone who holds their role for the whole organisation. It moves when they accept.</p>
      </div>
      {waiting ? (
        <>
          <p className="text-body-ui text-ink">Waiting for {waiting.toName} to accept. The offer lasts until {waiting.expiresLabel}.</p>
          <div>
            <Button variant="secondary" loading={pending} loadingLabel="Cancelling" onClick={() => run(() => cancelOwnershipTransfer({ organisationSlug }), "Transfer cancelled")}>Cancel transfer</Button>
          </div>
        </>
      ) : candidates.length === 0 ? (
        <p className="text-caption text-ink-muted">No one can take over yet. Invite someone for the whole organisation first.</p>
      ) : (
        <>
          <Field label="New owner">
            <Dropdown value={targetUserId} disabled={pending} onChange={(event) => setTargetUserId(event.target.value)}>
              <option value="">Choose a person</option>
              {candidates.map((candidate) => <option key={candidate.userId} value={candidate.userId}>{candidate.name}</option>)}
            </Dropdown>
          </Field>
          <Field label="Your role afterwards">
            <Dropdown value={keepRoleId} disabled={pending} onChange={(event) => setKeepRoleId(event.target.value)}>
              {keepRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </Dropdown>
          </Field>
          <div>
            <Button variant="secondary" disabled={pending || !target || !kept} onClick={() => setConfirming(true)}>Offer ownership</Button>
          </div>
        </>
      )}
      <ConfirmationDialog
        open={confirming}
        title={target ? `Offer ownership to ${target.name}?` : "Offer ownership?"}
        message={`When they accept, they become the owner and you stay on the team as ${kept?.name ?? "the role you chose"}. Only the new owner can give ownership back. You may need to sign in again first.`}
        confirmLabel="Offer ownership"
        loading={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => run(() => startOwnershipTransfer({ organisationSlug, targetUserId, keepRoleId }), "Ownership offered")}
      />
    </section>
  );
}

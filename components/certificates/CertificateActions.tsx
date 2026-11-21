"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, ShieldX } from "lucide-react";
import { emailIssuedCertificate, revokeIssuedCertificate } from "@/app/actions/certificates";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { REVOKE_REASON_MAX } from "@/lib/certificates/pages";

/**
 * Email a valid certificate to its member again (once every ten minutes; the server says when it is too soon) and
 * revoke it with a required reason. Revoking is a danger confirmation naming the member and what happens.
 */
export function CertificateActions({ organisationSlug, certificateId, memberName, title, canEmail, canRevoke }: {
  organisationSlug: string;
  certificateId: string;
  memberName: string;
  title: string;
  canEmail: boolean;
  canRevoke: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [emailing, startEmail] = useTransition();
  const [revoking, startRevoke] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const target = { organisationSlug, certificateId };

  const email = () => startEmail(async () => {
    const result = await emailIssuedCertificate(target);
    if (result.ok) {
      showToast(`Email to ${memberName} queued with the PDF.`, "success");
      router.refresh();
    } else showToast(result.error, result.error.includes("few minutes") ? "warning" : "error");
  });
  const revoke = () => {
    if (!reason.trim()) return setError("Say why it is being revoked.");
    startRevoke(async () => {
      setError(null);
      const result = await revokeIssuedCertificate({ ...target, reason: reason.trim() });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      setReason("");
      router.refresh();
    });
  };

  if (!canEmail && !canRevoke) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canEmail ? <Button variant="secondary" startIcon={<Mail />} loading={emailing} onClick={email}>{emailing ? "Queuing email…" : "Email to member"}</Button> : null}
      {canRevoke ? <Button variant="danger" startIcon={<ShieldX />} onClick={() => setOpen(true)}>Revoke certificate…</Button> : null}
      <ConfirmDialog
        open={open}
        title={`Revoke ${memberName}'s certificate?`}
        message={`"${title}" stops verifying immediately: its check page shows it as revoked and no longer names ${memberName}. It stays on record and can't be restored; issue a new one if needed.`}
        confirmLabel="Revoke certificate"
        loading={revoking}
        onConfirm={revoke}
        onCancel={() => { setOpen(false); setError(null); }}
      >
        <Field label="Reason" helperText="Kept with the certificate for your team. Members and the public never see it." error={error ?? undefined}>
          <Textarea rows={3} value={reason} maxLength={REVOKE_REASON_MAX} autoFocus onChange={(event) => setReason(event.target.value)} required />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

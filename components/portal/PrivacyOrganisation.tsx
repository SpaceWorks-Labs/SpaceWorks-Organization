"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestDataErasure, withdrawConsent, withdrawDataErasure } from "@/app/actions/portal";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip, OrgLogo } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";

type PrivacyConsent = { id: string; purpose: string; noticeVersion: string; granted: string; withdrawn: string | null; byGuardian: boolean };
type PrivacyErasure = { id: string; status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN"; requested: string; decided: string | null; note: string | null };

const PURPOSES: Record<string, string> = { membership: "Membership records under the privacy notice" };

/** Consent and erasure for one organisation the person belongs to. */
export function PrivacyOrganisation({ organisation, consents, erasure }: {
  organisation: { slug: string; name: string; logoUrl: string | null };
  consents: PrivacyConsent[];
  erasure: PrivacyErasure | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [dialog, setDialog] = useState<{ kind: "consent"; id: string } | { kind: "erase" } | { kind: "cancel-erase" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, startTransition] = useTransition();
  const slug = organisation.slug;

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done: string) => startTransition(async () => {
    const result = await work();
    setDialog(null);
    showToast(result.ok ? done : result.error ?? "Couldn't do that. Try again.", result.ok ? "success" : "error");
    if (result.ok) {
      setReason("");
      router.refresh();
    }
  });
  const pending = erasure?.status === "PENDING";

  return (
    <Card as="section" className="rounded-xl" aria-labelledby={`privacy-${slug}`}>
      <div className="mb-5 flex items-center gap-3">
        <OrgLogo name={organisation.name} src={organisation.logoUrl} size="sm" />
        <h3 id={`privacy-${slug}`} className="min-w-0 truncate text-h4 text-ink">{organisation.name}</h3>
      </div>

      <CardHeader titleAs="h4" title="Consent" description="What you agreed to when you joined." />
      {consents.length === 0 ? <p className="text-body-ui text-ink-muted">No consent on record. {organisation.name} added you directly.</p> : (
        <ul className="flex flex-col divide-y divide-line">
          {consents.map((consent) => (
            <li key={consent.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-body-ui text-ink">{PURPOSES[consent.purpose] ?? consent.purpose}</p>
                <p className="text-caption text-ink-muted">Notice {consent.noticeVersion} · agreed {consent.granted}{consent.byGuardian ? " by a guardian" : ""}</p>
              </div>
              {consent.withdrawn ? <Chip size="sm" tone="neutral">Withdrawn {consent.withdrawn}</Chip> : (
                <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "consent", id: consent.id })}>Withdraw consent</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
        <CardHeader titleAs="h4" title="Erase your details" description={`Ask ${organisation.name} to remove your name, contact details and answers. Payment records stay for 8 years, as the law requires, without them.`} />
        {pending ? (
          <Callout tone="info" action={<Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "cancel-erase" })}>Withdraw request</Button>}>
            You asked on {erasure.requested}. {organisation.name} will email you their decision.
          </Callout>
        ) : (
          <>
            {erasure?.status === "REJECTED" ? (
              <Callout tone="warning" title={`${organisation.name} declined your request on ${erasure.decided}`}>{erasure.note ? `Their note: ${erasure.note}` : "Contact them if you have questions."}</Callout>
            ) : null}
            <div><Button variant="dangerOutline" size="sm" onClick={() => setDialog({ kind: "erase" })}>Ask to erase my details</Button></div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={dialog?.kind === "consent"}
        title="Withdraw consent?"
        message={`${organisation.name} will stop using your details for anything beyond the records they must keep. Your membership continues; to have your details removed, ask for erasure.`}
        confirmLabel="Withdraw consent"
        cancelLabel="Keep consent"
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => dialog?.kind === "consent" && run(() => withdrawConsent({ organisationSlug: slug, consentId: dialog.id }), "Consent withdrawn.")}
      />
      <ConfirmDialog
        open={dialog?.kind === "erase"}
        title={`Ask ${organisation.name} to erase your details?`}
        message="A manager reviews it. If they approve, your membership there ends and your details are replaced for good. This can't be undone."
        confirmLabel="Send request"
        cancelLabel="Cancel"
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => requestDataErasure({ organisationSlug: slug, reason }), "Request sent.")}
      >
        <Field label="Anything they should know" optional>
          <Textarea value={reason} rows={3} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === "cancel-erase"}
        title="Withdraw your erasure request?"
        message={`${organisation.name} keeps your details and your membership carries on.`}
        confirmLabel="Withdraw request"
        cancelLabel="Keep request"
        destructive={false}
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => erasure && run(() => withdrawDataErasure({ organisationSlug: slug, requestId: erasure.id }), "Request withdrawn.")}
      />
    </Card>
  );
}

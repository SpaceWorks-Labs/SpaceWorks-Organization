"use client";

import type { CertificateIssuePreview } from "@/app/actions/certificate-batch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/display";

const count = (value: number, one: string, many: string) => `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;

/**
 * The last look before issuing: how many certificates this makes, who is skipped because they already hold this
 * certificate, and whether emails go out. Issued certificates are records (revoked, never deleted), so it says so.
 */
export function IssueConfirmDialog({ preview, designName, title, email, busy, onConfirm, onCancel }: {
  preview: CertificateIssuePreview | null;
  designName: string;
  title: string;
  email: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const none = preview ? preview.willIssue === 0 : false;
  return (
    <Dialog open={Boolean(preview)} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <DialogContent size="sm" hideClose={busy}>
        {preview ? (
          <>
            <DialogHeader
              title={none ? "Everyone already has this certificate" : `Issue ${count(preview.willIssue, "certificate", "certificates")}?`}
              description={`${title} · ${designName}`}
            />
            <DialogBody className="flex flex-col gap-3">
              <p className="text-body-ui text-ink-secondary">
                {count(preview.recipients, "member matches", "members match")}.{" "}
                {none ? "Each of them already holds a valid certificate of this design with this title." : `${count(preview.willIssue, "gets", "get")} a new certificate with its own number and check link${email ? " and an email with the PDF" : ""}.`}
              </p>
              {preview.skipped ? (
                <Callout tone="info" title={`${count(preview.skipped, "member is", "members are")} skipped`}>
                  They already hold a valid certificate of this design with this title:{" "}
                  {preview.skippedNames.join(", ")}{preview.skipped > preview.skippedNames.length ? ` and ${preview.skipped - preview.skippedNames.length} more` : ""}.
                </Callout>
              ) : null}
              {none ? null : <p className="text-caption text-ink-muted">Issued certificates stay on record. If one is wrong, revoke it from its page and issue a new one.</p>}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" disabled={busy} onClick={onCancel}>{none ? "Close" : "Cancel"}</Button>
              {none ? null : <Button variant="primary" loading={busy} onClick={onConfirm}>{busy ? "Issuing…" : `Issue ${count(preview.willIssue, "certificate", "certificates")}`}</Button>}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

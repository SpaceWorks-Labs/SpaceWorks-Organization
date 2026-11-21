"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createCertificateDesign } from "@/app/actions/certificate-designs";
import { Button } from "@/components/ui/button";
import { RadioCard, RadioGroup } from "@/components/ui/choice";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { NAME_MAX, TYPE_LABEL_MAX, type CertificateOrientation, type CertificatePageSize } from "@/lib/certificates/pages";

/**
 * Start a certificate design: its name, its type (Membership, Appreciation, Completion, Office bearer…), the page
 * size and which way round. It opens in the designer with a ready-made layout, as a draft for the owner to approve.
 */
export function NewDesignDialog({ organisationSlug }: { organisationSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const [pageSize, setPageSize] = useState<CertificatePageSize>("A4");
  const [orientation, setOrientation] = useState<CertificateOrientation>("LANDSCAPE");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Give the design a name.");
    startTransition(async () => {
      setError(null);
      const result = await createCertificateDesign({ organisationSlug, name: name.trim(), typeLabel: typeLabel.trim() || undefined, pageSize, orientation });
      if (!result.ok || !result.data) return setError(result.ok ? "The design wasn't created. Try again." : result.error);
      router.push(`/dashboard/${organisationSlug}/certificates/designs/${result.data.designId}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <Button variant="primary" startIcon={<Plus />} onClick={() => setOpen(true)}>New design</Button>
      <DialogContent size="md">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader title="New certificate design" description="It starts from a ready-made layout you can change. The owner approves it before certificates are issued from it." />
          <DialogBody className="flex flex-col gap-4">
            <Field label="Design name" helperText="Only your team sees it, for example Volunteer of the year." error={error && !name.trim() ? error : undefined}>
              <Input value={name} maxLength={NAME_MAX} autoFocus onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Certificate type" optional helperText="Membership, Appreciation, Course completion, Office bearer… Printed as the title unless you give one when issuing. The name is used when left empty.">
              <Input value={typeLabel} maxLength={TYPE_LABEL_MAX} onChange={(event) => setTypeLabel(event.target.value)} />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-label text-ink">Page size</legend>
              <RadioGroup value={pageSize} onValueChange={(value) => setPageSize(value as CertificatePageSize)} aria-label="Page size" className="grid gap-2 sm:grid-cols-2">
                <RadioCard value="A4" label="A4" description="210 × 297 mm" />
                <RadioCard value="LETTER" label="US Letter" description="8.5 × 11 in" />
              </RadioGroup>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-label text-ink">Orientation</legend>
              <RadioGroup value={orientation} onValueChange={(value) => setOrientation(value as CertificateOrientation)} aria-label="Orientation" className="grid gap-2 sm:grid-cols-2">
                <RadioCard value="LANDSCAPE" label="Landscape" description="Wider than tall, the usual certificate" />
                <RadioCard value="PORTRAIT" label="Portrait" description="Taller than wide" />
              </RadioGroup>
            </fieldset>
            {error && name.trim() ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Create design</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

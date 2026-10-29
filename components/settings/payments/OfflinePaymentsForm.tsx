"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOfflinePaymentSettings } from "@/app/actions/payment-settings";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";

type OfflineValues = { upiVpa: string; upiPayeeName: string; offlineInstructions: string };

/** What members see when they pay directly: a UPI QR and free-form bank or cash instructions. */
export function OfflinePaymentsForm({ slug, initial, canEdit }: { slug: string; initial: OfflineValues; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveOfflinePaymentSettings({ organisationSlug: slug, ...values });
          setErrors(result.ok ? {} : result.fieldErrors ?? {});
          setStatus(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
          if (result.ok) router.refresh();
        });
      }}
    >
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="UPI ID" optional helperText="Members see a QR code for the exact amount." error={errors.upiVpa?.[0]}>
          <Input value={values.upiVpa} disabled={!canEdit} placeholder="club@okbank" onChange={(event) => setValues({ ...values, upiVpa: event.target.value.trim() })} maxLength={80} spellCheck={false} />
        </Field>
        <Field label="Payee name" optional error={errors.upiPayeeName?.[0]}>
          <Input value={values.upiPayeeName} disabled={!canEdit} onChange={(event) => setValues({ ...values, upiPayeeName: event.target.value })} maxLength={80} />
        </Field>
      </div>
      <Field label="Other ways to pay" optional helperText="Bank details, where to hand in cash, cheque payee. Shown on the pay page." error={errors.offlineInstructions?.[0]}>
        <Textarea value={values.offlineInstructions} disabled={!canEdit} onChange={(event) => setValues({ ...values, offlineInstructions: event.target.value })} rows={5} maxLength={1500} />
      </Field>
      {canEdit ? <div><Button type="submit" variant="primary" loading={pending}>Save</Button></div> : null}
    </form>
  );
}

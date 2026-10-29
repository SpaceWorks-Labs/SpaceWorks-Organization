"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUnitPaymentInstructions } from "@/app/actions/units";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/field";
import { UNIT_INSTRUCTIONS_MAX } from "@/lib/payments/unitInstructions";

/** A unit's own offline payment instructions. Left empty, members here see the nearest unit above's, then the organisation's. */
export function UnitPaymentInstructionsForm({ slug, unitId, initial, inherited, canEdit }: {
  slug: string; unitId: string; initial: string; inherited: { instructions: string; fromUnit: string | null }; canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fallback = inherited.instructions
    ? `Left empty, members here see ${inherited.fromUnit ? `${inherited.fromUnit}'s` : "the organisation's"} instructions.`
    : "Left empty, members here see no instructions. Add the organisation's under Settings, Payments.";
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setResult(null);
        startTransition(async () => {
          const outcome = await setUnitPaymentInstructions({ organisationSlug: slug, unitId, paymentInstructions: value });
          setResult(outcome.ok ? { ok: true, message: "Saved. Members here see these on their pay page and payment emails." } : { ok: false, message: outcome.error });
          if (outcome.ok) router.refresh();
        });
      }}
    >
      {result ? <Callout tone={result.ok ? "success" : "danger"} role={result.ok ? "status" : "alert"}>{result.message}</Callout> : null}
      <Field label="How members here pay" optional helperText={`Whom to pay, when, and the UPI ID. ${fallback}`}>
        <Textarea value={value} disabled={!canEdit} onChange={(event) => setValue(event.target.value)} rows={5} maxLength={UNIT_INSTRUCTIONS_MAX} placeholder={inherited.instructions || undefined} />
      </Field>
      {canEdit ? (
        <div>
          <Button type="submit" variant="secondary" loading={pending} disabled={value.trim() === initial.trim()}>Save instructions</Button>
        </div>
      ) : null}
    </form>
  );
}

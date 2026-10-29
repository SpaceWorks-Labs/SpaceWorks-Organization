"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRefundPolicy } from "@/app/actions/payment-settings";
import { REFUND_POLICY_LABELS, type RefundPolicyName } from "@/lib/payments/refundPolicy";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";

type RefundPolicyValues = { refundPolicy: RefundPolicyName; refundWindowDays: number; refundPolicyText: string };

const EXPLAIN: Record<RefundPolicyName, string> = {
  NONE: "Members can still cancel from their account, but nothing is offered back. You can always refund by hand from a payment.",
  FULL: "Members who cancel within the window can ask for everything they paid. Your team approves each request.",
  PRO_RATA: "Members who cancel within the window can ask for the unused share of the membership fee. Joining fees aren't refunded.",
};

/** The refund policy members see on their membership page, and what it offers them when they cancel. */
export function RefundPolicyForm({ slug, initial, canEdit }: { slug: string; initial: RefundPolicyValues; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [days, setDays] = useState(String(initial.refundWindowDays));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveRefundPolicy({ organisationSlug: slug, ...values, refundWindowDays: Number(days) });
          setErrors(result.ok ? {} : result.fieldErrors ?? {});
          setStatus(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
          if (result.ok) router.refresh();
        });
      }}
    >
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[2fr_1fr]">
        <Field label="Refund policy" helperText={EXPLAIN[values.refundPolicy]}>
          <Dropdown value={values.refundPolicy} disabled={!canEdit} onChange={(event) => setValues({ ...values, refundPolicy: event.target.value as RefundPolicyName })}>
            {(Object.keys(REFUND_POLICY_LABELS) as RefundPolicyName[]).map((policy) => <option key={policy} value={policy}>{REFUND_POLICY_LABELS[policy]}</option>)}
          </Dropdown>
        </Field>
        {values.refundPolicy !== "NONE" ? (
          <Field label="Days to ask after paying" error={errors.refundWindowDays?.[0]}>
            <Input type="number" inputMode="numeric" min={1} max={365} value={days} disabled={!canEdit} onChange={(event) => setDays(event.target.value)} />
          </Field>
        ) : null}
      </div>
      <Field label="Policy in your words" optional helperText="Shown to members on their membership page, next to the cancel button." error={errors.refundPolicyText?.[0]}>
        <Textarea value={values.refundPolicyText} disabled={!canEdit} onChange={(event) => setValues({ ...values, refundPolicyText: event.target.value })} rows={3} maxLength={2000} placeholder="Cancel within 14 days of paying for a full refund." />
      </Field>
      {canEdit ? <div><Button type="submit" variant="primary" loading={pending}>Save refund policy</Button></div> : null}
    </form>
  );
}

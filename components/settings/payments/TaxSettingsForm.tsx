"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTaxSettings } from "@/app/actions/payment-settings";
import { INDIAN_STATES } from "@/lib/indianStates";
import { formatDocumentNumber } from "@/lib/payments/numbering";
import { Button } from "@/components/ui/button";
import { CheckboxField, SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";

type TaxValues = {
  mode: "NONE" | "SIMPLE" | "GST"; scheme: "REGULAR" | "COMPOSITION"; gstin: string; legalName: string; address: string; stateCode: string; sacCode: string;
  rateBps: number; inclusive: boolean; exempt: boolean; foreignCurrencyTax: "EXPORT_LUT" | "NO_TAX"; lutNumber: string; simpleTaxName: string; receiptPrefix: string;
};

const GST_RATES = [0, 500, 1200, 1800, 2800];

/** How payments are taxed and what the receipts say. Changes apply to payments created from now on. */
export function TaxSettingsForm({ slug, initial, canEdit }: { slug: string; initial: TaxValues; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof TaxValues>(key: K, value: TaxValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const gst = values.mode === "GST";
  const example = formatDocumentNumber(values.receiptPrefix.toUpperCase(), "R", "2026-27", 42);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveTaxSettings({ organisationSlug: slug, ...values });
          setErrors(result.ok ? {} : result.fieldErrors ?? {});
          setStatus(result.ok ? { ok: true, text: "Saved. New payments use these settings; earlier receipts keep theirs." } : { ok: false, text: result.error });
          if (result.ok) router.refresh();
        });
      }}
    >
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <SegmentedControl<TaxValues["mode"]>
        ariaLabel="Tax mode"
        value={values.mode}
        onValueChange={(mode) => set("mode", mode)}
        options={[{ value: "NONE", label: "No tax" }, { value: "SIMPLE", label: "One tax rate" }, { value: "GST", label: "Indian GST" }]}
      />
      <p className="text-body-ui text-ink-secondary">
        {values.mode === "NONE" ? "Members get a plain receipt. Choose this if you aren't registered for any tax." : values.mode === "SIMPLE" ? "One named tax, such as VAT, at one rate, on plans in any currency." : "Tax invoices with CGST and SGST, or IGST for members in other states. Bills of supply when you're exempt or on the composition scheme."}
      </p>

      {values.mode === "SIMPLE" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Tax name" error={errors.simpleTaxName?.[0]}><Input value={values.simpleTaxName} disabled={!canEdit} onChange={(event) => set("simpleTaxName", event.target.value)} maxLength={20} /></Field>
          <Field label="Rate (%)" error={errors.rateBps?.[0]}><Input inputMode="decimal" value={String(values.rateBps / 100)} disabled={!canEdit} onChange={(event) => set("rateBps", Math.round(Number(event.target.value || 0) * 100))} /></Field>
        </div>
      ) : null}

      {gst ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="GSTIN" error={errors.gstin?.[0]}><Input value={values.gstin} disabled={!canEdit} onChange={(event) => set("gstin", event.target.value.toUpperCase().trim())} maxLength={15} spellCheck={false} /></Field>
            <Field label="Registered state" error={errors.stateCode?.[0]}>
              <Dropdown value={values.stateCode} disabled={!canEdit} onChange={(event) => set("stateCode", event.target.value)}>
                <option value="" disabled>Choose one</option>
                {INDIAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
              </Dropdown>
            </Field>
            <Field label="Legal name" error={errors.legalName?.[0]}><Input value={values.legalName} disabled={!canEdit} onChange={(event) => set("legalName", event.target.value)} maxLength={160} /></Field>
            <Field label="SAC" helperText="999599 covers membership of associations." error={errors.sacCode?.[0]}><Input value={values.sacCode} disabled={!canEdit} onChange={(event) => set("sacCode", event.target.value.trim())} maxLength={8} inputMode="numeric" /></Field>
          </div>
          <Field label="Registered address" error={errors.address?.[0]}><Textarea value={values.address} disabled={!canEdit} onChange={(event) => set("address", event.target.value)} rows={2} maxLength={300} /></Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Scheme">
              <Dropdown value={values.scheme} disabled={!canEdit} onChange={(event) => set("scheme", event.target.value as TaxValues["scheme"])}>
                <option value="REGULAR">Regular</option>
                <option value="COMPOSITION">Composition (bill of supply, no tax)</option>
              </Dropdown>
            </Field>
            {values.scheme === "REGULAR" && !values.exempt ? (
              <Field label="GST rate" error={errors.rateBps?.[0]}>
                <Dropdown value={String(values.rateBps)} disabled={!canEdit} onChange={(event) => set("rateBps", Number(event.target.value))}>
                  {GST_RATES.map((rate) => <option key={rate} value={String(rate)}>{rate / 100}%</option>)}
                </Dropdown>
              </Field>
            ) : null}
          </div>
          <CheckboxField checked={values.exempt} disabled={!canEdit} onCheckedChange={(checked) => set("exempt", checked === true)} label="Membership fees are exempt" description="Issue bills of supply instead of tax invoices." />
          <Field label="Plans priced in other currencies" helperText="Members paying in USD, AED and so on.">
            <Dropdown value={values.foreignCurrencyTax} disabled={!canEdit} onChange={(event) => set("foreignCurrencyTax", event.target.value as TaxValues["foreignCurrencyTax"])}>
              <option value="NO_TAX">Plain receipt, no GST</option>
              <option value="EXPORT_LUT">Export of services under LUT (zero-rated tax invoice)</option>
            </Dropdown>
          </Field>
          {values.foreignCurrencyTax === "EXPORT_LUT" ? <Field label="LUT reference" error={errors.lutNumber?.[0]}><Input value={values.lutNumber} disabled={!canEdit} onChange={(event) => set("lutNumber", event.target.value)} maxLength={40} /></Field> : null}
        </>
      ) : null}

      {values.mode !== "NONE" && !(gst && (values.scheme === "COMPOSITION" || values.exempt)) ? (
        <CheckboxField checked={values.inclusive} disabled={!canEdit} onCheckedChange={(checked) => set("inclusive", checked === true)} label="Plan prices include tax" description={values.inclusive ? "Members pay the plan price; the tax is worked out of it." : "Tax is added on top of the plan price."} />
      ) : null}

      <Field label="Receipt number prefix" optional helperText={`Up to four letters or digits. Numbers look like ${example}.`} error={errors.receiptPrefix?.[0]}>
        <Input value={values.receiptPrefix} disabled={!canEdit} onChange={(event) => set("receiptPrefix", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} className="max-w-[160px]" />
      </Field>
      <p className="text-caption text-ink-muted">This sets up documents the way the GST rules describe, but it isn&apos;t tax advice. Check your setup with your accountant.</p>
      {canEdit ? <div><Button type="submit" variant="primary" loading={pending}>Save tax settings</Button></div> : null}
    </form>
  );
}

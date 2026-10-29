"use client";

import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/money/currencies";
import { DURATION_LABELS, JOIN_MODE_LABELS } from "@/lib/membership/describe";
import { CheckboxField, RadioCard, RadioGroup } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";
import type { PlanFormValues } from "./planFormState";

type SectionProps = {
  values: PlanFormValues;
  set: <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => void;
  errors: Record<string, string[] | undefined>;
  disabled?: boolean;
};

const cardClass = "min-h-0 items-start justify-start px-4 py-3.5 text-left [&>span:first-child]:text-label";

function moneyHelp(currency: string) {
  return CURRENCIES[currency as CurrencyCode]?.exponent === 0 ? "Whole amounts only." : "For example 1200 or 1200.50.";
}

export function PriceSection({ values, set, errors, disabled, currencyLocked }: SectionProps & { currencyLocked: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Currency" helperText={currencyLocked ? "Fixed once members join." : undefined} error={errors.currency?.[0]}>
          <Dropdown value={values.currency} disabled={disabled || currencyLocked} onChange={(event) => set("currency", event.target.value)}>
            {CURRENCY_CODES.map((code) => <option key={code} value={code}>{`${code} · ${CURRENCIES[code].name}`}</option>)}
          </Dropdown>
        </Field>
        <Field label="Price to join" helperText={`Leave empty for a free plan. ${moneyHelp(values.currency)}`} error={errors.priceNew?.[0]}>
          <Input inputMode="decimal" value={values.priceNew} disabled={disabled} placeholder="0" onChange={(event) => set("priceNew", event.target.value)} />
        </Field>
        <Field label="Price to renew" optional helperText="Empty means the same as joining." error={errors.priceRenewal?.[0]}>
          <Input inputMode="decimal" value={values.priceRenewal} disabled={disabled} placeholder={values.priceNew || "0"} onChange={(event) => set("priceRenewal", event.target.value)} />
        </Field>
        <Field label="Joining fee" optional helperText="A one-time fee on top of the first year." error={errors.joiningFee?.[0]}>
          <Input inputMode="decimal" value={values.joiningFee} disabled={disabled} placeholder="0" onChange={(event) => set("joiningFee", event.target.value)} />
        </Field>
      </div>
      {values.joiningFee && values.joiningFee !== "0" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="When someone rejoins" error={errors.rejoinFeeRule?.[0]}>
            <Dropdown value={values.rejoinFeeRule} disabled={disabled} onChange={(event) => set("rejoinFeeRule", event.target.value as PlanFormValues["rejoinFeeRule"])}>
              <option value="NEVER">Never charge the joining fee again</option>
              <option value="EACH_JOIN">Charge it every time they rejoin</option>
              <option value="AFTER_LAPSE">Charge it if they were away too long</option>
            </Dropdown>
          </Field>
          {values.rejoinFeeRule === "AFTER_LAPSE" ? (
            <Field label="Away for more than (days)" error={errors.rejoinAfterDays?.[0]}>
              <Input inputMode="numeric" value={values.rejoinAfterDays} disabled={disabled} onChange={(event) => set("rejoinAfterDays", event.target.value.replace(/\D/g, ""))} />
            </Field>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LengthSection({ values, set, errors, disabled }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <RadioGroup value={values.durationType} onValueChange={(value) => set("durationType", value as PlanFormValues["durationType"])} className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="How long a membership lasts" disabled={disabled}>
        {(Object.keys(DURATION_LABELS) as Array<keyof typeof DURATION_LABELS>).map((key) => (
          <RadioCard key={key} value={key} label={DURATION_LABELS[key].label} description={DURATION_LABELS[key].description} className={cardClass} />
        ))}
      </RadioGroup>
      {values.durationType === "ROLLING" ? (
        <Field label="Length in months" error={errors.durationMonths?.[0]} className="max-w-[16rem]">
          <Input inputMode="numeric" value={values.durationMonths} disabled={disabled} onChange={(event) => set("durationMonths", event.target.value.replace(/\D/g, ""))} />
        </Field>
      ) : null}
      {values.durationType === "FIXED_END" ? (
        <Field label="Last valid day" error={errors.fixedEndDate?.[0]} className="max-w-[16rem]">
          <Input type="date" value={values.fixedEndDate} disabled={disabled} onChange={(event) => set("fixedEndDate", event.target.value)} />
        </Field>
      ) : null}
    </div>
  );
}

export function JoiningSection({ values, set, disabled }: SectionProps) {
  const priced = Boolean(values.priceNew && values.priceNew !== "0") || Boolean(values.joiningFee && values.joiningFee !== "0");
  return (
    <div className="flex flex-col gap-5">
      <RadioGroup value={values.joinMode} onValueChange={(value) => set("joinMode", value as PlanFormValues["joinMode"])} className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="How people join" disabled={disabled}>
        {(Object.keys(JOIN_MODE_LABELS) as Array<keyof typeof JOIN_MODE_LABELS>).map((key) => (
          <RadioCard key={key} value={key} label={JOIN_MODE_LABELS[key].label} description={JOIN_MODE_LABELS[key].description} className={cardClass} />
        ))}
      </RadioGroup>
      {priced ? (
        <RadioGroup value={values.paymentTiming} onValueChange={(value) => set("paymentTiming", value as PlanFormValues["paymentTiming"])} className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="When membership starts" disabled={disabled}>
          <RadioCard value="PAY_THEN_ACTIVATE" label="Starts when paid" description="Approved members pay first; the membership starts on payment." className={cardClass} />
          <RadioCard value="ACTIVATE_THEN_CHARGE" label="Starts now, pay later" description="The membership starts at once and the fee stays due." className={cardClass} />
        </RadioGroup>
      ) : null}
    </div>
  );
}

export function RenewalSection({ values, set, errors, disabled }: SectionProps) {
  const number = (key: "graceDays" | "renewalWindowDays") => (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value.replace(/\D/g, ""));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Renewal opens (days before the end)" error={errors.renewalWindowDays?.[0]}>
          <Input inputMode="numeric" value={values.renewalWindowDays} disabled={disabled} onChange={number("renewalWindowDays")} />
        </Field>
        <Field label="Grace after the end (days)" helperText="Members stay valid, marked as in grace, while they renew." error={errors.graceDays?.[0]}>
          <Input inputMode="numeric" value={values.graceDays} disabled={disabled} onChange={number("graceDays")} />
        </Field>
        <Field label="Remind before the end (days)" helperText="Separate with commas. 0 is the last day." error={errors.reminderDaysBefore?.[0]}>
          <Input value={values.reminderDaysBefore} disabled={disabled} onChange={(event) => set("reminderDaysBefore", event.target.value)} />
        </Field>
        <Field label="Remind after the end (days)" optional error={errors.reminderDaysAfter?.[0]}>
          <Input value={values.reminderDaysAfter} disabled={disabled} onChange={(event) => set("reminderDaysAfter", event.target.value)} />
        </Field>
      </div>
      <CheckboxField
        checked={values.lateRenewalBackdate}
        disabled={disabled}
        onCheckedChange={(checked) => set("lateRenewalBackdate", checked === true)}
        label="A late renewal keeps the original dates"
        description="Renewing during grace continues from the old end date, so everyone stays on the same cycle."
      />
    </div>
  );
}

export function UnitsSection({ values, set, errors, disabled, units }: SectionProps & { units: Array<{ id: string; name: string; level: number }> }) {
  if (units.length === 0) return <p className="text-body-ui text-ink-secondary">Open to the whole organisation. Add units in Settings to limit plans to some of them.</p>;
  return (
    <div className="flex flex-col gap-4">
      <CheckboxField checked={values.allUnits} disabled={disabled} onCheckedChange={(checked) => set("allUnits", checked === true)} label="Open to every unit" />
      {!values.allUnits ? (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1 text-label text-ink">Only these units</legend>
          {errors.unitIds?.[0] ? <p className="text-caption text-danger-fg">{errors.unitIds[0]}</p> : null}
          {units.map((unit) => (
            <div key={unit.id} style={{ marginLeft: `${unit.level * 1.25}rem` }}>
              <CheckboxField
                checked={values.unitIds.includes(unit.id)}
                disabled={disabled}
                onCheckedChange={(checked) => set("unitIds", checked === true ? [...values.unitIds, unit.id] : values.unitIds.filter((id) => id !== unit.id))}
                label={unit.name}
              />
            </div>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}

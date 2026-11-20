"use client";

import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/payments/paymentMode";
import { RadioCard, RadioGroup } from "@/components/ui/choice";
import type { PlanFormValues } from "./planFormState";

/** How the plan is paid. Free hides the price fields; the other two keep them. */
export function PaymentModeSection({ values, set, disabled }: { values: PlanFormValues; set: <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => void; disabled?: boolean }) {
  return (
    <RadioGroup
      value={values.paymentMode}
      onValueChange={(value) => set("paymentMode", value as PlanFormValues["paymentMode"])}
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      aria-label="How the plan is paid"
      disabled={disabled}
    >
      {PAYMENT_MODES.map((mode) => (
        <RadioCard key={mode} value={mode} label={PAYMENT_MODE_LABELS[mode].label} description={PAYMENT_MODE_LABELS[mode].description} className="min-h-0 items-start justify-start px-4 py-3.5 text-left [&>span:first-child]:text-label" />
      ))}
    </RadioGroup>
  );
}

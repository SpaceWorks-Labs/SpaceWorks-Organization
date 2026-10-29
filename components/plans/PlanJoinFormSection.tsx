"use client";

import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field } from "@/components/ui/field";
import type { PlanFormValues } from "./planFormState";

type Props = {
  values: PlanFormValues;
  set: <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => void;
  errors: Record<string, string[] | undefined>;
  disabled?: boolean;
};

type Mode = PlanFormValues["joinFields"]["phone"];
const MODES: Array<[Mode, string]> = [["HIDDEN", "Hidden"], ["OPTIONAL", "Optional"], ["REQUIRED", "Required"]];

/** What the public join form asks for beyond name and email. Members already on record keep what they have. */
export function JoinFormSection({ values, set, errors, disabled }: Props) {
  const setField = (patch: Partial<PlanFormValues["joinFields"]>) => set("joinFields", { ...values.joinFields, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Photo" helperText="Printed on the member's card." error={errors.joinPhoto?.[0]}>
          <Dropdown value={values.joinPhoto} disabled={disabled} onChange={(event) => set("joinPhoto", event.target.value as PlanFormValues["joinPhoto"])}>
            <option value="OFF">Off</option>
            <option value="OPTIONAL">Optional</option>
            <option value="REQUIRED">Required</option>
          </Dropdown>
        </Field>
        {(["phone", "state"] as const).map((key) => (
          <Field key={key} label={key === "phone" ? "Phone" : "State"} error={errors[`joinFields.${key}`]?.[0]}>
            <Dropdown value={values.joinFields[key]} disabled={disabled} onChange={(event) => setField({ [key]: event.target.value as Mode })}>
              {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Dropdown>
          </Field>
        ))}
      </div>
      <CheckboxField
        checked={values.joinFields.minors}
        disabled={disabled}
        onCheckedChange={(checked) => setField({ minors: checked === true })}
        label="Offer the under-18 option"
        description="People under 18 join with a parent or guardian's details and consent. Members already recorded as under 18 are always asked."
      />
    </div>
  );
}

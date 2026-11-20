"use client";

import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";
import type { PlanFormValues } from "./planFormState";
import type { RenewalFormValues } from "./planRenewalState";

type Named = Array<{ id: string; name: string }>;

/** Who may renew, what is asked again, where members move and when they lapse. */
export function RenewalRules({ values, set, errors, disabled, plans, groups }: {
  values: PlanFormValues;
  set: <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => void;
  errors: Record<string, string[] | undefined>;
  disabled?: boolean;
  plans: Named;
  groups: Named;
}) {
  const { renewal } = values;
  const change = <K extends keyof RenewalFormValues>(key: K, value: RenewalFormValues[K]) => set("renewal", { ...renewal, [key]: value });
  const digits = (key: "extraGraceDays" | "intoAge" | "intoYears") => (event: React.ChangeEvent<HTMLInputElement>) => change(key, event.target.value.replace(/\D/g, ""));
  return (
    <div className="flex flex-col gap-5">
      <CheckboxField checked={renewal.requireApproval} disabled={disabled} onCheckedChange={(checked) => change("requireApproval", checked === true)} label="Renewals need approval again" description="A member's renewal waits for your team, like a new application. Staff renewing for a member skip it." />
      <CheckboxField checked={renewal.reaskAnswers} disabled={disabled} onCheckedChange={(checked) => change("reaskAnswers", checked === true)} label="Ask the join-form questions again" description="Members confirm their answers when they renew from their account." />
      <CheckboxField checked={renewal.reaskPhoto} disabled={disabled} onCheckedChange={(checked) => change("reaskPhoto", checked === true)} label="Ask for a current photo" description="Members add a photo when they renew from their account." />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Keep in grace for extra days" optional helperText="Added to the grace days above before the membership lapses. 0 lapses right after grace." error={errors["renewalPolicy.extraGraceDays"]?.[0]}>
          <Input inputMode="numeric" value={renewal.extraGraceDays} disabled={disabled} onChange={digits("extraGraceDays")} />
        </Field>
        {groups.length ? (
          <Field label="Who may renew" optional helperText="Only members of this group can renew from their account." error={errors["renewalPolicy.eligibleGroupId"]?.[0]}>
            <Dropdown value={renewal.eligibleGroupId} disabled={disabled} onChange={(event) => change("eligibleGroupId", event.target.value)}>
              <option value="">Every member</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </Dropdown>
          </Field>
        ) : null}
      </div>
      {plans.length ? (
        <fieldset className="flex flex-col gap-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-label text-ink">Renew into another plan</legend>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Move members to" optional error={errors.renewalPolicy?.[0]}>
              <Dropdown value={renewal.intoPlanId} disabled={disabled} onChange={(event) => change("intoPlanId", event.target.value)}>
                <option value="">Stay on this plan</option>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </Dropdown>
            </Field>
            {renewal.intoPlanId ? (
              <>
                <Field label="Aged at least" optional helperText="From the date of birth they gave when joining.">
                  <Input inputMode="numeric" value={renewal.intoAge} disabled={disabled} onChange={digits("intoAge")} />
                </Field>
                <Field label="After years of membership" optional>
                  <Input inputMode="numeric" value={renewal.intoYears} disabled={disabled} onChange={digits("intoYears")} />
                </Field>
                {groups.length ? (
                  <Field label="Or in group" optional>
                    <Dropdown value={renewal.intoGroupId} disabled={disabled} onChange={(event) => change("intoGroupId", event.target.value)}>
                      <option value="">Any</option>
                      {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </Dropdown>
                  </Field>
                ) : null}
              </>
            ) : null}
          </div>
          {renewal.intoPlanId ? <p className="text-caption text-ink-muted">Every condition you fill in must hold. The renewal is charged at the new plan&apos;s renewal price.</p> : null}
        </fieldset>
      ) : null}
    </div>
  );
}

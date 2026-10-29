"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMember, updateMember } from "@/app/actions/members";
import { INDIAN_STATES } from "@/lib/indianStates";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { PlanAnswerFields, type AnswerState } from "@/components/members/PlanAnswerFields";
import type { ProfilePlan } from "@/lib/membership/profileQuestions";

type MemberProfileValues = {
  name: string; email: string; phone: string; stateCode: string; unitId: string;
  isMinor: boolean; guardianName: string; guardianEmail: string; guardianPhone: string;
  fieldValues: AnswerState;
};

/**
 * Add a member by hand, or edit one. Adding with a plan opens a membership straight away and asks that plan's
 * questions; editing asks the questions of every plan the member holds (`questions`).
 */
export function MemberProfileForm({
  slug, memberId, initial, units, questions, plans, unitLabel, disabled,
}: {
  slug: string; memberId?: string; initial: MemberProfileValues; units: Array<{ id: string; name: string; level: number }>;
  questions: ProfilePlan[]; plans?: Array<{ id: string; name: string }>; unitLabel: string; disabled?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [planId, setPlanId] = useState(plans?.[0]?.id ?? "");
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof MemberProfileValues>(key: K, value: MemberProfileValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const setAnswer = (key: string, value: string | boolean) => setValues((current) => ({ ...current, fieldValues: { ...current.fieldValues, [key]: value } }));

  const submit = () => startTransition(async () => {
    setStatus(null);
    const profile = { ...values, unitId: values.unitId || null, stateCode: values.stateCode || null };
    const result = memberId ? await updateMember({ organisationSlug: slug, memberId, profile }) : await addMember({ organisationSlug: slug, profile, planId: planId || null });
    setErrors(result.ok ? {} : result.fieldErrors ?? {});
    if (!result.ok) return setStatus({ ok: false, text: result.error });
    if (!memberId && result.data && "memberId" in result.data) return router.push(`/dashboard/${slug}/members/${result.data.memberId}`);
    setStatus({ ok: true, text: "Saved." });
    router.refresh();
  });

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name?.[0]}><Input value={values.name} disabled={disabled} onChange={(e) => set("name", e.target.value)} maxLength={120} /></Field>
        <Field label="Email" required error={errors.email?.[0]}><Input type="email" value={values.email} disabled={disabled} onChange={(e) => set("email", e.target.value)} maxLength={320} /></Field>
        <Field label="Phone" optional error={errors.phone?.[0]}><Input type="tel" value={values.phone} disabled={disabled} onChange={(e) => set("phone", e.target.value)} maxLength={32} /></Field>
        <Field label="State" optional helperText="Used as the place of supply on receipts." error={errors.stateCode?.[0]}>
          <Dropdown value={values.stateCode} disabled={disabled} onChange={(e) => set("stateCode", e.target.value)}>
            <option value="">Not given</option>
            {INDIAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
          </Dropdown>
        </Field>
        {units.length ? (
          <Field label={unitLabel} optional error={errors.unitId?.[0]}>
            <Dropdown value={values.unitId} disabled={disabled} onChange={(e) => set("unitId", e.target.value)}>
              <option value="">None</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{`${"— ".repeat(unit.level)}${unit.name}`}</option>)}
            </Dropdown>
          </Field>
        ) : null}
        {plans ? (
          <Field label="Start a membership on" optional helperText="Managers' additions skip approval.">
            <Dropdown value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">No plan for now</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </Dropdown>
          </Field>
        ) : null}
      </div>
      <PlanAnswerFields plans={memberId ? questions : questions.filter((plan) => plan.id === planId)} values={values.fieldValues} errors={errors} byManager disabled={disabled} onAnswer={setAnswer} />
      <CheckboxField checked={values.isMinor} disabled={disabled} onCheckedChange={(checked) => set("isMinor", checked === true)} label="Under 18" description="A parent or guardian consents and receives the emails too." />
      {values.isMinor ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Guardian's name" required error={errors.guardianName?.[0]}><Input value={values.guardianName} disabled={disabled} onChange={(e) => set("guardianName", e.target.value)} /></Field>
          <Field label="Guardian's email" required error={errors.guardianEmail?.[0]}><Input type="email" value={values.guardianEmail} disabled={disabled} onChange={(e) => set("guardianEmail", e.target.value)} /></Field>
          <Field label="Guardian's phone" optional><Input type="tel" value={values.guardianPhone} disabled={disabled} onChange={(e) => set("guardianPhone", e.target.value)} /></Field>
        </div>
      ) : null}
      {!disabled ? <div><Button type="submit" variant="primary" loading={pending}>{memberId ? "Save details" : "Add member"}</Button></div> : null}
    </form>
  );
}

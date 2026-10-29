"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMemberProfile } from "@/app/actions/portal";
import { INDIAN_STATES } from "@/lib/indianStates";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input, ReadOnlyValue } from "@/components/ui/field";
import { PlanAnswerFields, type AnswerState } from "@/components/members/PlanAnswerFields";
import type { ProfilePlan } from "@/lib/membership/profileQuestions";

type PortalProfile = {
  name: string; email: string; phone: string; stateCode: string;
  isMinor: boolean; guardianName: string; guardianEmail: string; guardianPhone: string;
  unitName: string | null; hasUnits: boolean;
  fieldValues: AnswerState;
};

/**
 * The member's own details in one organisation. Email links the record to the account and the unit is the
 * organisation's to change, so both are read-only here; managers' own questions never show.
 */
export function PortalProfileForm({ organisationSlug, organisationName, unitLabel, initial, questions }: {
  organisationSlug: string; organisationName: string; unitLabel: string; initial: PortalProfile; questions: ProfilePlan[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof PortalProfile>(key: K, value: PortalProfile[K]) => setValues((current) => ({ ...current, [key]: value }));
  const answer = (key: string, value: string | boolean) => setValues((current) => ({ ...current, fieldValues: { ...current.fieldValues, [key]: value } }));

  const submit = () => startTransition(async () => {
    setStatus(null);
    const { name, phone, stateCode, guardianName, guardianEmail, guardianPhone, fieldValues } = values;
    const result = await updateMemberProfile({ organisationSlug, profile: { name, phone, stateCode: stateCode || null, guardianName, guardianEmail, guardianPhone, fieldValues } });
    setErrors(result.ok ? {} : result.fieldErrors ?? {});
    setStatus(result.ok ? { ok: true, text: `Saved. ${organisationName} sees your new details.` } : { ok: false, text: result.error });
    if (result.ok) router.refresh();
  });

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name?.[0]}><Input value={values.name} autoComplete="name" onChange={(e) => set("name", e.target.value)} maxLength={120} /></Field>
        <Field label="Email" helperText="Your account's email. Change it in your profile."><ReadOnlyValue value={values.email} /></Field>
        <Field label="Phone" optional error={errors.phone?.[0]}><Input type="tel" autoComplete="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} maxLength={32} /></Field>
        <Field label="State" optional helperText="Used as the place of supply on receipts." error={errors.stateCode?.[0]}>
          <Dropdown value={values.stateCode} onChange={(e) => set("stateCode", e.target.value)}>
            <option value="">Not given</option>
            {INDIAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
          </Dropdown>
        </Field>
        {values.hasUnits ? (
          <Field label={unitLabel} helperText={`Ask ${organisationName} to move you.`}><ReadOnlyValue value={values.unitName ?? "None"} /></Field>
        ) : null}
      </div>
      <PlanAnswerFields plans={questions} values={values.fieldValues} errors={errors} byManager={false} onAnswer={answer} />
      {values.isMinor ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Guardian's name" required error={errors.guardianName?.[0]}><Input value={values.guardianName} onChange={(e) => set("guardianName", e.target.value)} /></Field>
          <Field label="Guardian's email" required error={errors.guardianEmail?.[0]}><Input type="email" value={values.guardianEmail} onChange={(e) => set("guardianEmail", e.target.value)} /></Field>
          <Field label="Guardian's phone" optional><Input type="tel" value={values.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} /></Field>
        </div>
      ) : null}
      <div><Button type="submit" variant="primary" loading={pending}>Save details</Button></div>
    </form>
  );
}

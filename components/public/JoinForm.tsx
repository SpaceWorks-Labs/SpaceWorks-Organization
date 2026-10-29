"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { submitJoin } from "@/app/actions/join";
import { INDIAN_STATES } from "@/lib/indianStates";
import type { JoinFields } from "@/lib/membership/joinFields";
import type { QuestionField } from "@/lib/membership/profileQuestions";
import type { PaymentGuidance } from "@/lib/payments/unitInstructions";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input, ReadOnlyValue } from "@/components/ui/field";
import { JoinOutcome } from "./JoinOutcome";
import { JoinPhotoField } from "./JoinPhotoField";
import { JoinQuestions, type JoinAnswer } from "./JoinQuestions";

type Outcome = { status: string; payUrl: string | null; accountUrl: string; payment: PaymentGuidance | null; warning: string | null };

/**
 * The public join form. Name and email come from the signed-in account; the plan decides the photo, phone, state,
 * the under-18 option and its questions. `ownMember` is the signed-in person's own record, when they have one.
 */
export function JoinForm({ orgSlug, planSlug, inviteToken, user, units, unitLabel, presetUnitId, questions, approval, photoMode, joinFields, ownMember }: {
  orgSlug: string; planSlug: string; inviteToken: string | null; user: { name: string; email: string };
  units: Array<{ id: string; name: string; level: number }>; unitLabel: string; presetUnitId: string | null; questions: QuestionField[]; approval: boolean;
  photoMode: "OFF" | "OPTIONAL" | "REQUIRED"; joinFields: JoinFields; ownMember: { isMinor: boolean; hasPhoto: boolean } | null;
}) {
  const [values, setValues] = useState({ name: user.name, phone: "", stateCode: "", unitId: presetUnitId ?? "", isMinor: false, guardianName: "", guardianEmail: "", guardianPhone: "" });
  const [answers, setAnswers] = useState<Record<string, JoinAnswer>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof values, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));
  // A member already on record keeps their under-18 status; otherwise the plan decides whether to ask.
  const minor = ownMember ? ownMember.isMinor : joinFields.minors && values.isMinor;

  if (outcome) return <JoinOutcome {...outcome} />;

  const submit = () => startTransition(async () => {
    setError(null);
    const fieldValues = Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, Array.isArray(value) ? value.join("; ") : value]));
    const profile = { ...values, isMinor: minor, unitId: values.unitId || null, stateCode: values.stateCode || null, fieldValues };
    const form = new FormData();
    form.set("payload", JSON.stringify({ organisationSlug: orgSlug, planSlug, inviteToken, consent, guardianConsent: minor && guardianConsent, profile }));
    if (photo) form.set("photo", photo);
    const result = await submitJoin(form);
    if (result.ok) {
      setOutcome({ status: result.data?.status ?? "ACTIVE", payUrl: result.data?.payUrl ?? null, accountUrl: result.data?.accountUrl ?? "/account", payment: result.data?.payment ?? null, warning: result.data?.warning ?? null });
    } else {
      setErrors(result.fieldErrors ?? {});
      setError(result.error);
    }
  });

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name?.[0]}><Input value={values.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" maxLength={120} /></Field>
        <Field label="Email" helperText="From your account."><ReadOnlyValue value={user.email} /></Field>
        {joinFields.phone !== "HIDDEN" ? (
          <Field label="Phone" required={joinFields.phone === "REQUIRED"} optional={joinFields.phone === "OPTIONAL"} error={errors.phone?.[0]}>
            <Input type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" maxLength={32} />
          </Field>
        ) : null}
        {joinFields.state !== "HIDDEN" ? (
          <Field label="State" required={joinFields.state === "REQUIRED"} optional={joinFields.state === "OPTIONAL"} error={errors.stateCode?.[0]}>
            <Dropdown value={values.stateCode} onChange={(e) => set("stateCode", e.target.value)}>
              <option value="">Choose one</option>
              {INDIAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
            </Dropdown>
          </Field>
        ) : null}
        {units.length ? (
          <Field label={unitLabel} required error={errors.unitId?.[0]}>
            <Dropdown value={values.unitId} disabled={Boolean(presetUnitId)} onChange={(e) => set("unitId", e.target.value)}>
              <option value="" disabled>Choose one</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{`${"— ".repeat(unit.level)}${unit.name}`}</option>)}
            </Dropdown>
          </Field>
        ) : null}
      </div>
      <JoinPhotoField mode={photoMode} hasPhoto={Boolean(ownMember?.hasPhoto)} error={errors.photo?.[0]} onChange={setPhoto} />
      <JoinQuestions questions={questions} answers={answers} errors={errors} onAnswer={(key, value) => setAnswers((current) => ({ ...current, [key]: value }))} />
      {!ownMember && joinFields.minors ? (
        <CheckboxField checked={values.isMinor} onCheckedChange={(c) => set("isMinor", c === true)} label="I'm under 18" description="A parent or guardian needs to agree too." />
      ) : null}
      {minor ? (
        <div className="flex flex-col gap-4">
          {ownMember ? <p className="text-body-ui text-ink-secondary">You&apos;re recorded as under 18, so a parent or guardian needs to agree.</p> : null}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Guardian's name" required error={errors.guardianName?.[0]}><Input value={values.guardianName} onChange={(e) => set("guardianName", e.target.value)} /></Field>
            <Field label="Guardian's email" required error={errors.guardianEmail?.[0]}><Input type="email" value={values.guardianEmail} onChange={(e) => set("guardianEmail", e.target.value)} /></Field>
            <Field label="Guardian's phone" optional><Input type="tel" value={values.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} /></Field>
          </div>
          <div className="flex flex-col gap-1">
            <CheckboxField checked={guardianConsent} onCheckedChange={(c) => setGuardianConsent(c === true)} label="I am the parent or guardian and agree to this membership and the privacy notice." />
            {errors.guardianConsent?.[0] ? <p role="alert" className="text-caption text-danger-fg">{errors.guardianConsent[0]}</p> : null}
          </div>
        </div>
      ) : null}
      <CheckboxField
        checked={consent}
        onCheckedChange={(c) => setConsent(c === true)}
        label={<>I agree to the <Link href="/privacy" className="underline underline-offset-4" target="_blank">privacy notice</Link></>}
        description="The organisation keeps your details to run your membership. You can see, export or ask to erase them from your account."
      />
      <div><Button type="submit" variant="accent" size="lg" loading={pending} disabled={!consent || (minor && !guardianConsent)}>{approval && !inviteToken ? "Send application" : "Join"}</Button></div>
    </form>
  );
}

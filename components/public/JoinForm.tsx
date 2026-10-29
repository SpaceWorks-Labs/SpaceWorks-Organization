"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { submitJoin } from "@/app/actions/join";
import { INDIAN_STATES } from "@/lib/indianStates";
import { Button, buttonClasses } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input, ReadOnlyValue, Textarea } from "@/components/ui/field";
import { payToUnitLine, type PaymentGuidance } from "@/lib/payments/unitInstructions";

type Question = { key: string; label: string; helpText: string; type: string; required: boolean; options: string[] };

const OUTCOME: Record<string, { title: string; body: string }> = {
  PENDING_APPROVAL: { title: "Application sent", body: "The team will review it and email you their decision." },
  PENDING_PAYMENT: { title: "Almost there", body: "Your membership starts once it's paid. Pay now, or later from the link we've emailed you." },
  ACTIVE: { title: "You're a member", body: "Your membership has started. See it any time in your account." },
  UPCOMING: { title: "You're all set", body: "Your membership starts soon." },
};

/** The public join form. Name and email come from the signed-in account; the rest is the plan's questions. */
export function JoinForm({ orgSlug, planSlug, inviteToken, user, units, unitLabel, presetUnitId, questions, approval }: {
  orgSlug: string; planSlug: string; inviteToken: string | null; user: { name: string; email: string };
  units: Array<{ id: string; name: string; level: number }>; unitLabel: string; presetUnitId: string | null; questions: Question[]; approval: boolean;
}) {
  const [values, setValues] = useState({ name: user.name, phone: "", stateCode: "", unitId: presetUnitId ?? "", isMinor: false, guardianName: "", guardianEmail: "", guardianPhone: "" });
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [links, setLinks] = useState<{ pay: string | null; account: string }>({ pay: null, account: "/account" });
  const [payment, setPayment] = useState<PaymentGuidance | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof values, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));

  if (outcome) {
    const copy = OUTCOME[outcome] ?? OUTCOME.ACTIVE;
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
        <h2 className="text-h2 text-ink">{copy.title}</h2>
        <p className="text-body-ui text-ink-secondary">{copy.body}</p>
        {outcome === "PENDING_PAYMENT" && payment && (payToUnitLine(payment) || payment.instructions) ? (
          <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <h3 className="text-label font-semibold text-ink">{payToUnitLine(payment) ? "Pay your fee to your unit" : "How to pay"}</h3>
            {payment.unitName && payment.offlineOnly ? <p className="text-body-ui text-ink">{payment.unitName}</p> : null}
            {payment.instructions ? <p className="whitespace-pre-wrap text-body-ui text-ink-secondary">{payment.instructions}</p> : null}
          </div>
        ) : null}
        <div>
          {outcome === "PENDING_PAYMENT" && links.pay ? (
            <a href={links.pay} className={buttonClasses({ variant: "accent" })}>Pay now</a>
          ) : links.account === "/account" ? (
            <Link href="/account" className={buttonClasses({ variant: "accent" })}>Go to your account</Link>
          ) : (
            <Link href={links.account} className={buttonClasses({ variant: "accent" })}>Back to the organisation</Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await submitJoin({ organisationSlug: orgSlug, planSlug, inviteToken, consent, profile: { ...values, unitId: values.unitId || null, stateCode: values.stateCode || null, fieldValues: answers } });
          if (result.ok) {
            setOutcome(result.data?.status ?? "ACTIVE");
            setLinks({ pay: result.data?.payUrl ?? null, account: result.data?.accountUrl ?? "/account" });
            setPayment(result.data?.payment ?? null);
          }
          else {
            setErrors(result.fieldErrors ?? {});
            setError(result.error);
          }
        });
      }}
    >
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name?.[0]}><Input value={values.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" maxLength={120} /></Field>
        <Field label="Email" helperText="From your account."><ReadOnlyValue value={user.email} /></Field>
        <Field label="Phone" optional error={errors.phone?.[0]}><Input type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" maxLength={32} /></Field>
        <Field label="State" optional error={errors.stateCode?.[0]}>
          <Dropdown value={values.stateCode} onChange={(e) => set("stateCode", e.target.value)}>
            <option value="">Choose one</option>
            {INDIAN_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
          </Dropdown>
        </Field>
        {units.length ? (
          <Field label={unitLabel} required error={errors.unitId?.[0]}>
            <Dropdown value={values.unitId} disabled={Boolean(presetUnitId)} onChange={(e) => set("unitId", e.target.value)}>
              <option value="" disabled>Choose one</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{`${"— ".repeat(unit.level)}${unit.name}`}</option>)}
            </Dropdown>
          </Field>
        ) : null}
      </div>
      {questions.map((question) => {
        const error = errors[`fieldValues.${question.key}`]?.[0];
        const value = answers[question.key];
        const setAnswer = (next: string | boolean) => setAnswers((current) => ({ ...current, [question.key]: next }));
        if (question.type === "CHECKBOX") return <CheckboxField key={question.key} checked={value === true} onCheckedChange={(c) => setAnswer(c === true)} label={question.label} description={question.helpText || undefined} />;
        const common = { label: question.label, required: question.required, optional: !question.required, error, helperText: question.helpText || undefined };
        if (question.type === "SELECT") return <Field key={question.key} {...common}><Dropdown value={String(value ?? "")} onChange={(e) => setAnswer(e.target.value)}><option value="" disabled>Choose one</option>{question.options.map((o) => <option key={o} value={o}>{o}</option>)}</Dropdown></Field>;
        if (question.type === "LONG_TEXT") return <Field key={question.key} {...common}><Textarea value={String(value ?? "")} onChange={(e) => setAnswer(e.target.value)} rows={4} maxLength={2000} /></Field>;
        const type = { DATE: "date", NUMBER: "number", EMAIL: "email", PHONE: "tel" }[question.type] ?? "text";
        return <Field key={question.key} {...common}><Input type={type} value={String(value ?? "")} onChange={(e) => setAnswer(e.target.value)} maxLength={300} /></Field>;
      })}
      <CheckboxField checked={values.isMinor} onCheckedChange={(c) => set("isMinor", c === true)} label="I'm under 18" description="A parent or guardian needs to agree too." />
      {values.isMinor ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Guardian's name" required error={errors.guardianName?.[0]}><Input value={values.guardianName} onChange={(e) => set("guardianName", e.target.value)} /></Field>
          <Field label="Guardian's email" required error={errors.guardianEmail?.[0]}><Input type="email" value={values.guardianEmail} onChange={(e) => set("guardianEmail", e.target.value)} /></Field>
          <Field label="Guardian's phone" optional><Input type="tel" value={values.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} /></Field>
        </div>
      ) : null}
      <CheckboxField
        checked={consent}
        onCheckedChange={(c) => setConsent(c === true)}
        label={<>I agree to the <Link href="/privacy" className="underline underline-offset-4" target="_blank">privacy notice</Link>{values.isMinor ? ", and my guardian agrees" : ""}</>}
        description="The organisation keeps your details to run your membership. You can see, export or ask to erase them from your account."
      />
      <div><Button type="submit" variant="accent" size="lg" loading={pending} disabled={!consent}>{approval && !inviteToken ? "Send application" : "Join"}</Button></div>
    </form>
  );
}

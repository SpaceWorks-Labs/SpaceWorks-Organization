"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOrgEmailSettings, sendOrgTestEmail } from "@/app/actions/org-email";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { SwitchRow } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";

type OrgEmailValues = { enabled: boolean; fromName: string; fromAddress: string; replyTo: string; smtpHost: string; smtpPort: number; smtpUser: string; hasPassword: boolean };

const PORTS = [{ value: 587, label: "587 · STARTTLS (most relays)" }, { value: 465, label: "465 · TLS from the start" }, { value: 2525, label: "2525 · STARTTLS (alternative)" }, { value: 25, label: "25 · STARTTLS" }];

/** The organisation's own SMTP relay and sender for member emails, with a test send. */
export function OrgEmailForm({ slug, initial, canEdit, verified }: { slug: string; initial: OrgEmailValues; canEdit: boolean; verified: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof OrgEmailValues>(key: K, value: OrgEmailValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const { hasPassword: _, ...fields } = values;
  void _;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveOrgEmailSettings({ organisationSlug: slug, ...fields, smtpPassword: password || undefined });
          setErrors(result.ok ? {} : result.fieldErrors ?? {});
          setStatus(result.ok ? { ok: true, text: "Saved. Send a test to check it works." } : { ok: false, text: result.error });
          if (result.ok) { setPassword(""); router.refresh(); }
        });
      }}
    >
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <SwitchRow
        label="Send member emails through these settings"
        description="Off: member emails go through the platform's email in your organisation's name, with replies to your contact address."
        checked={values.enabled}
        disabled={!canEdit}
        onCheckedChange={(checked) => set("enabled", checked === true)}
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Sender name" optional helperText="Defaults to your organisation's name." error={errors.fromName?.[0]}>
          <Input value={values.fromName} disabled={!canEdit} maxLength={120} onChange={(event) => set("fromName", event.target.value)} />
        </Field>
        <Field label="Sender address" helperText="On a domain your relay is allowed to send for." error={errors.fromAddress?.[0]}>
          <Input type="email" value={values.fromAddress} disabled={!canEdit} onChange={(event) => set("fromAddress", event.target.value.trim())} />
        </Field>
        <Field label="Replies go to" optional error={errors.replyTo?.[0]}>
          <Input type="email" value={values.replyTo} disabled={!canEdit} onChange={(event) => set("replyTo", event.target.value.trim())} />
        </Field>
        <Field label="SMTP host" helperText="For example smtp-relay.brevo.com or smtp.gmail.com." error={errors.smtpHost?.[0]}>
          <Input value={values.smtpHost} disabled={!canEdit} spellCheck={false} onChange={(event) => set("smtpHost", event.target.value.trim())} />
        </Field>
        <Field label="Port">
          <Dropdown value={String(values.smtpPort)} disabled={!canEdit} onChange={(event) => set("smtpPort", Number(event.target.value))}>
            {PORTS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}
          </Dropdown>
        </Field>
        <Field label="SMTP login" optional error={errors.smtpUser?.[0]}>
          <Input value={values.smtpUser} disabled={!canEdit} autoComplete="off" onChange={(event) => set("smtpUser", event.target.value.trim())} />
        </Field>
        <Field label="SMTP password or key" optional={values.hasPassword} helperText={values.hasPassword ? "Saved. Leave blank to keep it." : undefined}>
          <Input type="password" value={password} disabled={!canEdit} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} />
        </Field>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={pending}>Save email settings</Button>
          <Button type="button" variant="secondary" disabled={pending || !initial.smtpHost} onClick={() => startTransition(async () => {
            const result = await sendOrgTestEmail({ organisationSlug: slug });
            setStatus(result.ok ? { ok: true, text: "Test sent to your email address." } : { ok: false, text: result.error });
            if (result.ok) router.refresh();
          })}>Send test email</Button>
          {verified ? <span className="text-caption text-ink-muted">Last test went through on {verified}.</span> : null}
        </div>
      ) : null}
    </form>
  );
}

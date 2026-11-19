"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInstanceSmsProvider, sendInstanceTestSms } from "@/app/actions/instance-sms";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { StatusPill, type ServiceState } from "@/components/super-admin/StatusPill";
import { SecretField } from "@/components/settings/SecretField";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { SMS_PROVIDERS, SMS_PROVIDER_LABELS, type SmsProvider } from "@/lib/sms/providerList";

type Values = { smsProvider: SmsProvider; twilioAccountSid: string; twilioApiKeySid: string; twilioFrom: string; twilioMessagingServiceSid: string; msg91SenderId: string; msg91TemplateId: string };
type Secrets = { twilioAuthToken: string; twilioApiKeySecret: string; msg91AuthKey: string; webhookSecret: string };
type Saved = { hasTwilioAuthToken: boolean; hasTwilioApiKeySecret: boolean; hasMsg91AuthKey: boolean; hasWebhookSecret: boolean };

const NO_SECRETS: Secrets = { twilioAuthToken: "", twilioApiKeySecret: "", msg91AuthKey: "", webhookSecret: "" };

/** Choose how the platform sends text messages (Twilio or MSG91), send a test before saving, and save it. */
export function InstanceSmsForm({ initial, saved, ready, webhookUrls, verifiedAt, lastError }: { initial: Values; saved: Saved; ready: boolean; webhookUrls: Record<SmsProvider, string>; verifiedAt: string | null; lastError: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [secrets, setSecrets] = useState<Secrets>(NO_SECRETS);
  const [testPhone, setTestPhone] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const draft = { ...values, ...secrets };
  const provider = values.smsProvider;
  const text = (key: keyof Values, label: string, helper?: string, optional?: boolean) => (
    <Field label={label} helperText={helper} optional={optional}>
      <Input value={values[key]} disabled={pending} autoComplete="off" spellCheck={false} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value.trim() }))} />
    </Field>
  );
  const secret = (key: keyof Secrets, label: string, has: boolean, helper?: string) => (
    <SecretField label={label} saved={has} helper={helper} value={secrets[key]} disabled={pending} onChange={(value) => setSecrets((current) => ({ ...current, [key]: value }))} />
  );
  const state: ServiceState = !ready ? "not_set_up" : lastError ? "unavailable" : "available";

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveInstanceSmsProvider(draft);
          setStatus(result.ok ? { ok: true, text: "Saved. Send a test to check it works." } : { ok: false, text: result.error ?? "Could not save." });
          if (result.ok) { setSecrets(NO_SECRETS); router.refresh(); }
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill state={state} />
        <span className="text-caption text-ink-muted">{state === "not_set_up" ? "Phone codes can’t be sent until a provider is set up." : state === "unavailable" ? "The last test failed. Check the details below, then send another test." : verifiedAt ? `Last test went through on ${new Date(verifiedAt).toISOString().slice(0, 10)}.` : "Not tested yet."}</span>
      </div>
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <Field label="SMS provider" helperText="Used for phone sign-in codes only. Without one, phone codes are unavailable.">
        <Dropdown value={provider} disabled={pending} onChange={(event) => setValues((current) => ({ ...current, smsProvider: event.target.value as SmsProvider }))}>
          {SMS_PROVIDERS.map((name) => <option key={name} value={name}>{SMS_PROVIDER_LABELS[name]}</option>)}
        </Dropdown>
      </Field>
      {provider === "twilio" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {text("twilioAccountSid", "Account SID", "Starts with AC.")}
          {secret("twilioAuthToken", "Auth token", saved.hasTwilioAuthToken, "Also verifies delivery reports.")}
          {text("twilioApiKeySid", "API key SID", "Use with the secret instead of the auth token. Starts with SK.", true)}
          {secret("twilioApiKeySecret", "API key secret", saved.hasTwilioApiKeySecret)}
          {text("twilioFrom", "From number", "With its country code. Not needed with a messaging service.", true)}
          {text("twilioMessagingServiceSid", "Messaging service SID", "Starts with MG. Used instead of the from number.", true)}
          <Callout tone="info" className="sm:col-span-2">Delivery reports are requested automatically at <code className="code-text [overflow-wrap:anywhere]">{webhookUrls.twilio}</code> and accepted only with Twilio&apos;s signature. They need the auth token above.</Callout>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {secret("msg91AuthKey", "Auth key", saved.hasMsg91AuthKey)}
          {text("msg91TemplateId", "Template ID", "The approved template, with the variables ##otp## and ##brand##.")}
          {text("msg91SenderId", "Sender ID", "Your registered sender ID, if the template does not carry it.", true)}
          {secret("webhookSecret", "Delivery report token", saved.hasWebhookSecret, "At least 16 letters and numbers. Optional.")}
          <Callout tone="info" className="sm:col-span-2">Delivery reports: add <code className="code-text [overflow-wrap:anywhere]">{webhookUrls.msg91}?token=</code> followed by the token above as the report address in MSG91.</Callout>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-5">
        <Field label="Send a test text to" optional helperText="With its country code. Used once, not stored." className="min-w-0 flex-1 sm:max-w-xs">
          <Input type="tel" value={testPhone} disabled={pending} autoComplete="off" onChange={(event) => setTestPhone(event.target.value)} />
        </Field>
        <Button type="button" variant="secondary" disabled={pending || !testPhone.trim()} onClick={() => startTransition(async () => {
          const result = await sendInstanceTestSms({ draft, phone: testPhone });
          setStatus(result.ok ? { ok: true, text: "Test sent. Check the phone." } : { ok: false, text: result.error ?? "The test failed." });
          if (result.ok) router.refresh();
        })}>Send a test text</Button>
        <Button type="submit" variant="primary" loading={pending}>Save SMS provider</Button>
      </div>
      {lastError ? <p className="text-caption text-danger-fg">Last test failed: {lastError}</p> : null}
    </form>
  );
}

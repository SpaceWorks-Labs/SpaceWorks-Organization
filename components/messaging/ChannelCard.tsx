"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeInstanceChannel, removeOrgChannel, saveInstanceChannel, saveOrgChannel, testInstanceChannel, testOrgChannel } from "@/app/actions/messaging-channels";
import { SecretField } from "@/components/settings/SecretField";
import { StatusPill, type ServiceState } from "@/components/super-admin/StatusPill";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, ReadOnlyValue } from "@/components/ui/field";
import { SwitchRow } from "@/components/ui/choice";
import { CHANNEL_LABELS } from "@/lib/messages/kinds";
import { CHANNEL_SPECS } from "@/lib/notify/descriptors";
import type { ChannelView } from "@/lib/notify/viewData";

const STATE: Record<ChannelView["status"]["state"], ServiceState> = { unset: "not_set_up", off: "switched_off", incomplete: "unavailable", failed: "unavailable", untested: "available", working: "available" };
const WORD: Record<ChannelView["status"]["state"], string> = {
  unset: "Not set up.",
  off: "Switched off.",
  incomplete: "Some fields are missing, so nothing is sent through it.",
  failed: "The last test failed, so nothing is sent through it until a test goes through.",
  untested: "Saved, but not tested yet.",
  working: "The last test went through.",
};

/** One channel's connection: its fields (secrets write-only), a test and the addresses the provider must be given. `slug` is the organisation's; without it this is the platform's. */
export function ChannelCard({ slug, view, canEdit, secretsReady, note }: { slug?: string; view: ChannelView; canEdit: boolean; secretsReady: boolean; note?: string }) {
  const router = useRouter();
  const spec = CHANNEL_SPECS[view.channel];
  const [provider, setProvider] = useState(view.provider);
  const [enabled, setEnabled] = useState(view.enabled);
  const [fields, setFields] = useState<Record<string, string>>(view.values);
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const active = spec.providers.find((item) => item.id === provider) ?? spec.providers[0];
  const label = CHANNEL_LABELS[view.channel];
  const disabled = !canEdit || !secretsReady;

  const run = (action: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string[] | undefined> }>, done: string) =>
    start(async () => {
      const result = await action();
      setConfirmRemove(false);
      setErrors(result.ok ? {} : result.fieldErrors ?? {});
      setMessage({ ok: result.ok, text: result.ok ? done : result.error ?? "That didn't work. Try again." });
      if (result.ok) {
        // Typed secrets leave the form as soon as they are saved.
        setFields((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, active.fields.find((field) => field.key === key)?.secret ? "" : value])));
        router.refresh();
      }
    });
  const body = { channel: view.channel, provider, enabled, fields };

  return (
    <Card as="section" className="max-w-[860px] rounded-xl" aria-label={label}>
      <CardHeader title={label} description={spec.about} action={<StatusPill state={STATE[view.status.state]} />} />
      <p className="mb-3 text-caption text-ink-muted">{WORD[view.status.state]}{view.status.detail ? ` ${view.status.detail}` : ""}{note ? ` ${note}` : ""}</p>
      {message ? <Callout tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"} className="mb-3">{message.text}</Callout> : null}
      {!secretsReady ? <Callout tone="warning" className="mb-3">Secrets can&apos;t be stored until the server has a PAYMENT_SECRETS_KEY.</Callout> : null}
      <div className="flex flex-col gap-4">
        {spec.providers.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={`${label} provider`}>
            {spec.providers.map((item) => (
              <Button key={item.id} variant={item.id === provider ? "primary" : "secondary"} size="sm" disabled={disabled} aria-pressed={item.id === provider} onClick={() => { setProvider(item.id); setErrors({}); }}>{item.label}</Button>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {active.fields.map((field) => field.secret ? (
            <SecretField key={`${provider}-${field.key}`} label={field.label} saved={provider === view.provider && view.secretsSaved.includes(field.key)} value={fields[field.key] ?? ""} disabled={disabled} helper={field.hint} onChange={(value) => setFields((current) => ({ ...current, [field.key]: value }))} />
          ) : (
            <Field key={`${provider}-${field.key}`} label={field.label} optional={field.optional} error={errors[field.key]?.[0]} helperText={field.hint}>
              <Input value={fields[field.key] ?? ""} disabled={disabled} autoComplete="off" spellCheck={false} onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))} />
            </Field>
          ))}
        </div>
        <SwitchRow label={`Use ${label} for members`} description="Switched off, nothing is sent through this connection." checked={enabled} disabled={disabled} onCheckedChange={setEnabled} />
        {view.webhooks.length ? (
          <div className="flex flex-col gap-2">
            {view.webhooks.map((webhook) => <Field key={webhook.url} label={webhook.label}><ReadOnlyValue value={<span className="code-text break-all text-[13px]">{webhook.url}</span>} /></Field>)}
          </div>
        ) : null}
        {view.channel === "SMS" ? <Field label="Send the test to" optional helperText="A number with its country code. Used once; never stored."><Input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="off" /></Field> : null}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" loading={pending} disabled={!secretsReady} onClick={() => run(() => (slug ? saveOrgChannel({ organisationSlug: slug, ...body }) : saveInstanceChannel(body)), "Saved. Run a test to check it.")}>Save connection</Button>
            {view.saved ? (
              <>
                <Button variant="secondary" disabled={pending} onClick={() => run(() => (slug ? testOrgChannel({ organisationSlug: slug, channel: view.channel, phone }) : testInstanceChannel({ channel: view.channel })), "The test went through.")}>Send a test</Button>
                <Button variant="dangerQuiet" disabled={pending} onClick={() => setConfirmRemove(true)}>Remove connection</Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove the ${label} connection?`}
        message="Its saved settings and secrets are deleted, and nothing more is sent through it. You can set it up again later."
        confirmLabel="Remove connection"
        loading={pending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => run(() => (slug ? removeOrgChannel({ organisationSlug: slug, channel: view.channel }) : removeInstanceChannel({ channel: view.channel })), "Removed.")}
      />
    </Card>
  );
}

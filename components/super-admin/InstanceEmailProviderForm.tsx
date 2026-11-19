"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInstanceEmailProvider, sendInstanceTestEmail } from "@/app/actions/instance-email";
import { EmailProviderFields, NO_SECRETS, type ProviderSaved, type ProviderSecrets, type ProviderValues } from "@/components/settings/EmailProviderFields";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import type { WebhookProvider } from "@/lib/email/providerList";

/** Choose how the platform sends email (SMTP, Amazon SES, Resend or Postmark), test it before saving, and save it. */
export function InstanceEmailProviderForm({ initial, saved, webhookUrls, verifiedAt, lastError }: { initial: ProviderValues; saved: ProviderSaved; webhookUrls: Record<WebhookProvider, string>; verifiedAt: string | null; lastError: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [secrets, setSecrets] = useState<ProviderSecrets>(NO_SECRETS);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const payload = { ...values, ...secrets };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveInstanceEmailProvider(payload);
          setStatus(result.ok ? { ok: true, text: "Saved. Send a test to check it works." } : { ok: false, text: result.error ?? "Could not save." });
          if (result.ok) { setSecrets(NO_SECRETS); router.refresh(); }
        });
      }}
    >
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <EmailProviderFields values={values} secrets={secrets} saved={saved} webhookUrls={webhookUrls} onValue={(key, value) => setValues((current) => ({ ...current, [key]: value }))} onSecret={(key, value) => setSecrets((current) => ({ ...current, [key]: value }))} />
      {values.emailProvider === "smtp" ? <p className="text-caption text-ink-muted">SMTP uses the host, login and password under Email and backups below.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={pending}>Save email provider</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => startTransition(async () => {
          const result = await sendInstanceTestEmail(payload);
          setStatus(result.ok ? { ok: true, text: "Test sent to your email address." } : { ok: false, text: result.error ?? "The test failed." });
          if (result.ok) router.refresh();
        })}>Send a test email</Button>
        {verifiedAt ? <span className="text-caption text-ink-muted">Last test went through on {new Date(verifiedAt).toISOString().slice(0, 10)}.</span> : null}
        {lastError ? <span className="text-caption text-danger-fg">Last test failed: {lastError}</span> : null}
      </div>
    </form>
  );
}

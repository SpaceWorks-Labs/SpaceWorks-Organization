"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePaymentGateway, testPaymentGateway } from "@/app/actions/payment-settings";
import { CopyField } from "@/components/settings/payments/CopyField";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout, Chip } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/field";

type Provider = "NONE" | "RAZORPAY" | "STRIPE";
type GatewayState = { provider: Provider; keyId: string | null; hasSecret: boolean; hasWebhookSecret: boolean; testMode: boolean; verifiedAt: string | null; webhookUrls: Record<"RAZORPAY" | "STRIPE", string> | null };

const EVENTS = {
  RAZORPAY: "payment.captured, refund.processed and refund.failed",
  STRIPE: "checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, refund.created, refund.updated and refund.failed",
};

/** Choose Razorpay or Stripe and save the organisation's own keys. Saved secrets show only as "saved". */
export function GatewaySettingsForm({ slug, initial, canEdit, secretsReady }: { slug: string; initial: GatewayState; canEdit: boolean; secretsReady: boolean }) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(initial.provider);
  const [keyId, setKeyId] = useState(initial.keyId ?? "");
  const [secret, setSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const sameProvider = provider === initial.provider;
  const locked = !canEdit || !secretsReady;

  const save = () =>
    startTransition(async () => {
      setStatus(null);
      const result = await savePaymentGateway({ organisationSlug: slug, provider, keyId: provider === "RAZORPAY" ? keyId : null, secret, webhookSecret });
      setErrors(result.ok ? {} : result.fieldErrors ?? {});
      setStatus(result.ok ? { ok: true, text: provider === "NONE" ? "Online payments are off." : "Saved. Test the connection to check the keys." } : { ok: false, text: result.error });
      if (result.ok) {
        setSecret("");
        setWebhookSecret("");
        router.refresh();
      }
    });
  const test = () =>
    startTransition(async () => {
      const result = await testPaymentGateway({ organisationSlug: slug });
      setStatus(result.ok ? { ok: true, text: "The provider accepted the keys." } : { ok: false, text: result.error });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {!secretsReady ? <Callout tone="warning" title="Online payments can't be switched on yet">The server needs PAYMENT_SECRETS_KEY set before gateway keys can be stored safely. Ask whoever runs this instance.</Callout> : null}
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <SegmentedControl<Provider>
        ariaLabel="Payment gateway"
        value={provider}
        onValueChange={(value) => setProvider(value)}
        options={[{ value: "NONE", label: "Offline only" }, { value: "RAZORPAY", label: "Razorpay" }, { value: "STRIPE", label: "Stripe" }]}
      />
      {provider === "NONE" ? (
        <p className="text-body-ui text-ink-secondary">Members pay you directly by UPI, bank transfer or cash, and your team records or confirms each payment.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {sameProvider && initial.hasSecret ? <Chip tone={initial.testMode ? "warning" : "success"}>{initial.testMode ? "Test mode" : "Live"}</Chip> : null}
            {sameProvider && initial.verifiedAt ? <Chip tone="outline">Keys checked {initial.verifiedAt}</Chip> : null}
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {provider === "RAZORPAY" ? (
              <Field label="Key id" helperText="Starts with rzp_test_ or rzp_live_." error={errors.keyId?.[0]}>
                <Input value={keyId} onChange={(event) => setKeyId(event.target.value.trim())} disabled={locked} autoComplete="off" spellCheck={false} />
              </Field>
            ) : null}
            <Field label={provider === "RAZORPAY" ? "Key secret" : "Secret key"} helperText={sameProvider && initial.hasSecret ? "Saved. Leave blank to keep it." : provider === "STRIPE" ? "Starts with sk_test_ or sk_live_. A restricted key (rk_) works too." : undefined} error={errors.secret?.[0]}>
              <PasswordInput value={secret} onChange={(event) => setSecret(event.target.value)} disabled={locked} autoComplete="off" />
            </Field>
            <Field label="Webhook secret" helperText={sameProvider && initial.hasWebhookSecret ? "Saved. Leave blank to keep it." : provider === "STRIPE" ? "The signing secret, starting with whsec_." : "The secret you set on the webhook in Razorpay."} error={errors.webhookSecret?.[0]}>
              <PasswordInput value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} disabled={locked} autoComplete="off" />
            </Field>
          </div>
          {initial.webhookUrls ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-4">
              <CopyField label="Webhook URL" value={initial.webhookUrls[provider]} />
              <p className="text-caption text-ink-muted">In your {provider === "RAZORPAY" ? "Razorpay" : "Stripe"} dashboard, add this URL as a webhook for: {EVENTS[provider]}.</p>
              {provider === "STRIPE" ? <p className="text-caption text-ink-muted">New Stripe accounts in India may be invite-only. Stripe takes every currency here; members are sent to Stripe&apos;s own checkout page.</p> : null}
            </div>
          ) : null}
        </>
      )}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={pending} disabled={locked} onClick={save}>Save gateway</Button>
          {provider !== "NONE" && sameProvider && initial.hasSecret ? <Button variant="secondary" disabled={pending} onClick={test}>Test connection</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

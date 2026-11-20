"use client";

import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { SecretField } from "./SecretField";
import { EMAIL_PROVIDERS, EMAIL_PROVIDER_LABELS, type EmailProvider, type WebhookProvider } from "@/lib/email/providerList";

export type ProviderValues = { emailProvider: EmailProvider; sesRegion: string; sesAccessKeyId: string; sesTopicArn: string; postmarkMessageStream: string };
export type ProviderSecrets = { sesSecretAccessKey: string; resendApiKey: string; postmarkServerToken: string; webhookSecret: string };
export type ProviderSaved = { hasSesSecret: boolean; hasResendKey: boolean; hasPostmarkToken: boolean; hasWebhookSecret: boolean };

export const NO_SECRETS: ProviderSecrets = { sesSecretAccessKey: "", resendApiKey: "", postmarkServerToken: "", webhookSecret: "" };

/**
 * The provider choice and the fields of Amazon SES, Resend and Postmark (SMTP's own fields stay with the form
 * that uses them). Secrets are write-only: a saved one is never shown, only that it exists.
 */
export function EmailProviderFields({ values, secrets, saved, webhookUrls, disabled, errors = {}, onValue, onSecret }: {
  values: ProviderValues;
  secrets: ProviderSecrets;
  saved: ProviderSaved;
  webhookUrls: Record<WebhookProvider, string>;
  disabled?: boolean;
  errors?: Record<string, string[] | undefined>;
  onValue: (key: keyof ProviderValues, value: string) => void;
  onSecret: (key: keyof ProviderSecrets, value: string) => void;
}) {
  const provider = values.emailProvider;
  const secret = (key: keyof ProviderSecrets, label: string, has: boolean, helper?: string) => (
    <SecretField label={label} saved={has} helper={helper} value={secrets[key]} disabled={disabled} onChange={(value) => onSecret(key, value)} />
  );
  return (
    <div className="flex flex-col gap-5">
      <Field label="Email provider" helperText="Switched on only once its fields are filled in. Without one, no email is sent.">
        <Dropdown value={provider} disabled={disabled} onChange={(event) => onValue("emailProvider", event.target.value as EmailProvider)}>
          {EMAIL_PROVIDERS.map((name) => <option key={name} value={name}>{EMAIL_PROVIDER_LABELS[name]}</option>)}
        </Dropdown>
      </Field>
      {provider === "ses" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="AWS region" helperText="For example eu-west-1." error={errors.sesRegion?.[0]}>
            <Input value={values.sesRegion} disabled={disabled} spellCheck={false} onChange={(event) => onValue("sesRegion", event.target.value.trim())} />
          </Field>
          <Field label="Access key ID" error={errors.sesAccessKeyId?.[0]}>
            <Input value={values.sesAccessKeyId} disabled={disabled} autoComplete="off" spellCheck={false} onChange={(event) => onValue("sesAccessKeyId", event.target.value.trim())} />
          </Field>
          {secret("sesSecretAccessKey", "Secret access key", saved.hasSesSecret)}
          <Field label="SNS topic for bounce reports" optional helperText="The one topic bounce and complaint reports may come from." error={errors.sesTopicArn?.[0]}>
            <Input value={values.sesTopicArn} disabled={disabled} spellCheck={false} onChange={(event) => onValue("sesTopicArn", event.target.value.trim())} />
          </Field>
        </div>
      ) : null}
      {provider === "resend" ? secret("resendApiKey", "API key", saved.hasResendKey, "Starts with re_. Needs permission to send.") : null}
      {provider === "postmark" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {secret("postmarkServerToken", "Server token", saved.hasPostmarkToken)}
          <Field label="Message stream" helperText="Usually outbound." error={errors.postmarkMessageStream?.[0]}>
            <Input value={values.postmarkMessageStream} disabled={disabled} spellCheck={false} onChange={(event) => onValue("postmarkMessageStream", event.target.value.trim())} />
          </Field>
        </div>
      ) : null}
      {provider !== "smtp" ? (
        <div className="flex flex-col gap-3">
          <Callout tone="info">
            {provider === "ses"
              ? <>Bounces and complaints: subscribe an SNS topic to <code className="code-text [overflow-wrap:anywhere]">{webhookUrls[provider]}</code> over HTTPS and enter the topic above. Reports are accepted only with Amazon&apos;s signature from that topic.</>
              : provider === "resend"
                ? <>Bounces and complaints: add <code className="code-text [overflow-wrap:anywhere]">{webhookUrls[provider]}</code> as a Resend webhook for bounced and complained emails, and paste its signing secret below.</>
                : <>Bounces and complaints: add <code className="code-text [overflow-wrap:anywhere]">{webhookUrls[provider]}</code> as a Postmark webhook with basic auth, any username, and the secret below as the password.</>}
          </Callout>
          {provider !== "ses" ? secret("webhookSecret", provider === "resend" ? "Webhook signing secret" : "Webhook password", saved.hasWebhookSecret) : null}
        </div>
      ) : null}
    </div>
  );
}

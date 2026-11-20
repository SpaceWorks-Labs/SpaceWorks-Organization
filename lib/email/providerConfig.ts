import { z } from "zod";
import { EMAIL_PROVIDERS, type EmailProvider } from "./providerList";
import { postmarkMailer } from "./providers/postmark";
import { resendMailer } from "./providers/resend";
import { SES_REGION, sesMailer } from "./providers/ses";
import { EmailProviderError, type Mailer } from "./providers/types";

/**
 * The fields and secrets of the HTTPS email providers. Stored as one encrypted JSON value (the platform's with
 * `encryptInstanceConfigSecret`, an organisation's with `encryptOrgSecret`) and never sent to the browser.
 */
export type ProviderConfig = {
  sesRegion?: string;
  sesAccessKeyId?: string;
  sesSecretAccessKey?: string;
  sesSessionToken?: string;
  /** The SNS topic bounce reports arrive from. Pinned, so another AWS account's topic cannot suppress addresses. */
  sesTopicArn?: string;
  resendApiKey?: string;
  postmarkServerToken?: string;
  postmarkMessageStream?: string;
  /** Resend's signing secret (whsec_…) or the password Postmark's webhook sends with basic auth. */
  webhookSecret?: string;
};

export const SECRET_FIELDS = ["sesSecretAccessKey", "resendApiKey", "postmarkServerToken", "webhookSecret"] as const;
export const PLAIN_FIELDS = ["sesRegion", "sesAccessKeyId", "sesTopicArn", "postmarkMessageStream"] as const;

const plain = (max: number) => z.string().trim().max(max).optional();
const secret = z.string().max(500).optional();

/** What the settings forms send. Secrets left blank keep the saved ones; the other fields replace. */
export const providerDraftSchema = z.object({
  emailProvider: z.enum(EMAIL_PROVIDERS),
  sesRegion: plain(30).refine((value) => !value || SES_REGION.test(value), "Enter an AWS region such as eu-west-1"),
  sesAccessKeyId: plain(128),
  sesTopicArn: plain(200).refine((value) => !value || /^arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,256}$/.test(value), "Enter the SNS topic ARN"),
  postmarkMessageStream: plain(60).refine((value) => !value || /^[A-Za-z0-9_-]+$/.test(value), "Use letters, numbers, hyphens and underscores"),
  sesSecretAccessKey: secret,
  resendApiKey: secret,
  postmarkServerToken: secret,
  webhookSecret: secret,
});
export type ProviderDraft = z.infer<typeof providerDraftSchema>;

/**
 * The secret a draft must type again because the place it is sent to changed: a saved SES secret is never reused
 * with a different region or access key id. Resend and Postmark have fixed hosts, so their secrets carry over.
 */
export function secretToRetype(saved: ProviderConfig, draft: ProviderDraft): "sesSecretAccessKey" | null {
  if (draft.emailProvider !== "ses" || !saved.sesSecretAccessKey || draft.sesSecretAccessKey) return null;
  return (draft.sesRegion ?? "") !== (saved.sesRegion ?? "") || (draft.sesAccessKeyId ?? "") !== (saved.sesAccessKeyId ?? "") ? "sesSecretAccessKey" : null;
}

export const RETYPE_SECRET_MESSAGE = "Enter the secret again: it is not reused when the region or access key changes.";

/** The saved config with the draft applied: blank secrets keep their saved value (except as above), other fields are replaced. */
export function applyDraft(saved: ProviderConfig, draft: ProviderDraft): ProviderConfig {
  const next: ProviderConfig = { ...saved };
  if (secretToRetype(saved, draft)) { delete next.sesSecretAccessKey; delete next.sesSessionToken; }
  for (const key of PLAIN_FIELDS) {
    const value = draft[key];
    if (value) next[key] = value; else delete next[key];
  }
  for (const key of SECRET_FIELDS) if (draft[key]) next[key] = draft[key];
  return next;
}

/** Whether a provider has everything it needs to send. SMTP is checked by its own fields. */
export function providerReady(provider: EmailProvider, config: ProviderConfig) {
  if (provider === "ses") return Boolean(config.sesRegion && config.sesAccessKeyId && config.sesSecretAccessKey);
  if (provider === "resend") return Boolean(config.resendApiKey);
  if (provider === "postmark") return Boolean(config.postmarkServerToken);
  return false;
}

/** A transport for an HTTPS provider. Throws EmailProviderError when its fields are incomplete. */
export function providerMailer(provider: Exclude<EmailProvider, "smtp">, config: ProviderConfig): Mailer {
  if (!providerReady(provider, config)) throw new EmailProviderError("This email provider is not fully set up.", false);
  if (provider === "ses") return sesMailer({ region: config.sesRegion!, accessKeyId: config.sesAccessKeyId!, secretAccessKey: config.sesSecretAccessKey!, sessionToken: config.sesSessionToken });
  if (provider === "resend") return resendMailer(config.resendApiKey!);
  return postmarkMailer(config.postmarkServerToken!, config.postmarkMessageStream ?? "outbound");
}

/** What the settings screens may show: plain fields and whether each secret is saved, never a secret. */
export function describeConfig(config: ProviderConfig) {
  return {
    sesRegion: config.sesRegion ?? "",
    sesAccessKeyId: config.sesAccessKeyId ?? "",
    sesTopicArn: config.sesTopicArn ?? "",
    postmarkMessageStream: config.postmarkMessageStream ?? "outbound",
    hasSesSecret: Boolean(config.sesSecretAccessKey),
    hasResendKey: Boolean(config.resendApiKey),
    hasPostmarkToken: Boolean(config.postmarkServerToken),
    hasWebhookSecret: Boolean(config.webhookSecret),
  };
}
export type ProviderView = ReturnType<typeof describeConfig>;

/** Which fields changed, by name only, for the audit record. */
export function changedFields(before: ProviderConfig, after: ProviderConfig): string {
  return [...PLAIN_FIELDS, ...SECRET_FIELDS].filter((key) => before[key] !== after[key]).join(",");
}

export function parseConfig(json: string | null | undefined): ProviderConfig {
  if (!json) return {};
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" ? (value as ProviderConfig) : {};
  } catch {
    return {};
  }
}

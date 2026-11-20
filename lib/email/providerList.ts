/** The outgoing email providers every Space Works product supports (product rules §16). Client-safe. */
export const EMAIL_PROVIDERS = ["smtp", "ses", "resend", "postmark"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  smtp: "SMTP",
  ses: "Amazon SES",
  resend: "Resend",
  postmark: "Postmark",
};

/** Providers that report bounces and complaints to a webhook. SMTP has no such report. */
export const WEBHOOK_PROVIDERS = ["ses", "resend", "postmark"] as const;
export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number];

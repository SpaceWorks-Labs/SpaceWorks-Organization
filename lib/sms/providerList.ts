/** The SMS providers every product supports (product rules section 16). */
export const SMS_PROVIDERS = ["twilio", "msg91"] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

export const SMS_PROVIDER_LABELS: Record<SmsProvider, string> = { twilio: "Twilio", msg91: "MSG91" };

export const isSmsProvider = (value: unknown): value is SmsProvider => (SMS_PROVIDERS as readonly unknown[]).includes(value);

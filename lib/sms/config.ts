import { z } from "zod";
import { SMS_PROVIDERS, type SmsProvider } from "./providerList";
import { msg91Sender } from "./providers/msg91";
import { TWILIO_SID, twilioSender } from "./providers/twilio";
import { SmsProviderError, type SmsSender } from "./providers/types";

/**
 * The fields and secrets of the SMS providers. Stored as one encrypted JSON value (`encryptInstanceConfigSecret`)
 * and never sent to the browser.
 */
export type SmsConfig = {
  twilioAccountSid?: string;
  /** The account auth token. Needed for delivery reports: Twilio signs them with it. */
  twilioAuthToken?: string;
  twilioApiKeySid?: string;
  twilioApiKeySecret?: string;
  twilioFrom?: string;
  twilioMessagingServiceSid?: string;
  msg91AuthKey?: string;
  msg91SenderId?: string;
  msg91TemplateId?: string;
  /** The token MSG91's delivery report address carries (`?token=`). */
  webhookSecret?: string;
};

export const SMS_SECRET_FIELDS = ["twilioAuthToken", "twilioApiKeySecret", "msg91AuthKey", "webhookSecret"] as const;
export const SMS_PLAIN_FIELDS = ["twilioAccountSid", "twilioApiKeySid", "twilioFrom", "twilioMessagingServiceSid", "msg91SenderId", "msg91TemplateId"] as const;

const plain = (max: number) => z.string().trim().max(max).optional();
const secret = z.string().max(500).optional();
const pattern = (value: string | undefined, test: RegExp) => !value || test.test(value);

/** What the settings form sends. Secrets left blank keep the saved ones; the other fields replace. */
export const smsDraftSchema = z.object({
  smsProvider: z.enum(SMS_PROVIDERS),
  twilioAccountSid: plain(64).refine((value) => pattern(value, TWILIO_SID), "Enter the account SID, which starts with AC"),
  twilioApiKeySid: plain(64).refine((value) => pattern(value, /^SK[0-9a-f]{32}$/i), "Enter the API key SID, which starts with SK"),
  twilioFrom: plain(20).refine((value) => pattern(value, /^\+[1-9]\d{6,14}$/), "Enter the sending number with its country code, such as +15551234567"),
  twilioMessagingServiceSid: plain(64).refine((value) => pattern(value, /^MG[0-9a-f]{32}$/i), "Enter the messaging service SID, which starts with MG"),
  msg91SenderId: plain(20).refine((value) => pattern(value, /^[A-Za-z0-9]{3,20}$/), "Use 3 to 20 letters and numbers"),
  msg91TemplateId: plain(64).refine((value) => pattern(value, /^[A-Za-z0-9_-]+$/), "Use letters, numbers, hyphens and underscores"),
  twilioAuthToken: secret,
  twilioApiKeySecret: secret,
  msg91AuthKey: secret,
  webhookSecret: secret.refine((value) => pattern(value, /^[A-Za-z0-9_-]{16,200}$/), "Use at least 16 letters, numbers, hyphens or underscores"),
});
export type SmsDraft = z.infer<typeof smsDraftSchema>;

/**
 * The secrets a draft must type again because the account they belong to changed: a saved Twilio auth token is never
 * reused with another account SID, nor an API key secret with another key SID. Hosts are fixed (Twilio, MSG91).
 */
export function smsSecretsToRetype(saved: SmsConfig, draft: SmsDraft): ("twilioAuthToken" | "twilioApiKeySecret")[] {
  if (draft.smsProvider !== "twilio") return [];
  const out: ("twilioAuthToken" | "twilioApiKeySecret")[] = [];
  if (saved.twilioAuthToken && !draft.twilioAuthToken && (draft.twilioAccountSid ?? "") !== (saved.twilioAccountSid ?? "")) out.push("twilioAuthToken");
  if (saved.twilioApiKeySecret && !draft.twilioApiKeySecret && ((draft.twilioApiKeySid ?? "") !== (saved.twilioApiKeySid ?? "") || (draft.twilioAccountSid ?? "") !== (saved.twilioAccountSid ?? ""))) out.push("twilioApiKeySecret");
  return out;
}

export const SMS_RETYPE_MESSAGE = "Enter the secret again: it is not reused when the account or key changes.";

/** The saved config with the draft applied: blank secrets keep their saved value (except as above), other fields are replaced. */
export function applySmsDraft(saved: SmsConfig, draft: SmsDraft): SmsConfig {
  const next: SmsConfig = { ...saved };
  for (const key of smsSecretsToRetype(saved, draft)) delete next[key];
  for (const key of SMS_PLAIN_FIELDS) {
    const value = draft[key];
    if (value) next[key] = value; else delete next[key];
  }
  for (const key of SMS_SECRET_FIELDS) if (draft[key]) next[key] = draft[key];
  return next;
}

/** Whether a provider has everything it needs to send. */
export function smsProviderReady(provider: SmsProvider, config: SmsConfig) {
  if (provider === "twilio") {
    const credentials = Boolean(config.twilioAuthToken || (config.twilioApiKeySid && config.twilioApiKeySecret));
    return Boolean(config.twilioAccountSid && credentials && (config.twilioFrom || config.twilioMessagingServiceSid));
  }
  return Boolean(config.msg91AuthKey && config.msg91TemplateId);
}

/** A sender for the provider. Throws SmsProviderError when its fields are incomplete. */
export function buildSmsSender(provider: SmsProvider, config: SmsConfig): SmsSender {
  if (!smsProviderReady(provider, config)) throw new SmsProviderError("This SMS provider is not fully set up.", false);
  if (provider === "twilio") {
    const useKey = Boolean(config.twilioApiKeySid && config.twilioApiKeySecret);
    return twilioSender({
      accountSid: config.twilioAccountSid!,
      secret: useKey ? config.twilioApiKeySecret! : config.twilioAuthToken!,
      apiKeySid: useKey ? config.twilioApiKeySid : undefined,
      from: config.twilioFrom,
      messagingServiceSid: config.twilioMessagingServiceSid,
    });
  }
  return msg91Sender({ authKey: config.msg91AuthKey!, templateId: config.msg91TemplateId!, senderId: config.msg91SenderId });
}

/** What the settings screen may show: plain fields and whether each secret is saved, never a secret. */
export function describeSmsConfig(config: SmsConfig) {
  return {
    twilioAccountSid: config.twilioAccountSid ?? "",
    twilioApiKeySid: config.twilioApiKeySid ?? "",
    twilioFrom: config.twilioFrom ?? "",
    twilioMessagingServiceSid: config.twilioMessagingServiceSid ?? "",
    msg91SenderId: config.msg91SenderId ?? "",
    msg91TemplateId: config.msg91TemplateId ?? "",
    hasTwilioAuthToken: Boolean(config.twilioAuthToken),
    hasTwilioApiKeySecret: Boolean(config.twilioApiKeySecret),
    hasMsg91AuthKey: Boolean(config.msg91AuthKey),
    hasWebhookSecret: Boolean(config.webhookSecret),
  };
}
export type SmsView = ReturnType<typeof describeSmsConfig>;

/** Which fields changed, by name only, for the audit record. */
export function changedSmsFields(before: SmsConfig, after: SmsConfig): string {
  return [...SMS_PLAIN_FIELDS, ...SMS_SECRET_FIELDS].filter((key) => before[key] !== after[key]).join(",");
}

export function parseSmsConfig(json: string | null | undefined): SmsConfig {
  if (!json) return {};
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" ? (value as SmsConfig) : {};
  } catch {
    return {};
  }
}

/** Saved fields, each falling back to its environment variable (Super admin settings win). */
export function smsConfigWithEnv(saved: SmsConfig, env: Record<string, string | undefined> = process.env): SmsConfig {
  const pick = (value: string | undefined, fallback: string | undefined) => value || fallback?.trim() || undefined;
  return {
    twilioAccountSid: pick(saved.twilioAccountSid, env.TWILIO_ACCOUNT_SID),
    twilioAuthToken: pick(saved.twilioAuthToken, env.TWILIO_AUTH_TOKEN),
    twilioApiKeySid: pick(saved.twilioApiKeySid, env.TWILIO_API_KEY_SID),
    twilioApiKeySecret: pick(saved.twilioApiKeySecret, env.TWILIO_API_KEY_SECRET),
    twilioFrom: pick(saved.twilioFrom, env.TWILIO_FROM),
    twilioMessagingServiceSid: pick(saved.twilioMessagingServiceSid, env.TWILIO_MESSAGING_SERVICE_SID),
    msg91AuthKey: pick(saved.msg91AuthKey, env.MSG91_AUTH_KEY),
    msg91SenderId: pick(saved.msg91SenderId, env.MSG91_SENDER_ID),
    msg91TemplateId: pick(saved.msg91TemplateId, env.MSG91_TEMPLATE_ID),
    webhookSecret: pick(saved.webhookSecret, env.SMS_WEBHOOK_SECRET),
  };
}

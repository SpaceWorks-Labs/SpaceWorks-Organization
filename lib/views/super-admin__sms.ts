import { requireSuperAdmin } from "@/lib/permissions";
import { absoluteUrl } from "@/lib/email/message";
import { describeSmsConfig, smsProviderReady } from "@/lib/sms/config";
import { getSmsSettings } from "@/lib/sms/settings";

/** The platform's SMS provider settings for the form: plain fields and which secrets are saved, never a secret. */
export async function loadInstanceSmsView() {
  await requireSuperAdmin();
  const settings = await getSmsSettings();
  const view = describeSmsConfig(settings.config);
  const { hasTwilioAuthToken, hasTwilioApiKeySecret, hasMsg91AuthKey, hasWebhookSecret, ...fields } = view;
  return {
    initial: { smsProvider: settings.provider ?? ("twilio" as const), ...fields },
    saved: { hasTwilioAuthToken, hasTwilioApiKeySecret, hasMsg91AuthKey, hasWebhookSecret },
    ready: settings.provider !== null && smsProviderReady(settings.provider, settings.config),
    webhookUrls: { twilio: absoluteUrl("/api/sms/webhooks/twilio"), msg91: absoluteUrl("/api/sms/webhooks/msg91") },
    verifiedAt: settings.verifiedAt?.toISOString() ?? null,
    lastError: settings.lastError,
  };
}

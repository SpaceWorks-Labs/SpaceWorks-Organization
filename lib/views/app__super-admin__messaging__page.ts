import { requireSuperAdmin } from "@/lib/permissions";
import { getSmsSettings } from "@/lib/sms/settings";
import { smsProviderReady } from "@/lib/sms/config";
import { platformMayBeUsed } from "@/lib/notify/store";
import { channelViews, whatsappTemplateRows } from "@/lib/notify/viewData";
import { paymentSecretsConfigured } from "@/lib/payments/secrets";

/** Super admin, Messaging: the platform's own channels, whether organisations may use them, and its WhatsApp templates. No secret is selected. */
export async function loadPlatformMessagingView() {
  await requireSuperAdmin();
  const [channels, templates, allowOrganisations, sms] = await Promise.all([channelViews(null, ["SMS"]), whatsappTemplateRows(null), platformMayBeUsed(), getSmsSettings()]);
  return {
    allowOrganisations,
    secretsReady: paymentSecretsConfigured(),
    channels,
    templates,
    // Text messages are set up under Auth (they also carry phone sign-in codes); shown here so the picture is whole.
    sms: { ready: sms.provider !== null && smsProviderReady(sms.provider, sms.config), failed: Boolean(sms.lastError) },
  };
}

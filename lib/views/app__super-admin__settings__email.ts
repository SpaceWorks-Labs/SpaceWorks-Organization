import { requireSuperAdmin } from "@/lib/permissions";
import { getEmailSettings } from "@/lib/instanceSettings";
import { absoluteUrl } from "@/lib/email/message";
import { describeConfig } from "@/lib/email/providerConfig";
import { prisma } from "@/lib/db";

/** The platform's email provider settings for the form: plain fields and which secrets are saved, never a secret. */
export async function loadInstanceEmailProviderView() {
  await requireSuperAdmin();
  const [settings, row] = await Promise.all([
    getEmailSettings(),
    prisma.instanceSetting.findUnique({ where: { id: "global" }, select: { emailVerifiedAt: true, emailLastError: true } }),
  ]);
  const { hasSesSecret, hasResendKey, hasPostmarkToken, hasWebhookSecret, ...fields } = describeConfig(settings.providerConfig ?? {});
  return {
    initial: { ...fields, emailProvider: settings.provider },
    saved: { hasSesSecret, hasResendKey, hasPostmarkToken, hasWebhookSecret },
    webhookUrls: { ses: absoluteUrl("/api/email/webhooks/ses"), resend: absoluteUrl("/api/email/webhooks/resend"), postmark: absoluteUrl("/api/email/webhooks/postmark") },
    verifiedAt: row?.emailVerifiedAt?.toISOString() ?? null,
    lastError: row?.emailLastError ?? null,
  };
}

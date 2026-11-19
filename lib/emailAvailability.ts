import "server-only";

import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID, emailProviderConfig } from "@/lib/instanceSettings";
import { decryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { parseConfig, providerReady } from "@/lib/email/providerConfig";
import type { EmailProvider } from "@/lib/email/providerList";

/**
 * Whether this installation can send email at all (product rules section 15, "Without email"): an email service
 * stored in Super admin settings or configured in the server's environment. It reads the instance email fields
 * generically; when a new provider type is added to the instance email settings, count it here.
 */
export async function isEmailServiceConfigured(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const row = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { smtpService: true, smtpHost: true, emailProvider: true, emailProviderConfigEncrypted: true } });
  const provider = (row?.emailProvider ?? env.EMAIL_PROVIDER ?? "smtp") as EmailProvider;
  if (provider !== "smtp") {
    let saved = {};
    try {
      saved = row?.emailProviderConfigEncrypted ? parseConfig(decryptInstanceConfigSecret(row.emailProviderConfigEncrypted)) : {};
    } catch {
      saved = {};
    }
    return providerReady(provider, emailProviderConfig(saved));
  }
  return Boolean(row?.smtpService || row?.smtpHost || env.SMTP_SERVICE?.trim() || env.SMTP_HOST?.trim());
}

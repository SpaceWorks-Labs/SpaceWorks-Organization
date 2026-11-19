import "server-only";

import { prisma } from "@/lib/db";
import { decryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { EMAIL_PROVIDERS, type EmailProvider } from "@/lib/email/providerList";
import { parseConfig, type ProviderConfig } from "@/lib/email/providerConfig";

export const INSTANCE_SETTINGS_ID = "global";

/** A missing singleton row intentionally preserves the historical default. */
export async function isNewUserRegistrationEnabled(): Promise<boolean> {
  const settings = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: { allowNewUserSignups: true },
  });
  return settings?.allowNewUserSignups ?? true;
}

/** Whether people can apply for a new organisation at /start. Platform admins can always create one. */
export async function isOrganisationApplicationsEnabled(): Promise<boolean> {
  const settings = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: { allowOrganisationApplications: true },
  });
  return settings?.allowOrganisationApplications ?? true;
}

export async function getEmailSettings() {
  const settings = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: {
      emailFrom: true, smtpService: true, smtpHost: true, smtpPort: true,
      smtpSecure: true, smtpUser: true, smtpPasswordEncrypted: true, smtpAllowUnauthenticated: true,
      emailProvider: true, emailProviderConfigEncrypted: true,
    },
  });
  const saved = settings?.emailProviderConfigEncrypted ? parseConfig(decryptInstanceConfigSecret(settings.emailProviderConfigEncrypted)) : {};
  const envProvider = process.env.EMAIL_PROVIDER as EmailProvider | undefined;
  const provider = (settings?.emailProvider ?? envProvider ?? "smtp") as EmailProvider;
  const configured = Boolean(settings?.smtpService || settings?.smtpHost);
  return {
    from: settings?.emailFrom ?? process.env.EMAIL_FROM ?? "Space Works Organization <noreply@localhost>",
    service: settings?.smtpService ?? process.env.SMTP_SERVICE,
    host: settings?.smtpHost ?? process.env.SMTP_HOST,
    port: settings?.smtpPort ?? parseInt(process.env.SMTP_PORT || "587", 10),
    secure: configured ? settings!.smtpSecure : process.env.SMTP_SECURE === "true",
    user: settings?.smtpUser ?? process.env.SMTP_USER,
    password: settings?.smtpPasswordEncrypted ? decryptInstanceConfigSecret(settings.smtpPasswordEncrypted) : process.env.SMTP_PASSWORD,
    provider: EMAIL_PROVIDERS.includes(provider) ? provider : "smtp",
    providerConfig: emailProviderConfig(saved),
    allowUnauthenticated: configured ? settings!.smtpAllowUnauthenticated : process.env.SMTP_ALLOW_UNAUTHENTICATED === "1",
  };
}

/** Saved provider fields, each falling back to its environment variable (Super admin → Settings wins). */
export function emailProviderConfig(saved: ProviderConfig): ProviderConfig {
  const env = process.env;
  const pick = (value: string | undefined, ...fallbacks: Array<string | undefined>) => value || fallbacks.find(Boolean) || undefined;
  return {
    sesRegion: pick(saved.sesRegion, env.AWS_SES_REGION, env.AWS_REGION),
    sesAccessKeyId: pick(saved.sesAccessKeyId, env.AWS_ACCESS_KEY_ID),
    sesSecretAccessKey: pick(saved.sesSecretAccessKey, env.AWS_SECRET_ACCESS_KEY),
    sesSessionToken: pick(saved.sesSessionToken, env.AWS_SESSION_TOKEN),
    sesTopicArn: pick(saved.sesTopicArn, env.SES_TOPIC_ARN),
    resendApiKey: pick(saved.resendApiKey, env.RESEND_API_KEY),
    postmarkServerToken: pick(saved.postmarkServerToken, env.POSTMARK_SERVER_TOKEN),
    postmarkMessageStream: pick(saved.postmarkMessageStream, env.POSTMARK_MESSAGE_STREAM) ?? "outbound",
    webhookSecret: pick(saved.webhookSecret, env.EMAIL_WEBHOOK_SECRET),
  };
}

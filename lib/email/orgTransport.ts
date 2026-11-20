import "server-only";

import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { decryptOrgSecret } from "@/lib/orgSecrets";
import { EMAIL_PROVIDERS, type EmailProvider } from "./providerList";
import { parseConfig, providerMailer, providerReady, type ProviderConfig } from "./providerConfig";
import type { Mailer } from "./providers/types";
import { withSuppression } from "./suppression";
import { assertPublicHost } from "@/lib/net/publicHost";
import { getEmailTransport } from "./transporter";

type Address = { name: string; address: string };

/** The bare address of a sender written as "Name <address>" or just "address". */
export function senderAddress(from: string) {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
}

/** A transport for the organisation's own SMTP settings. Throws when the host isn't public. */
async function organisationSmtpTransport(settings: { smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string | null; password: string | null }) {
  await assertPublicHost(settings.smtpHost);
  const production = process.env.NODE_ENV === "production";
  return nodemailer.createTransport({
    host: settings.smtpHost, port: settings.smtpPort, secure: settings.smtpSecure,
    auth: settings.smtpUser && settings.password ? { user: settings.smtpUser, pass: settings.password } : undefined,
    requireTLS: production && !settings.smtpSecure,
    tls: production ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
    disableFileAccess: true, disableUrlAccess: true,
    connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000,
  });
}

/** The organisation's saved provider fields, decrypted. Never leaves the server. */
export function orgProviderConfig(settings: { providerConfigEncrypted: string | null }, organisationId: string): ProviderConfig {
  return settings.providerConfigEncrypted ? parseConfig(decryptOrgSecret(settings.providerConfigEncrypted, organisationId, "email")) : {};
}

export function orgProvider(value: string): EmailProvider {
  return (EMAIL_PROVIDERS as readonly string[]).includes(value) ? (value as EmailProvider) : "smtp";
}

type OrgSettingsRow = { organisationId: string; emailProvider: string; providerConfigEncrypted: string | null; smtpHost: string | null; smtpPort: number; smtpSecure: boolean; smtpUser: string | null; smtpPasswordEncrypted: string | null };

/** The organisation's own transport for its saved settings, or null when its provider is not fully set up. */
export async function organisationMailer(settings: OrgSettingsRow, config?: ProviderConfig, password?: string | null): Promise<Mailer | null> {
  const provider = orgProvider(settings.emailProvider);
  if (provider !== "smtp") {
    const fields = config ?? orgProviderConfig(settings, settings.organisationId);
    return providerReady(provider, fields) ? withSuppression(providerMailer(provider, fields), settings.organisationId) : null;
  }
  if (!settings.smtpHost) return null;
  const secret = password !== undefined ? password : settings.smtpPasswordEncrypted ? decryptOrgSecret(settings.smtpPasswordEncrypted, settings.organisationId, "email") : null;
  return withSuppression(await organisationSmtpTransport({ ...settings, smtpHost: settings.smtpHost, password: secret }), settings.organisationId);
}

/**
 * How an email on behalf of an organisation goes out: through its own SMTP when it has set one up and turned it
 * on, otherwise through the platform's, from the platform address but in the organisation's name, with replies
 * to the organisation's contact email.
 */
export async function organisationEmailTransport(organisationId: string): Promise<{ transporter: Mailer | null; from: Address | string; replyTo?: string }> {
  const [settings, org] = await Promise.all([
    prisma.orgEmailSettings.findUnique({ where: { organisationId } }),
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, contactEmail: true } }),
  ]);
  const own = settings?.enabled && settings.fromAddress ? await organisationMailer(settings) : null;
  if (settings && own) {
    return {
      transporter: own,
      from: { name: settings.fromName || org?.name || "", address: settings.fromAddress! },
      replyTo: settings.replyTo ?? undefined,
    };
  }
  const platform = await getEmailTransport();
  return {
    transporter: platform.transporter,
    from: org ? { name: org.name, address: senderAddress(platform.from) } : platform.from,
    replyTo: org?.contactEmail ?? undefined,
  };
}

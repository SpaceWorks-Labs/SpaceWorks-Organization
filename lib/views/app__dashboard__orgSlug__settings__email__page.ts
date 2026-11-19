import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { getEmailSettings } from "@/lib/instanceSettings";
import { orgProvider, orgProviderConfig, senderAddress } from "@/lib/email/orgTransport";
import { describeConfig } from "@/lib/email/providerConfig";
import { absoluteUrl } from "@/lib/email/message";
import { EMAIL_TEMPLATE_KINDS, type EmailTemplateKind, type EmailTemplateText } from "@/lib/email/templates";

/**
 * The organisation's own email settings (never the saved password), what is used without them, and its own
 * wording for member emails (null: the standard wording).
 */
export async function loadOrgEmailSettingsView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "org.settings");
  const [org, settings, platform, templates] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, contactEmail: true } }),
    prisma.orgEmailSettings.findUnique({ where: { organisationId: organisation.id } }),
    getEmailSettings(),
    prisma.orgEmailTemplate.findMany({ where: { organisationId: organisation.id }, select: { kind: true, subject: true, heading: true, body: true } }),
  ]);
  const saved = Object.fromEntries(EMAIL_TEMPLATE_KINDS.map((kind) => {
    const row = templates.find((template) => template.kind === kind);
    return [kind, row ? { subject: row.subject, heading: row.heading, body: row.body } : null];
  })) as Record<EmailTemplateKind, EmailTemplateText | null>;
  const { hasSesSecret, hasResendKey, hasPostmarkToken, hasWebhookSecret, ...providerFields } = describeConfig(settings ? orgProviderConfig(settings, organisation.id) : {});
  const webhook = (provider: string) => absoluteUrl(`/api/email/webhooks/${provider}`) + `?org=${organisation.id}`;
  return {
    org,
    providerSaved: { hasSesSecret, hasResendKey, hasPostmarkToken, hasWebhookSecret },
    webhookUrls: { ses: webhook("ses"), resend: webhook("resend"), postmark: webhook("postmark") },
    canEdit: can(membership, "org.settings", { write: true }),
    platformSender: senderAddress(platform.from),
    templates: saved,
    settings: {
      ...providerFields,
      emailProvider: orgProvider(settings?.emailProvider ?? "smtp"),
      enabled: settings?.enabled ?? false,
      fromName: settings?.fromName ?? "",
      fromAddress: settings?.fromAddress ?? "",
      replyTo: settings?.replyTo ?? "",
      smtpHost: settings?.smtpHost ?? "",
      smtpPort: settings?.smtpPort ?? 587,
      smtpUser: settings?.smtpUser ?? "",
      hasPassword: Boolean(settings?.smtpPasswordEncrypted),
      verifiedAt: settings?.verifiedAt ?? null,
    },
  };
}

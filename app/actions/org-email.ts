"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { decryptOrgSecret, encryptOrgSecret } from "@/lib/orgSecrets";
import { assertPublicHost, PrivateHostError } from "@/lib/net/publicHost";
import { organisationMailer, orgProviderConfig } from "@/lib/email/orgTransport";
import { applyDraft, changedFields, providerDraftSchema, RETYPE_SECRET_MESSAGE, secretToRetype } from "@/lib/email/providerConfig";
import { EmailProviderError } from "@/lib/email/providers/types";
import { EmailSuppressedError } from "@/lib/email/suppression";
import { assertEmailAccepted } from "@/lib/email/transporter";
import { renderBrandedEmail } from "@/lib/email/message";
import { PaymentSecretsUnavailable } from "@/lib/payments/secrets";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const RETYPE_PASSWORD = "Enter the password again: it is not reused when the host, port or user changes.";

/** A saved SMTP password may be reused only for the target it was saved with: the same host, port and user. */
const sameSmtpTarget = (saved: { smtpHost: string | null; smtpPort: number; smtpUser: string | null }, target: { host: string | null | undefined; port: number; user: string | null | undefined }) =>
  (target.host ?? null) === saved.smtpHost && target.port === saved.smtpPort && (target.user ?? null) === saved.smtpUser;
const email = z.string().trim().toLowerCase().max(320).email("Enter an email address");
const optionalEmail = z.union([email, z.literal("")]).transform((value) => value || null);
const slugField = z.string().trim().min(1).max(64);
const host = z.string().trim().toLowerCase().max(253).regex(/^[a-z0-9.-]*$/, "Enter a host name, without a scheme or port");

const settingsSchema = providerDraftSchema.extend({
  organisationSlug: slugField,
  enabled: z.boolean(),
  fromName: z.string().trim().max(120),
  fromAddress: email,
  replyTo: optionalEmail,
  smtpHost: host.optional(),
  smtpPort: z.union([z.literal(25), z.literal(465), z.literal(587), z.literal(2525)]).default(587),
  smtpUser: z.string().trim().max(320).optional().transform((value) => value || null),
  /** Blank keeps the saved password. */
  smtpPassword: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.emailProvider === "smtp" && (value.smtpHost?.length ?? 0) < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["smtpHost"], message: "Enter the SMTP host" });
});

const testSchema = providerDraftSchema.extend({
  organisationSlug: slugField,
  smtpHost: host.optional(),
  smtpPort: z.union([z.literal(25), z.literal(465), z.literal(587), z.literal(2525)]).optional(),
  smtpUser: z.string().trim().max(320).optional(),
  smtpPassword: z.string().max(500).optional(),
});

async function access(slug: unknown, bucket: "action" | "testEmail" = "action") {
  const ctx = await orgActionAccess(slug, "org.settings");
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited(bucket, ctx.userId)) return { ok: false as const, error: bucket === "testEmail" ? "You've sent several tests. Try again in an hour." : "Too many requests. Try again shortly." };
  return ctx;
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof PrivateHostError || error instanceof PaymentSecretsUnavailable) return { ok: false, error: error.message };
  throw error;
}

/**
 * Save the organisation's own email: SMTP, Amazon SES, Resend or Postmark, with the sender. Secrets are
 * encrypted with the organisation's key and write-only (blank keeps the saved one). Port 465 uses implicit TLS.
 */
export async function saveOrgEmailSettings(input: unknown): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { organisationSlug: _, smtpPassword, smtpHost, smtpPort, smtpUser, enabled, fromName, fromAddress, replyTo, ...draft } = parsed.data;
  void _;
  let changed = "";
  try {
    const existing = await prisma.orgEmailSettings.findUnique({ where: { organisationId: ctx.organisation.id } });
    const before = existing ? orgProviderConfig(existing, ctx.organisation.id) : {};
    if (secretToRetype(before, draft)) return { ok: false, error: RETYPE_SECRET_MESSAGE, fieldErrors: { sesSecretAccessKey: [RETYPE_SECRET_MESSAGE] } };
    const after = applyDraft(before, draft);
    changed = changedFields(before, after);
    const smtpUsesSaved = Boolean(existing?.smtpPasswordEncrypted) && !smtpPassword;
    const reusable = !existing || sameSmtpTarget(existing, { host: smtpHost, port: smtpPort, user: smtpUser });
    if (draft.emailProvider === "smtp" && smtpHost && smtpUsesSaved && !reusable && smtpUser) return { ok: false, error: RETYPE_PASSWORD, fieldErrors: { smtpPassword: [RETYPE_PASSWORD] } };
    const smtp: { smtpHost?: string; smtpPort?: number; smtpUser?: string | null; smtpSecure?: boolean; smtpPasswordEncrypted?: string | null } = draft.emailProvider === "smtp" && smtpHost
      ? { smtpHost, smtpPort, smtpUser, smtpSecure: smtpPort === 465, ...(smtpPassword ? { smtpPasswordEncrypted: encryptOrgSecret(smtpPassword, ctx.organisation.id, "email") } : smtpUsesSaved && !reusable ? { smtpPasswordEncrypted: null } : {}) }
      : {};
    if (smtp.smtpHost) await assertPublicHost(smtp.smtpHost);
    const values = { enabled, fromName, fromAddress, replyTo, emailProvider: draft.emailProvider, providerConfigEncrypted: encryptOrgSecret(JSON.stringify(after), ctx.organisation.id, "email"), ...smtp, verifiedAt: null };
    await prisma.orgEmailSettings.upsert({ where: { organisationId: ctx.organisation.id }, create: { organisationId: ctx.organisation.id, ...values }, update: values });
  } catch (error) {
    return failure(error);
  }
  const fields = [changed, smtpPassword ? "smtpPassword" : ""].filter(Boolean).join(",");
  await recordAuditEvent({ action: "ORG_EMAIL_SETTINGS_SAVED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Organisation", targetId: ctx.organisation.id, metadata: { enabled, provider: draft.emailProvider, changed: fields } });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/email`);
  return { ok: true };
}

/**
 * Send a test message to the person testing, through what is on the form (saved secrets fill the blanks), before
 * anything is saved. A test of what is already saved is kept as the last test that went through.
 */
export async function sendOrgTestEmail(input: unknown): Promise<ActionResult> {
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the email settings." };
  const ctx = await access(parsed.data.organisationSlug, "testEmail");
  if (!ctx.ok) return ctx;
  const [saved, user] = await Promise.all([
    prisma.orgEmailSettings.findUnique({ where: { organisationId: ctx.organisation.id } }),
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true } }),
  ]);
  if (!saved?.fromAddress || !user?.email) return { ok: false, error: "Save the sender address first." };
  const { organisationSlug: _, smtpHost, smtpPort, smtpUser, smtpPassword, ...draft } = parsed.data;
  void _;
  try {
    const before = orgProviderConfig(saved, ctx.organisation.id);
    if (secretToRetype(before, draft)) return { ok: false, error: RETYPE_SECRET_MESSAGE, fieldErrors: { sesSecretAccessKey: [RETYPE_SECRET_MESSAGE] } };
    const after = applyDraft(before, draft);
    const port = smtpPort ?? saved.smtpPort;
    // The saved password goes only to the host, port and user it was saved with.
    const reusable = sameSmtpTarget(saved, { host: smtpHost || saved.smtpHost, port, user: smtpUser ?? saved.smtpUser });
    if (draft.emailProvider === "smtp" && !smtpPassword && saved.smtpPasswordEncrypted && !reusable && (smtpUser ?? saved.smtpUser)) return { ok: false, error: RETYPE_PASSWORD, fieldErrors: { smtpPassword: [RETYPE_PASSWORD] } };
    const password = smtpPassword || (saved.smtpPasswordEncrypted && reusable ? decryptOrgSecret(saved.smtpPasswordEncrypted, ctx.organisation.id, "email") : null);
    const mailer = await organisationMailer({ ...saved, emailProvider: draft.emailProvider, smtpHost: smtpHost || saved.smtpHost, smtpPort: port, smtpSecure: port === 465, smtpUser: smtpUser ?? saved.smtpUser }, after, password);
    if (!mailer) return { ok: false, error: "This provider isn't fully set up yet. Fill in its fields first." };
    const { html, text } = renderBrandedEmail({ subject: "", heading: "Test email", paragraphs: [`This came through ${ctx.organisation.name}'s own email settings. Member emails will be sent this way once they're switched on.`] });
    try {
      assertEmailAccepted(await mailer.sendMail({ from: { name: saved.fromName || ctx.organisation.name, address: saved.fromAddress }, replyTo: saved.replyTo ?? undefined, to: user.email, subject: `${ctx.organisation.name}: test email`, text, html }));
    } finally {
      mailer.close?.();
    }
    const unchanged = draft.emailProvider === saved.emailProvider && changedFields(before, after) === "" && !smtpPassword && (!smtpHost || smtpHost === saved.smtpHost) && port === saved.smtpPort && (smtpUser ?? saved.smtpUser) === saved.smtpUser;
    if (unchanged) await prisma.orgEmailSettings.update({ where: { organisationId: ctx.organisation.id }, data: { verifiedAt: new Date() } });
  } catch (error) {
    if (error instanceof PrivateHostError || error instanceof PaymentSecretsUnavailable || error instanceof EmailProviderError || error instanceof EmailSuppressedError) return { ok: false, error: error.message };
    return { ok: false, error: "The provider did not accept the test. Check the fields and try again." };
  }
  await recordAuditEvent({ action: "ORG_EMAIL_TEST_SENT", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Organisation", targetId: ctx.organisation.id, metadata: { provider: draft.emailProvider } });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/email`);
  return { ok: true };
}

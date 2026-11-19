"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { decryptInstanceConfigSecret, encryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { emailProviderConfig, getEmailSettings, INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { requireSuperAdmin } from "@/lib/permissions";
import { applyDraft, changedFields, parseConfig, providerDraftSchema, RETYPE_SECRET_MESSAGE, secretToRetype } from "@/lib/email/providerConfig";
import { EMAIL_PROVIDER_LABELS } from "@/lib/email/providerList";
import { EmailProviderError } from "@/lib/email/providers/types";
import { EmailSuppressedError } from "@/lib/email/suppression";
import { assertEmailAccepted, buildPlatformMailer } from "@/lib/email/transporter";
import { renderBrandedEmail } from "@/lib/email/message";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

async function savedConfig() {
  const row = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { emailProviderConfigEncrypted: true } });
  return parseConfig(row?.emailProviderConfigEncrypted ? decryptInstanceConfigSecret(row.emailProviderConfigEncrypted) : null);
}

/**
 * Choose the platform's email provider and save its fields. Secrets are encrypted and write-only: one left
 * blank keeps the saved value. SMTP itself is saved with the SMTP settings. Audited by field name only.
 */
export async function saveInstanceEmailProvider(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = providerDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the email provider settings." };
  const before = await savedConfig();
  if (secretToRetype(before, parsed.data)) return { ok: false, error: RETYPE_SECRET_MESSAGE, fieldErrors: { sesSecretAccessKey: [RETYPE_SECRET_MESSAGE] } };
  const after = applyDraft(before, parsed.data);
  const values = { emailProvider: parsed.data.emailProvider, emailProviderConfigEncrypted: encryptInstanceConfigSecret(JSON.stringify(after)), emailVerifiedAt: null, emailLastError: null };
  await prisma.instanceSetting.upsert({ where: { id: INSTANCE_SETTINGS_ID }, create: { id: INSTANCE_SETTINGS_ID, ...values }, update: values });
  await recordAuditEvent({ action: "INSTANCE_EMAIL_PROVIDER_UPDATED", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID, metadata: { provider: parsed.data.emailProvider, changed: changedFields(before, after) } });
  revalidatePath("/super-admin/settings");
  revalidatePath("/super-admin/email");
  revalidatePath("/super-admin/operations");
  return { ok: true };
}

/**
 * Send a test message to the person testing, through what is on the form (saved secrets fill the blanks), before
 * anything is saved. When the form matches what is saved, the result is also kept as the provider's health.
 */
export async function sendInstanceTestEmail(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("testEmail", session.user.id)) return { ok: false, error: "You've sent several tests. Try again in an hour." };
  const parsed = providerDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the email provider settings." };
  const settings = await getEmailSettings();
  const saved = await savedConfig();
  if (secretToRetype(saved, parsed.data)) return { ok: false, error: RETYPE_SECRET_MESSAGE, fieldErrors: { sesSecretAccessKey: [RETYPE_SECRET_MESSAGE] } };
  const current = emailProviderConfig(saved);
  const applied = applyDraft(current, parsed.data);
  const unchanged = parsed.data.emailProvider === settings.provider && JSON.stringify(applied) === JSON.stringify(current);
  const mailer = buildPlatformMailer({ ...settings, provider: parsed.data.emailProvider, providerConfig: applied });
  if (!mailer) return { ok: false, error: "This provider isn't fully set up yet. Fill in its fields first." };
  let failure: string | null = null;
  try {
    const { html, text } = renderBrandedEmail({ subject: "", heading: "Test email", paragraphs: ["This came through the platform's email settings. Account and team emails will be sent this way."] });
    assertEmailAccepted(await mailer.sendMail({ from: settings.from, to: session.user.email, subject: "Space Works Organization: test email", text, html }));
  } catch (error) {
    failure = error instanceof EmailProviderError || error instanceof EmailSuppressedError ? error.message : "The provider did not accept the test. Check the fields and try again.";
  } finally {
    mailer.close?.();
  }
  if (unchanged) await prisma.instanceSetting.updateMany({ where: { id: INSTANCE_SETTINGS_ID }, data: failure ? { emailLastError: failure } : { emailVerifiedAt: new Date(), emailLastError: null } });
  await recordAuditEvent({ action: "INSTANCE_EMAIL_TEST_SENT", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID, metadata: { provider: EMAIL_PROVIDER_LABELS[parsed.data.emailProvider], ok: !failure } });
  revalidatePath("/super-admin/settings");
  revalidatePath("/super-admin/email");
  return failure ? { ok: false, error: failure } : { ok: true };
}

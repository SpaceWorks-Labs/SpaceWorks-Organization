"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { z } from "zod";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { invalidateLoginMethodsCache } from "@/lib/loginMethods";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { encryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { requireSuperAdmin } from "@/lib/permissions";
import { applySmsDraft, buildSmsSender, changedSmsFields, SMS_RETYPE_MESSAGE, smsConfigWithEnv, smsDraftSchema, smsProviderReady, smsSecretsToRetype } from "@/lib/sms/config";
import { parsePhone } from "@/lib/sms/phone";
import { SMS_PROVIDER_LABELS } from "@/lib/sms/providerList";
import { SmsProviderError } from "@/lib/sms/providers/types";
import { SMS_BRAND } from "@/lib/sms/outbox";
import { getSmsSettings, savedSmsConfig } from "@/lib/sms/settings";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const testSchema = z.object({ draft: smsDraftSchema, phone: z.string().trim().max(40) });

/**
 * Choose the platform's SMS provider and save its fields. Secrets are encrypted and write-only: one left blank keeps
 * the saved value. Audited by field name only.
 */
export async function saveInstanceSmsProvider(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = smsDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the SMS provider settings." };
  const before = await savedSmsConfig();
  const retype = smsSecretsToRetype(before, parsed.data);
  if (retype.length) return { ok: false, error: SMS_RETYPE_MESSAGE, fieldErrors: Object.fromEntries(retype.map((field) => [field, [SMS_RETYPE_MESSAGE]])) };
  const after = applySmsDraft(before, parsed.data);
  const values = { smsProvider: parsed.data.smsProvider, smsConfigEncrypted: encryptInstanceConfigSecret(JSON.stringify(after)), smsVerifiedAt: null, smsLastError: null };
  await prisma.instanceSetting.upsert({ where: { id: INSTANCE_SETTINGS_ID }, create: { id: INSTANCE_SETTINGS_ID, ...values }, update: values });
  await recordAuditEvent({ action: "INSTANCE_SMS_PROVIDER_UPDATED", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID, metadata: { provider: parsed.data.smsProvider, changed: changedSmsFields(before, after) } });
  revalidatePath("/super-admin/auth");
  invalidateLoginMethodsCache();
  revalidatePath("/login");
  return { ok: true };
}

/**
 * Send a test text to the number the person types, through what is on the form (saved secrets fill the blanks), before
 * anything is saved. The number is used once: it is not stored or audited. When the form matches what is saved, the
 * result is also kept as the provider's health.
 */
export async function sendInstanceTestSms(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("testEmail", session.user.id)) return { ok: false, error: "You've sent several tests. Try again in an hour." };
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the SMS provider settings." };
  const phone = parsePhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "Enter the number to send the test to, with its country code, such as +91 98765 43210." };
  const settings = await getSmsSettings();
  const { draft } = parsed.data;
  const retype = smsSecretsToRetype(settings.saved, draft);
  if (retype.length) return { ok: false, error: SMS_RETYPE_MESSAGE, fieldErrors: Object.fromEntries(retype.map((field) => [field, [SMS_RETYPE_MESSAGE]])) };
  const applied = smsConfigWithEnv(applySmsDraft(settings.saved, draft));
  const unchanged = draft.smsProvider === settings.provider && JSON.stringify(applied) === JSON.stringify(settings.config);
  if (!smsProviderReady(draft.smsProvider, applied)) return { ok: false, error: "This provider isn't fully set up yet. Fill in its fields first." };
  let failure: string | null = null;
  try {
    await buildSmsSender(draft.smsProvider, applied).send({ to: phone.e164, text: `Test from ${SMS_BRAND}. Phone codes will be sent this way.`, code: "000000", brand: SMS_BRAND });
  } catch (error) {
    failure = error instanceof SmsProviderError ? error.message : "The provider did not accept the test. Check the fields and try again.";
  }
  if (unchanged) await prisma.instanceSetting.updateMany({ where: { id: INSTANCE_SETTINGS_ID }, data: failure ? { smsLastError: failure } : { smsVerifiedAt: new Date(), smsLastError: null } });
  await recordAuditEvent({ action: "INSTANCE_SMS_TEST_SENT", actorUserId: session.user.id, targetType: "InstanceSetting", targetId: INSTANCE_SETTINGS_ID, metadata: { provider: SMS_PROVIDER_LABELS[draft.smsProvider], ok: !failure } });
  revalidatePath("/super-admin/auth");
  return failure ? { ok: false, error: failure } : { ok: true };
}

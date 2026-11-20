"use server";

import { z } from "zod";
import { importPKCS8 } from "jose";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { invalidateLoginMethodsCache } from "@/lib/loginMethods";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { requireSuperAdmin } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { encryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const text = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const secret = z.string().max(4096).optional().transform((value) => value?.trim() || null);

const schema = z.object({
  googleClientId: text(320),
  googleClientSecret: secret,
  githubClientId: text(320),
  githubClientSecret: secret,
  appleClientId: text(320),
  appleTeamId: text(20),
  appleKeyId: text(20),
  applePrivateKey: secret,
});

/**
 * Save the Google, GitHub and Apple sign-in settings. Secrets are write-only: a blank secret keeps the
 * stored one, and clearing a client id switches that provider off.
 */
export async function saveSignInProviders(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Try again shortly." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the provider settings." };
  const value = parsed.data;
  const existing = await prisma.instanceSetting.findUnique({
    where: { id: INSTANCE_SETTINGS_ID },
    select: { googleClientSecretEncrypted: true, githubClientSecretEncrypted: true, applePrivateKeyEncrypted: true },
  });
  if (value.googleClientId && !value.googleClientSecret && !existing?.googleClientSecretEncrypted) return { ok: false, error: "Enter the Google client secret." };
  if (value.githubClientId && !value.githubClientSecret && !existing?.githubClientSecretEncrypted) return { ok: false, error: "Enter the GitHub client secret." };
  if (value.appleClientId) {
    if (!value.appleTeamId || !value.appleKeyId) return { ok: false, error: "Apple needs the Services ID, Team ID and Key ID." };
    if (!value.applePrivateKey && !existing?.applePrivateKeyEncrypted) return { ok: false, error: "Paste the Apple .p8 private key." };
    if (value.applePrivateKey) {
      try {
        await importPKCS8(value.applePrivateKey.replace(/\\n/g, "\n"), "ES256");
      } catch {
        return { ok: false, error: "That Apple private key couldn't be read. Paste the whole .p8 file, including its BEGIN and END lines." };
      }
    }
  }

  const fields = {
    googleClientId: value.googleClientId,
    githubClientId: value.githubClientId,
    appleClientId: value.appleClientId,
    appleTeamId: value.appleTeamId,
    appleKeyId: value.appleKeyId,
    ...(value.googleClientSecret ? { googleClientSecretEncrypted: encryptInstanceConfigSecret(value.googleClientSecret) } : {}),
    ...(value.githubClientSecret ? { githubClientSecretEncrypted: encryptInstanceConfigSecret(value.githubClientSecret) } : {}),
    ...(value.applePrivateKey ? { applePrivateKeyEncrypted: encryptInstanceConfigSecret(value.applePrivateKey) } : {}),
  };
  await prisma.instanceSetting.upsert({ where: { id: INSTANCE_SETTINGS_ID }, create: { id: INSTANCE_SETTINGS_ID, ...fields }, update: fields });
  await recordAuditEvent({
    action: "SIGN_IN_PROVIDERS_UPDATED",
    actorUserId: session.user.id,
    targetType: "InstanceSetting",
    targetId: INSTANCE_SETTINGS_ID,
    metadata: { google: Boolean(value.googleClientId), github: Boolean(value.githubClientId), apple: Boolean(value.appleClientId) },
  });
  invalidateLoginMethodsCache();
  revalidatePath("/login");
  revalidatePath("/super-admin/settings");
  return { ok: true };
}

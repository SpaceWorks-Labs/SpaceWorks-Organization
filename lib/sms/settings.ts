import "server-only";

import { prisma } from "@/lib/db";
import { decryptInstanceConfigSecret } from "@/lib/instanceConfigSecrets";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { buildSmsSender, parseSmsConfig, smsConfigWithEnv, smsProviderReady, type SmsConfig } from "./config";
import { isSmsProvider, type SmsProvider } from "./providerList";
import type { SmsSender } from "./providers/types";

/** The platform's saved fields only (without the environment), for the settings form to apply a draft to. */
export async function savedSmsConfig(): Promise<SmsConfig> {
  const row = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { smsConfigEncrypted: true } });
  return parseSmsConfig(row?.smsConfigEncrypted ? decryptInstanceConfigSecret(row.smsConfigEncrypted) : null);
}

/** The chosen provider and its fields, each falling back to the environment. Null provider means none is chosen. */
export async function getSmsSettings(): Promise<{ provider: SmsProvider | null; config: SmsConfig; saved: SmsConfig; verifiedAt: Date | null; lastError: string | null }> {
  const row = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { smsProvider: true, smsConfigEncrypted: true, smsVerifiedAt: true, smsLastError: true } });
  const saved = parseSmsConfig(row?.smsConfigEncrypted ? decryptInstanceConfigSecret(row.smsConfigEncrypted) : null);
  const choice = row?.smsProvider ?? process.env.SMS_PROVIDER;
  return { provider: isSmsProvider(choice) ? choice : null, config: smsConfigWithEnv(saved), saved, verifiedAt: row?.smsVerifiedAt ?? null, lastError: row?.smsLastError ?? null };
}

/** Whether an SMS provider is chosen and has what it needs. Independent of email, so phone codes work without it. */
export async function isSmsConfigured(): Promise<boolean> {
  const { provider, config } = await getSmsSettings();
  return provider !== null && smsProviderReady(provider, config);
}

/** The sender for the platform's provider, or null when none is set up. */
export async function platformSmsSender(): Promise<{ sender: SmsSender; provider: SmsProvider; config: SmsConfig } | null> {
  const { provider, config } = await getSmsSettings();
  if (!provider || !smsProviderReady(provider, config)) return null;
  return { sender: buildSmsSender(provider, config), provider, config };
}

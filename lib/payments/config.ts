import "server-only";

import crypto from "crypto";
import type { GatewayProvider, OrgPaymentSettings, PaymentProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { GatewayCredentials, PaymentGateway } from "./gateway";
import { razorpay } from "./razorpay";
import { decryptPaymentSecret, encryptPaymentSecret } from "./secrets";
import { stripe } from "./stripe";

export const GATEWAYS: Record<Exclude<GatewayProvider, "NONE">, PaymentGateway> = { RAZORPAY: razorpay, STRIPE: stripe };

/** Currencies each gateway takes. Razorpay's international currencies depend on the account; offline takes any. */
const RAZORPAY_CURRENCIES = new Set(["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "NZD", "LKR", "BDT", "NPR", "QAR", "SAR", "OMR", "KWD", "BHD", "MYR", "ZAR", "JPY"]);

export function gatewayTakes(provider: GatewayProvider, currency: string) {
  if (provider === "NONE") return false;
  return provider === "STRIPE" || RAZORPAY_CURRENCIES.has(currency);
}

function newWebhookCode() {
  return crypto.randomBytes(24).toString("base64url");
}

/** The organisation's settings row, created on first use with a fresh webhook code. */
export async function ensurePaymentSettings(organisationId: string) {
  const existing = await prisma.orgPaymentSettings.findUnique({ where: { organisationId } });
  if (existing) return existing;
  return prisma.orgPaymentSettings.upsert({ where: { organisationId }, create: { organisationId, webhookPublicCode: newWebhookCode() }, update: {} });
}

export function credentialsOf(settings: OrgPaymentSettings): GatewayCredentials | null {
  if (settings.provider === "NONE" || !settings.secretEncrypted) return null;
  return {
    keyId: settings.keyId,
    secret: decryptPaymentSecret(settings.secretEncrypted, settings.organisationId),
    webhookSecret: settings.webhookSecretEncrypted ? decryptPaymentSecret(settings.webhookSecretEncrypted, settings.organisationId) : null,
    testMode: settings.testMode,
  };
}

/** The organisation's live gateway, or null when online payments are off or keys are missing. */
export async function loadGateway(organisationId: string) {
  const settings = await prisma.orgPaymentSettings.findUnique({ where: { organisationId } });
  if (!settings || settings.provider === "NONE") return null;
  const credentials = credentialsOf(settings);
  if (!credentials) return null;
  return { provider: settings.provider as Exclude<GatewayProvider, "NONE">, gateway: GATEWAYS[settings.provider as Exclude<GatewayProvider, "NONE">], credentials, settings };
}

type GatewayKeysInput = { provider: GatewayProvider; keyId?: string | null; secret?: string | null; webhookSecret?: string | null; testMode: boolean };

/**
 * Save gateway keys. A blank secret keeps the saved one, so managers never have to re-enter it to change
 * other fields. Switching provider clears the old keys.
 */
export async function savePaymentKeys(organisationId: string, input: GatewayKeysInput) {
  const current = await ensurePaymentSettings(organisationId);
  const switching = current.provider !== input.provider;
  const encrypt = (value: string | null | undefined, previous: string | null) => (value ? encryptPaymentSecret(value, organisationId) : switching ? null : previous);
  return prisma.orgPaymentSettings.update({
    where: { organisationId },
    data: {
      provider: input.provider,
      keyId: input.provider === "RAZORPAY" ? input.keyId?.trim() || (switching ? null : current.keyId) : null,
      secretEncrypted: input.provider === "NONE" ? null : encrypt(input.secret?.trim(), current.secretEncrypted),
      webhookSecretEncrypted: input.provider === "NONE" ? null : encrypt(input.webhookSecret?.trim(), current.webhookSecretEncrypted),
      testMode: input.testMode,
      verifiedAt: switching || input.secret || input.keyId ? null : current.verifiedAt,
    },
  });
}

/** Whether a key looks like a test key, so the badge matches what the provider will do. */
export function looksLikeTestKey(provider: PaymentProvider | GatewayProvider, keyIdOrSecret: string) {
  if (provider === "RAZORPAY") return keyIdOrSecret.startsWith("rzp_test_");
  if (provider === "STRIPE") return keyIdOrSecret.startsWith("sk_test_") || keyIdOrSecret.startsWith("rk_test_");
  return false;
}

export function webhookPath(provider: Exclude<GatewayProvider, "NONE">, code: string) {
  return `/api/webhooks/${provider.toLowerCase()}/${code}`;
}
